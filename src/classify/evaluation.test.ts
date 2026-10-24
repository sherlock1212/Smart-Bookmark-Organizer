import { describe, expect, it } from "vitest";
import { buildCorpus } from "../test-fixtures/corpus";
import { HashingEmbedder } from "../test-fixtures/hashing-embedder";
import {
  ACCEPTANCE,
  DEFAULT_EVALUATION_OPTIONS,
  checkAcceptance,
  evaluateLeaveOneOut,
  type EvaluationReport,
} from "./evaluation";
import { DEFAULT_MATCHER_OPTIONS, type FolderProfile, type MatcherOptions } from "./matcher";
import { buildFolderProfiles } from "./profiles";

const v = (...n: number[]): Float32Array => Float32Array.from(n);
const opts = (o: Partial<MatcherOptions> = {}): MatcherOptions => ({ ...DEFAULT_MATCHER_OPTIONS, ...o });

/** Cartelle ben separate: ogni cartella ha esempi identici e le cartelle sono ortogonali. */
function separatedProfiles(): FolderProfile[] {
  const axes = [v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)];
  return axes.map((axis, i) => ({
    folderId: `folder-${i}`,
    path: ["R", `Segreto${i}`],
    nameVector: axis,
    examples: [0, 1, 2].map((j) => ({ bookmarkId: `b-${i}-${j}`, vector: axis })),
  }));
}

describe("evaluateLeaveOneOut", () => {
  it("con cartelle ben separate trova tutto e assegna con sicurezza", () => {
    const report = evaluateLeaveOneOut(separatedProfiles(), opts({ minScore: 0.5, minMargin: 0.1 }));
    expect(report).toMatchObject({
      evaluated: 9,
      foldersCovered: 3,
      top1: 1,
      top3: 1,
      assigned: 9,
      assignedCorrect: 9,
      assignedPrecision: 1,
      coverage: 1,
    });
  });

  it("con soglie impossibili non assegna nulla e la precisione è null", () => {
    const report = evaluateLeaveOneOut(separatedProfiles(), opts({ minScore: 2 }));
    expect(report.assigned).toBe(0);
    expect(report.assignedPrecision).toBeNull();
    expect(report.coverage).toBe(0);
    expect(report.top1).toBe(1);
  });

  it("nasconde davvero l'elemento valutato (non si ritrova da solo)", () => {
    // Ogni cartella ha due esempi tra loro ortogonali: nascosto uno, l'altro non lo aiuta.
    const profiles: FolderProfile[] = [
      { folderId: "z-uno", path: ["R", "uno"], nameVector: v(0, 0, 0, 0, 1, 0), examples: [
        { bookmarkId: "1", vector: v(1, 0, 0, 0, 0, 0) },
        { bookmarkId: "2", vector: v(0, 1, 0, 0, 0, 0) },
      ] },
      { folderId: "a-due", path: ["R", "due"], nameVector: v(0, 0, 0, 0, 0, 1), examples: [
        { bookmarkId: "3", vector: v(0, 0, 1, 0, 0, 0) },
        { bookmarkId: "4", vector: v(0, 0, 0, 1, 0, 0) },
      ] },
    ];
    const report = evaluateLeaveOneOut(profiles, opts());
    // Punteggi tutti a zero: vince l'id più piccolo ("a-due"), quindi si indovina solo la metà.
    // Se l'elemento nascosto contasse ancora, la precisione sarebbe 100%.
    expect(report.evaluated).toBe(4);
    expect(report.top1).toBe(0.5);
  });

  it("il campione è deterministico e rispetta maxItems", () => {
    const { split } = buildCorpus();
    return buildFolderProfiles(split.destinationFolders, split.reference, new HashingEmbedder()).then(({ profiles }) => {
      const o = opts({ minScore: 0.1, minMargin: 0.02 });
      const a = evaluateLeaveOneOut(profiles, o, { ...DEFAULT_EVALUATION_OPTIONS, maxItems: 10, seed: 7 });
      const b = evaluateLeaveOneOut(profiles, o, { ...DEFAULT_EVALUATION_OPTIONS, maxItems: 10, seed: 7 });
      const c = evaluateLeaveOneOut(profiles, o, { ...DEFAULT_EVALUATION_OPTIONS, maxItems: 10, seed: 8 });
      expect(a.evaluated).toBe(10);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(c.evaluated).toBe(10);
    });
  });

  it("salta le cartelle con meno esempi del minimo", () => {
    const profiles = separatedProfiles();
    profiles[0]!.examples = profiles[0]!.examples.slice(0, 1);
    const report = evaluateLeaveOneOut(profiles, opts(), { ...DEFAULT_EVALUATION_OPTIONS, minExamplesInFolder: 2 });
    expect(report.foldersCovered).toBe(2);
    expect(report.evaluated).toBe(6);
  });

  it("senza elementi valutabili restituisce zeri senza errori", () => {
    const report = evaluateLeaveOneOut([], opts());
    expect(report).toMatchObject({ evaluated: 0, top1: 0, top3: 0, assigned: 0, assignedPrecision: null, coverage: 0 });
  });

  it("le fasce di distacco contano tutti gli elementi valutati", () => {
    const report = evaluateLeaveOneOut(separatedProfiles(), opts());
    expect(report.byMargin.reduce((acc, band) => acc + band.n, 0)).toBe(report.evaluated);
    expect(report.byMargin.at(-1)!.upTo).toBe(Number.POSITIVE_INFINITY);
  });

  it("il rapporto contiene solo numeri: nessun id, nome o testo delle cartelle", () => {
    const report = evaluateLeaveOneOut(separatedProfiles(), opts());
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/folder-|Segreto|b-\d-\d/);
    const walk = (value: unknown): void => {
      if (value === null) return;
      if (typeof value === "object") Object.values(value as object).forEach(walk);
      else expect(typeof value).toBe("number");
    };
    walk({ ...report, byMargin: report.byMargin.map((b) => ({ n: b.n, top1: b.top1 })) });
  });

  it("sul corpus di prova con l'embedder finto il sistema funziona (prova la logica)", async () => {
    const { split } = buildCorpus();
    const { profiles } = await buildFolderProfiles(split.destinationFolders, split.reference, new HashingEmbedder());
    const report = evaluateLeaveOneOut(profiles, opts({ minScore: 0.1, minMargin: 0.02 }));
    expect(report.evaluated).toBe(32);
    expect(report.top3).toBeGreaterThanOrEqual(0.9);
  });
});

