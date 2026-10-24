import type { Bookmark } from "../bookmarks/types";
import { embedMany, type EmbedOptions, type Embedder } from "./embedder";
import { bookmarkText } from "./text";
import { similarity, topKMean } from "./vector";

/** Una cartella di destinazione vista dal classificatore. */
export interface FolderProfile {
  folderId: string;
  path: string[];
  /** Vettore del nome/percorso della cartella. */
  nameVector: Float32Array;
  /** Preferiti già dentro la cartella, usati come esempi. */
  examples: Array<{ bookmarkId: string; vector: Float32Array }>;
}

/**
 * Parametri del confronto. I valori predefiniti sono INIZIALI: vanno calibrati con la
 * valutazione sui dati veri dell'utente (vedi evaluation.ts), non sono stati misurati.
 */
export interface MatcherOptions {
  /** Quante cartelle candidate restituire per elemento. */
  topK: number;
  /** Peso della somiglianza con il nome della cartella (quando ha esempi). */
  nameWeight: number;
  /** Quanti esempi, i più simili, entrano nella media. */
  exampleK: number;
  /** Punteggio minimo della prima candidata per proporla con sicurezza. */
  minScore: number;
  /** Distacco minimo tra prima e seconda candidata per proporla con sicurezza. */
  minMargin: number;
}

export const DEFAULT_MATCHER_OPTIONS: MatcherOptions = {
  topK: 3,
  nameWeight: 0.35,
  exampleK: 3,
  minScore: 0.8,
  minMargin: 0.02,
};

export interface Candidate {
  folderId: string;
  score: number;
  nameSimilarity: number;
  /** null se la cartella non ha esempi (conta solo il nome). */
  exampleSimilarity: number | null;
}

/** Un esempio da non considerare (serve alla valutazione "nascondi e ritrova"). */
export interface ExcludedExample {
  folderId: string;
  exampleIndex: number;
}

/** Candidate ordinate dalla migliore; a parità di punteggio vince l'id più piccolo. */
export function scoreFolders(
  vector: Float32Array,
  profiles: FolderProfile[],
  options: MatcherOptions,
  exclude?: ExcludedExample,
): Candidate[] {
  const candidates: Candidate[] = profiles.map((profile) => {
    const nameSimilarity = similarity(vector, profile.nameVector);
    const sims: number[] = [];
    profile.examples.forEach((example, index) => {
      if (exclude && exclude.folderId === profile.folderId && exclude.exampleIndex === index) {
        return;
      }
      sims.push(similarity(vector, example.vector));
    });
    if (sims.length === 0) {
      return { folderId: profile.folderId, score: nameSimilarity, nameSimilarity, exampleSimilarity: null };
    }
    const exampleSimilarity = topKMean(sims, options.exampleK);
    const score = options.nameWeight * nameSimilarity + (1 - options.nameWeight) * exampleSimilarity;
    return { folderId: profile.folderId, score, nameSimilarity, exampleSimilarity };
  });

  candidates.sort((a, b) => b.score - a.score || a.folderId.localeCompare(b.folderId));
  return candidates.slice(0, Math.max(1, options.topK));
}

export type Decision = "assign" | "uncertain";

export interface Verdict {
  best: Candidate | null;
  /** Distacco tra prima e seconda candidata (con una sola candidata, il suo punteggio). */
  margin: number;
  decision: Decision;
}

export function decide(candidates: Candidate[], options: MatcherOptions): Verdict {
  const best = candidates[0] ?? null;
  if (!best) return { best: null, margin: 0, decision: "uncertain" };
  const second = candidates[1];
  const margin = best.score - (second?.score ?? 0);
  const decision: Decision =
    best.score >= options.minScore && margin >= options.minMargin ? "assign" : "uncertain";
  return { best, margin, decision };
}

export interface Classification extends Verdict {
  bookmarkId: string;
  candidates: Candidate[];
}

/** Classifica i preferiti dell'inbox rispetto alle cartelle di destinazione. */
export async function classifyItems(
  items: Bookmark[],
  profiles: FolderProfile[],
  embedder: Embedder,
  options: MatcherOptions = DEFAULT_MATCHER_OPTIONS,
  embedOptions: EmbedOptions = {},
): Promise<Classification[]> {
  const texts = items.map((item) => bookmarkText(item));
  const vectors = await embedMany(embedder, texts, embedOptions);
  return items.map((item, index) => {
    const vector = vectors.get(texts[index]!)!;
    const candidates = scoreFolders(vector, profiles, options);
    return { bookmarkId: item.id, candidates, ...decide(candidates, options) };
  });
}
