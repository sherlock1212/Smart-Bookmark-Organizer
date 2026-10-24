import type { Corpus } from "../test-fixtures/corpus";
import type { Embedder } from "./embedder";
import { evaluateLeaveOneOut, checkAcceptance } from "./evaluation";
import { DEFAULT_MATCHER_OPTIONS, classifyItems, type MatcherOptions } from "./matcher";
import { buildFolderProfiles } from "./profiles";

const round = (n: number, digits = 4): number => Number(n.toFixed(digits));

function stats(values: number[]): { n: number; min: number | null; median: number | null; max: number | null } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number | null =>
    sorted.length === 0 ? null : round(sorted[Math.floor(q * (sorted.length - 1))]!);
  return { n: sorted.length, min: at(0), median: at(0.5), max: at(1) };
}

/**
 * Prova completa su un corpus noto: costruisce i profili, smista l'inbox e valuta.
 * Usata dai test con il modello vero (Node) e dalla prova nel browser (WASM): stesso codice,
 * così i due risultati sono confrontabili. Solo uso di sviluppo: l'app non la importa.
 */
export async function runCorpusBenchmark(
  embedder: Embedder,
  corpus: Corpus,
  matcherOptions: MatcherOptions = DEFAULT_MATCHER_OPTIONS,
): Promise<Record<string, unknown>> {
  const { split, expected } = corpus;
  const started = performance.now();
  const { profiles, textsEmbedded } = await buildFolderProfiles(
    split.destinationFolders,
    split.reference,
    embedder,
  );
  const classified = await classifyItems(split.inbox, profiles, embedder, matcherOptions);
  const elapsedMs = performance.now() - started;

  const rows = classified.map((c) => ({
    correct1: c.candidates[0]?.folderId === expected[c.bookmarkId],
    correct3: c.candidates.slice(0, 3).some((x) => x.folderId === expected[c.bookmarkId]),
    score: c.best?.score ?? 0,
    margin: c.margin,
    decision: c.decision,
  }));
  const n = rows.length;

  const report = evaluateLeaveOneOut(profiles, matcherOptions);

  return {
    inbox: {
      items: n,
      top1: round(rows.filter((r) => r.correct1).length / n),
      top3: round(rows.filter((r) => r.correct3).length / n),
      textsEmbedded,
      totalMs: Math.round(elapsedMs),
      msPerText: round(elapsedMs / (textsEmbedded + n), 1),
      bestScoreWhenCorrect: stats(rows.filter((r) => r.correct1).map((r) => r.score)),
      bestScoreWhenWrong: stats(rows.filter((r) => !r.correct1).map((r) => r.score)),
      marginWhenCorrect: stats(rows.filter((r) => r.correct1).map((r) => r.margin)),
      marginWhenWrong: stats(rows.filter((r) => !r.correct1).map((r) => r.margin)),
      assignedWithInitialThresholds: rows.filter((r) => r.decision === "assign").length,
    },
    leaveOneOut: {
      ...report,
      byMargin: report.byMargin.map((b) => ({
        upTo: b.upTo === Number.POSITIVE_INFINITY ? "inf" : b.upTo,
        n: b.n,
        top1: b.top1 === null ? null : round(b.top1),
      })),
    },
    acceptance: checkAcceptance(report),
  };
}