describe("checkAcceptance", () => {
  const base: EvaluationReport = {
    evaluated: 100,
    foldersCovered: 10,
    top1: 0.7,
    top3: 0.9,
    assigned: 50,
    assignedCorrect: 49,
    assignedPrecision: 0.98,
    coverage: 0.5,
    byMargin: [],
  };

  it("usa le soglie approvate", () => {
    expect(ACCEPTANCE).toEqual({ top3: 0.85, top1: 0.65, maxAssignedError: 0.05 });
  });

  it("supera tutte le soglie con buoni risultati", () => {
    expect(checkAcceptance(base).every((c) => c.passed)).toBe(true);
  });

  it("segnala ogni soglia non raggiunta, al limite incluso", () => {
    const at = checkAcceptance({ ...base, top3: 0.85, top1: 0.65, assignedPrecision: 0.95 });
    expect(at.every((c) => c.passed)).toBe(true);
    const below = checkAcceptance({ ...base, top3: 0.84, top1: 0.64, assignedPrecision: 0.94 });
    expect(below.map((c) => c.passed)).toEqual([false, false, false]);
  });

  it("senza elementi assegnati la soglia sugli errori non è superata", () => {
    const [, , errors] = checkAcceptance({ ...base, assigned: 0, assignedCorrect: 0, assignedPrecision: null });
    expect(errors!.passed).toBe(false);
    expect(errors!.actual).toMatch(/nessun elemento/);
  });
});
