import { scoreFolders, decide, type FolderProfile, type MatcherOptions } from "./matcher";

/**
 * Valutazione "nascondi e ritrova": per ogni esempio già in una cartella, si nasconde e si
 * verifica se il classificatore lo rimette nella cartella giusta.
 *
 * Il rapporto contiene SOLO numeri aggregati: nessun titolo, URL o nome di cartella.
 *
 * Limiti da tenere presenti: se una cartella è disordinata il risultato è pessimista; i
 * preferiti già ordinati sono più "puliti" di quelli salvati alla rinfusa, quindi il risultato
 * può essere ottimista rispetto all'inbox vera. Va letto insieme al controllo manuale.
 */
export interface EvaluationOptions {
  /** Massimo di elementi valutati (campione deterministico). */
  maxItems: number;
  /** Seme del campionamento: stesso seme, stesso campione. */
  seed: number;
  /** Si valutano solo cartelle con almeno questi esempi (così ne resta almeno uno dopo averne nascosto uno). */
  minExamplesInFolder: number;
}

export const DEFAULT_EVALUATION_OPTIONS: EvaluationOptions = {
  maxItems: 300,
  seed: 1,
  minExamplesInFolder: 2,
};

export interface MarginBand {
  /** Estremo superiore del distacco (incluso). */
  upTo: number;
  n: number;
  /** Quota di prime scelte corrette nella fascia, null se vuota. */
  top1: number | null;
}

export interface EvaluationReport {
  evaluated: number;
  foldersCovered: number;
  /** Quote tra 0 e 1. */
  top1: number;
  top3: number;
  /** Elementi che il sistema avrebbe proposto con sicurezza e quanti di questi erano giusti. */
  assigned: number;
  assignedCorrect: number;
  /** null se nessun elemento è stato assegnato con sicurezza. */
  assignedPrecision: number | null;
  /** Quota di elementi assegnati con sicurezza sul totale valutato. */
  coverage: number;
  byMargin: MarginBand[];
}

const MARGIN_EDGES = [0.005, 0.01, 0.02, 0.04, 0.08, Number.POSITIVE_INFINITY];

/** Generatore pseudo-casuale deterministico (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function evaluateLeaveOneOut(
  profiles: FolderProfile[],
  matcherOptions: MatcherOptions,
  options: EvaluationOptions = DEFAULT_EVALUATION_OPTIONS,
): EvaluationReport {
  const items: Array<{ profileIndex: number; exampleIndex: number }> = [];
  profiles.forEach((profile, profileIndex) => {
    if (profile.examples.length < Math.max(2, options.minExamplesInFolder)) return;
    profile.examples.forEach((_, exampleIndex) => items.push({ profileIndex, exampleIndex }));
  });

  // Campione deterministico (Fisher-Yates con seme fisso).
  const random = seededRandom(options.seed);
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  const sample = items.slice(0, options.maxItems);

  const evalOptions: MatcherOptions = { ...matcherOptions, topK: Math.max(3, matcherOptions.topK) };
  let top1 = 0;
  let top3 = 0;
  let assigned = 0;
  let assignedCorrect = 0;
  const bandN = MARGIN_EDGES.map(() => 0);
  const bandTop1 = MARGIN_EDGES.map(() => 0);
  const folders = new Set<string>();

  for (const { profileIndex, exampleIndex } of sample) {
    const profile = profiles[profileIndex]!;
    folders.add(profile.folderId);
    const vector = profile.examples[exampleIndex]!.vector;
    const candidates = scoreFolders(vector, profiles, evalOptions, {
      folderId: profile.folderId,
      exampleIndex,
    });
    const verdict = decide(candidates, matcherOptions);
    const correct1 = candidates[0]?.folderId === profile.folderId;
    const correct3 = candidates.slice(0, 3).some((c) => c.folderId === profile.folderId);
    if (correct1) top1 += 1;
    if (correct3) top3 += 1;
    if (verdict.decision === "assign") {
      assigned += 1;
      if (correct1) assignedCorrect += 1;
    }
    const band = MARGIN_EDGES.findIndex((edge) => verdict.margin <= edge);
    bandN[band] = bandN[band]! + 1;
    if (correct1) bandTop1[band] = bandTop1[band]! + 1;
  }

  const n = sample.length;
  return {
    evaluated: n,
    foldersCovered: folders.size,
    top1: n === 0 ? 0 : top1 / n,
    top3: n === 0 ? 0 : top3 / n,
    assigned,
    assignedCorrect,
    assignedPrecision: assigned === 0 ? null : assignedCorrect / assigned,
    coverage: n === 0 ? 0 : assigned / n,
    byMargin: MARGIN_EDGES.map((upTo, i) => ({
      upTo,
      n: bandN[i]!,
      top1: bandN[i]! === 0 ? null : bandTop1[i]! / bandN[i]!,
    })),
  };
}

/** Soglie di accettazione approvate (vedi PROJECT.md). */
export const ACCEPTANCE = {
  /** Cartella corretta tra le prime 3 candidate. */
  top3: 0.85,
  /** Cartella corretta come prima scelta. */
  top1: 0.65,
  /** Errori ammessi tra gli elementi assegnati con sicurezza. */
  maxAssignedError: 0.05,
} as const;

export interface AcceptanceCheck {
  name: string;
  required: string;
  actual: string;
  passed: boolean;
}

const FLOAT_TOLERANCE = 1e-9;

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

export function checkAcceptance(report: EvaluationReport): AcceptanceCheck[] {
  const precision = report.assignedPrecision;
  return [
    {
      name: "Cartella giusta tra le prime 3",
      required: `almeno ${pct(ACCEPTANCE.top3)}`,
      actual: pct(report.top3),
      passed: report.top3 >= ACCEPTANCE.top3,
    },
    {
      name: "Cartella giusta come prima scelta",
      required: `almeno ${pct(ACCEPTANCE.top1)}`,
      actual: pct(report.top1),
      passed: report.top1 >= ACCEPTANCE.top1,
    },
    {
      name: "Errori tra gli elementi assegnati con sicurezza",
      required: `non oltre ${pct(ACCEPTANCE.maxAssignedError)}`,
      actual: precision === null ? "nessun elemento assegnato" : pct(1 - precision),
      // Senza elementi assegnati la soglia non è verificabile: non si considera superata.
      // La tolleranza evita che 1 - 0,95 = 0,05000000000000004 faccia fallire il limite esatto.
      passed:
        precision !== null && 1 - precision <= ACCEPTANCE.maxAssignedError + FLOAT_TOLERANCE,
    },
  ];
}
