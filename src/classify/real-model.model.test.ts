// Test con il modello VERO. Girano solo se il modello è stato scaricato (`npm run assets`),
// cioè in CI; in locale, senza modello, vengono saltati. Con SKIP_MODEL_TESTS=1 si saltano sempre.
// I numeri misurati vanno in results/model-quality.json (la CI li mostra come annotazioni).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRealisticCorpus } from "../test-fixtures/realistic-corpus";
import { runCorpusBenchmark } from "./benchmark";
import { MODEL_MANIFEST } from "./model-manifest";
import { DEFAULT_MATCHER_OPTIONS, scoreFolders } from "./matcher";
import { buildFolderProfiles } from "./profiles";
import type { Embedder } from "./embedder";
import { createTransformersEmbedder } from "./transformers-embedder";
import { similarity } from "./vector";

const modelsDir = path.resolve("public", "models");
const modelFile = path.join(modelsDir, ...MODEL_MANIFEST.modelId.split("/"), "onnx", "model_quantized.onnx");
const enabled = process.env.SKIP_MODEL_TESTS !== "1" && existsSync(modelFile);

const round = (n: number, digits = 4): number => Number(n.toFixed(digits));

describe.skipIf(!enabled)("modello vero (multilingual-e5-small, Node)", () => {
  let embedder: Embedder;
  const results: Record<string, unknown> = { model: MODEL_MANIFEST.modelId, revision: MODEL_MANIFEST.revision };

  beforeAll(async () => {
    const started = performance.now();
    embedder = await createTransformersEmbedder({
      modelId: MODEL_MANIFEST.modelId,
      revision: MODEL_MANIFEST.revision,
      dtype: MODEL_MANIFEST.dtype,
      prefix: MODEL_MANIFEST.prefix,
      dimensions: MODEL_MANIFEST.dimensions,
      localModelPath: modelsDir + path.sep,
    });
    results["loadMs"] = Math.round(performance.now() - started);
  }, 300_000);

  it("restituisce vettori di 384 numeri, normalizzati", async () => {
    const [v] = await embedder.embed(["ricetta della carbonara"]);
    expect(v!.length).toBe(MODEL_MANIFEST.dimensions);
    expect(Math.hypot(...v!)).toBeCloseTo(1, 3);
  }, 120_000);

  it("capisce il significato, non solo le parole (italiano, inglese, tra le due lingue)", async () => {
    const [a, b, c, d, e, f] = await embedder.embed([
      "ricetta carbonara guanciale uova",
      "spaghetti alla gricia, pasta romana",
      "tutorial typescript generics",
      "pasta recipe with eggs and bacon",
      "ricetta della pasta con le uova",
      "dichiarazione dei redditi 730",
    ]);
    expect(similarity(a!, b!)).toBeGreaterThan(similarity(a!, c!));
    expect(similarity(d!, e!)).toBeGreaterThan(similarity(d!, f!));
    results["semantic"] = {
      itRelated: round(similarity(a!, b!)),
      itUnrelated: round(similarity(a!, c!)),
      crossRelated: round(similarity(d!, e!)),
      crossUnrelated: round(similarity(d!, f!)),
    };
  }, 120_000);

  it("smista e valuta un corpus realistico sintetico (italiano e inglese)", async () => {
    const benchmark = await runCorpusBenchmark(embedder, buildRealisticCorpus());
    Object.assign(results, benchmark);
    const inbox = benchmark["inbox"] as { top1: number; top3: number };
    const loo = benchmark["leaveOneOut"] as { evaluated: number; top3: number };
    // Soglie larghe: servono solo a intercettare guasti gravi (prefisso o pooling sbagliati,
    // modello corrotto), non a certificare la qualità.
    expect(inbox.top3).toBeGreaterThanOrEqual(0.75);
    expect(inbox.top1).toBeGreaterThanOrEqual(0.5);
    expect(loo.evaluated).toBeGreaterThan(0);
    expect(loo.top3).toBeGreaterThanOrEqual(0.75);
  }, 300_000);

  it("la prima cartella candidata è stabile tra due esecuzioni", async () => {
    const { split } = buildRealisticCorpus();
    const { profiles } = await buildFolderProfiles(split.destinationFolders, split.reference, embedder);
    const [v] = await embedder.embed(["Weekend a Praga: cosa fare"]);
    const first = scoreFolders(v!, profiles, DEFAULT_MATCHER_OPTIONS).map((c) => c.folderId);
    const [w] = await embedder.embed(["Weekend a Praga: cosa fare"]);
    expect(scoreFolders(w!, profiles, DEFAULT_MATCHER_OPTIONS).map((c) => c.folderId)).toEqual(first);
    expect(first[0]).toBe("viaggi");
  }, 120_000);

  it("scrive i risultati misurati", async () => {
    // Vettori di riferimento: la prova del browser li confronta con quelli calcolati in WASM.
    const texts = ["ricetta della carbonara", "Weekend a Praga: cosa fare", "TypeScript handbook: generics"];
    const vectors = await embedder.embed(texts);
    mkdirSync("results", { recursive: true });
    writeFileSync(
      path.join("results", "reference-vectors.json"),
      JSON.stringify({ texts, vectors: vectors.map((v) => Array.from(v)) }),
    );
    writeFileSync(path.join("results", "model-quality.json"), JSON.stringify(results, null, 2));
    expect(existsSync(path.join("results", "model-quality.json"))).toBe(true);
  }, 120_000);
});
