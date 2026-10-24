import { describe, expect, it } from "vitest";
import { buildCorpus } from "../test-fixtures/corpus";
import { HashingEmbedder } from "../test-fixtures/hashing-embedder";
import {
  DEFAULT_MATCHER_OPTIONS,
  classifyItems,
  decide,
  scoreFolders,
  type Candidate,
  type FolderProfile,
  type MatcherOptions,
} from "./matcher";
import { buildFolderProfiles } from "./profiles";

const v = (...n: number[]): Float32Array => Float32Array.from(n);
const opts = (o: Partial<MatcherOptions> = {}): MatcherOptions => ({ ...DEFAULT_MATCHER_OPTIONS, ...o });

function profile(folderId: string, nameVector: Float32Array, examples: Float32Array[] = []): FolderProfile {
  return {
    folderId,
    path: ["R", folderId],
    nameVector,
    examples: examples.map((vector, i) => ({ bookmarkId: `${folderId}-${i}`, vector })),
  };
}

describe("scoreFolders", () => {
  const profiles = [
    profile("a", v(1, 0, 0), [v(1, 0, 0), v(0.9, 0.1, 0)]),
    profile("b", v(0, 1, 0), [v(0, 1, 0)]),
    profile("c", v(0, 0, 1)),
  ];

  it("ordina le cartelle dalla più vicina", () => {
    const result = scoreFolders(v(1, 0, 0), profiles, opts({ topK: 3 }));
    expect(result.map((c) => c.folderId)).toEqual(["a", "b", "c"]);
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it("una cartella senza esempi conta solo per il nome", () => {
    const result = scoreFolders(v(0, 0, 1), profiles, opts({ topK: 3 }));
    expect(result[0]).toMatchObject({ folderId: "c", exampleSimilarity: null, score: 1 });
  });

  it("combina nome ed esempi secondo il peso", () => {
    const [first] = scoreFolders(v(1, 0, 0), [profile("a", v(0, 1, 0), [v(1, 0, 0)])], opts({ nameWeight: 0.25 }));
    expect(first!.nameSimilarity).toBeCloseTo(0);
    expect(first!.exampleSimilarity).toBeCloseTo(1);
    expect(first!.score).toBeCloseTo(0.75);
  });

  it("limita il numero di candidate a topK", () => {
    expect(scoreFolders(v(1, 0, 0), profiles, opts({ topK: 2 }))).toHaveLength(2);
    expect(scoreFolders(v(1, 0, 0), profiles, opts({ topK: 0 }))).toHaveLength(1);
  });

  it("può ignorare un esempio (per la valutazione)", () => {
    const only = [profile("a", v(0, 1, 0), [v(1, 0, 0)])];
    const withExample = scoreFolders(v(1, 0, 0), only, opts())[0]!;
    const hidden = scoreFolders(v(1, 0, 0), only, opts(), { folderId: "a", exampleIndex: 0 })[0]!;
    expect(withExample.exampleSimilarity).toBeCloseTo(1);
    expect(hidden.exampleSimilarity).toBeNull();
    expect(hidden.score).toBeCloseTo(0);
  });

  it("a parità di punteggio vince l'id più piccolo (risultato stabile)", () => {
    const same = [profile("b", v(1, 0)), profile("a", v(1, 0))];
    expect(scoreFolders(v(1, 0), same, opts()).map((c) => c.folderId)).toEqual(["a", "b"]);
  });

  it("senza cartelle restituisce nessuna candidata", () => {
    expect(scoreFolders(v(1, 0), [], opts())).toEqual([]);
  });
});

describe("decide", () => {
  const cand = (folderId: string, score: number): Candidate => ({
    folderId,
    score,
    nameSimilarity: score,
    exampleSimilarity: null,
  });
  const o = opts({ minScore: 0.8, minMargin: 0.05 });

  it("assegna con punteggio e distacco sufficienti", () => {
    const verdict = decide([cand("a", 0.9), cand("b", 0.8)], o);
    expect(verdict.decision).toBe("assign");
    expect(verdict.margin).toBeCloseTo(0.1);
    expect(verdict.best?.folderId).toBe("a");
  });

  it("è incerto se il punteggio è basso o il distacco è piccolo", () => {
    expect(decide([cand("a", 0.7), cand("b", 0.5)], o).decision).toBe("uncertain");
    expect(decide([cand("a", 0.9), cand("b", 0.88)], o).decision).toBe("uncertain");
  });

  it("con una sola candidata il distacco è il suo punteggio", () => {
    expect(decide([cand("a", 0.9)], o)).toMatchObject({ decision: "assign", margin: 0.9 });
  });

  it("senza candidate è incerto", () => {
    expect(decide([], o)).toEqual({ best: null, margin: 0, decision: "uncertain" });
  });
});

describe("classifyItems (con embedder finto: prova la logica, non il modello)", () => {
  it("rimette ogni preferito dell'inbox nella cartella del suo tema", async () => {
    const { split, expected } = buildCorpus();
    const embedder = new HashingEmbedder();
    const { profiles } = await buildFolderProfiles(split.destinationFolders, split.reference, embedder);
    const results = await classifyItems(split.inbox, profiles, embedder, opts({ minScore: 0.1, minMargin: 0.02 }));

    expect(results).toHaveLength(split.inbox.length);
    const correct = results.filter((r) => r.best?.folderId === expected[r.bookmarkId]);
    expect(correct.length / results.length).toBeGreaterThanOrEqual(0.9);
  });

  it("mantiene l'ordine e gli id dell'ingresso e non modifica i dati", async () => {
    const { split } = buildCorpus();
    const embedder = new HashingEmbedder();
    const { profiles } = await buildFolderProfiles(split.destinationFolders, split.reference, embedder);
    const before = JSON.stringify(split.inbox);
    const results = await classifyItems(split.inbox, profiles, embedder);
    expect(results.map((r) => r.bookmarkId)).toEqual(split.inbox.map((b) => b.id));
    expect(JSON.stringify(split.inbox)).toBe(before);
  });

  it("è idempotente: stesso ingresso, stesso risultato", async () => {
    const { split } = buildCorpus();
    const embedder = new HashingEmbedder();
    const { profiles } = await buildFolderProfiles(split.destinationFolders, split.reference, embedder);
    const a = await classifyItems(split.inbox, profiles, embedder);
    const b = await classifyItems(split.inbox, profiles, embedder);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("un testo senza parole in comune con nessuna cartella resta incerto con soglie realistiche", async () => {
    const { split } = buildCorpus();
    const embedder = new HashingEmbedder();
    const { profiles } = await buildFolderProfiles(split.destinationFolders, split.reference, embedder);
    const odd = { ...split.inbox[0]!, id: "x", title: "zzz qqq www", url: "https://xyz.example.net/kkk" };
    const [result] = await classifyItems([odd], profiles, embedder, opts({ minScore: 0.3, minMargin: 0.05 }));
    expect(result!.decision).toBe("uncertain");
  });

  it("senza cartelle di destinazione tutto è incerto", async () => {
    const { split } = buildCorpus();
    const results = await classifyItems(split.inbox, [], new HashingEmbedder());
    expect(results.every((r) => r.decision === "uncertain" && r.best === null)).toBe(true);
  });
});
