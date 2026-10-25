import type { InboxSplit } from "../bookmarks/inbox";
import type { Bookmark, Folder } from "../bookmarks/types";
import type { EmbedOptions, Embedder } from "./embedder";
import {
  checkAcceptance,
  evaluateLeaveOneOut,
  type AcceptanceCheck,
  type EvaluationReport,
} from "./evaluation";
import {
  DEFAULT_MATCHER_OPTIONS,
  classifyItems,
  type Decision,
  type MatcherOptions,
} from "./matcher";
import { DEFAULT_PROFILE_OPTIONS, buildFolderProfiles, selectExamples } from "./profiles";
import { bookmarkText, folderText } from "./text";

/** Un preferito dell'inbox con la proposta del classificatore. */
export interface ProposalRow {
  bookmark: Bookmark;
  decision: Decision;
  /** Punteggio della prima candidata (valore iniziale non calibrato). */
  score: number;
  /** Distacco tra prima e seconda candidata. */
  margin: number;
  /** Cartella più vicina; null solo se non esiste nessuna cartella di destinazione. */
  best: Folder | null;
  /** Altre cartelle candidate, dalla migliore. */
  alternatives: Folder[];
}

export interface SortResult {
  /** Proposte con buona fiducia, dal punteggio più alto. */
  assigned: ProposalRow[];
  /** Elementi per cui nessuna cartella è abbastanza vicina o sicura: da rivedere. */
  uncertain: ProposalRow[];
  evaluation: EvaluationReport;
  acceptance: AcceptanceCheck[];
  textsEmbedded: number;
  elapsedMs: number;
}

export interface SortProgress {
  phase: "folders" | "inbox";
  done: number;
  total: number;
}

export interface SortOptions {
  matcher?: MatcherOptions;
  signal?: AbortSignal;
  onProgress?: (progress: SortProgress) => void;
  /** Lotti piccoli: il modello nel browser blocca la pagina per tutta la durata di un lotto. */
  batchSize?: number;
}

/**
 * Quanti testi distinti andranno trasformati in vettori (nomi delle cartelle, esempi, inbox).
 * Serve a stimare il tempo prima di cominciare.
 */
export function countTextsToEmbed(split: InboxSplit): number {
  const byFolder = new Map<string, Bookmark[]>();
  for (const bookmark of split.reference) {
    const list = byFolder.get(bookmark.folderId);
    if (list) list.push(bookmark);
    else byFolder.set(bookmark.folderId, [bookmark]);
  }
  const texts = new Set<string>();
  for (const folder of split.destinationFolders) {
    texts.add(folderText(folder));
    const examples = selectExamples(
      byFolder.get(folder.id) ?? [],
      DEFAULT_PROFILE_OPTIONS.maxExamplesPerFolder,
    );
    for (const example of examples) texts.add(bookmarkText(example));
  }
  for (const item of split.inbox) texts.add(bookmarkText(item));
  return texts.size;
}

const byScoreDesc = (a: ProposalRow, b: ProposalRow): number =>
  b.score - a.score || a.bookmark.id.localeCompare(b.bookmark.id, "en", { numeric: true });

/**
 * Smista l'inbox: costruisce i profili delle cartelle di destinazione, classifica ogni
 * preferito e calcola la valutazione "nascondi e ritrova" sugli stessi profili.
 * Non modifica nulla: restituisce solo proposte.
 */
export async function sortInbox(
  split: InboxSplit,
  embedder: Embedder,
  options: SortOptions = {},
): Promise<SortResult> {
  const started = performance.now();
  const matcher = options.matcher ?? DEFAULT_MATCHER_OPTIONS;
  const embedOptions = (phase: SortProgress["phase"]): EmbedOptions => ({
    batchSize: options.batchSize ?? 8,
    yieldBetweenBatches: true,
    ...(options.signal ? { signal: options.signal } : {}),
    onProgress: (done, total) => options.onProgress?.({ phase, done, total }),
  });

  const { profiles, textsEmbedded } = await buildFolderProfiles(
    split.destinationFolders,
    split.reference,
    embedder,
    DEFAULT_PROFILE_OPTIONS,
    embedOptions("folders"),
  );
  const classifications = await classifyItems(
    split.inbox,
    profiles,
    embedder,
    matcher,
    embedOptions("inbox"),
  );

  const folderById = new Map(split.destinationFolders.map((f) => [f.id, f]));
  const bookmarkById = new Map(split.inbox.map((b) => [b.id, b]));
  const rows: ProposalRow[] = classifications.map((c) => {
    const folders = c.candidates
      .map((candidate) => folderById.get(candidate.folderId))
      .filter((f): f is Folder => f !== undefined);
    return {
      bookmark: bookmarkById.get(c.bookmarkId)!,
      decision: c.decision,
      score: c.best?.score ?? 0,
      margin: c.margin,
      best: folders[0] ?? null,
      alternatives: folders.slice(1),
    };
  });

  const evaluation = evaluateLeaveOneOut(profiles, matcher);
  return {
    assigned: rows.filter((r) => r.decision === "assign").sort(byScoreDesc),
    uncertain: rows.filter((r) => r.decision === "uncertain").sort(byScoreDesc),
    evaluation,
    acceptance: checkAcceptance(evaluation),
    textsEmbedded,
    elapsedMs: performance.now() - started,
  };
}
