import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransformersEmbedderConfig } from "./transformers-embedder";

// Libreria simulata: qui si prova il NOSTRO codice (configurazione, prefisso, lettura dei
// risultati). La qualità del modello vero si prova nei test *.model.test.ts.
const state = vi.hoisted(() => ({
  env: {
    backends: { onnx: { wasm: {} as Record<string, unknown> } },
  } as Record<string, any>,
  pipeline: vi.fn(),
  extractor: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  env: state.env,
  pipeline: state.pipeline,
}));

import { createTransformersEmbedder } from "./transformers-embedder";

const config: TransformersEmbedderConfig = {
  modelId: "org/model",
  revision: "abc123",
  dtype: "q8",
  prefix: "query: ",
  dimensions: 3,
  localModelPath: "http://app.local/models/",
  wasmPaths: { mjs: "http://app.local/ort/a.mjs", wasm: "http://app.local/ort/a.wasm" },
};

beforeEach(() => {
  state.env.backends.onnx.wasm = {};
  state.pipeline.mockReset();
  state.extractor.mockReset();
  state.pipeline.mockResolvedValue(state.extractor);
});

describe("createTransformersEmbedder", () => {
  it("configura la libreria per lavorare solo in locale", async () => {
    await createTransformersEmbedder(config);
    expect(state.env).toMatchObject({
      allowRemoteModels: false,
      allowLocalModels: true,
      localModelPath: "http://app.local/models/",
      useBrowserCache: false,
      useWasmCache: false,
    });
    expect(state.env.backends.onnx.wasm).toEqual({
      wasmPaths: { mjs: "http://app.local/ort/a.mjs", wasm: "http://app.local/ort/a.wasm" },
      numThreads: 1,
    });
  });

  it("senza wasmPaths (Node) non tocca la configurazione WASM", async () => {
    await createTransformersEmbedder({ ...config, wasmPaths: undefined });
    expect(state.env.backends.onnx.wasm).toEqual({});
  });

  it("crea la pipeline di estrazione con modello e precisione indicati", async () => {
    await createTransformersEmbedder(config);
    expect(state.pipeline).toHaveBeenCalledWith("feature-extraction", "org/model", { dtype: "q8" });
  });

  it("espone id con revisione e precisione, e le dimensioni", async () => {
    const embedder = await createTransformersEmbedder(config);
    expect(embedder.id).toBe("org/model@abc123:q8");
    expect(embedder.dimensions).toBe(3);
  });

  it("applica il prefisso a ogni testo e chiede media + normalizzazione", async () => {
    state.extractor.mockResolvedValue({ data: new Float32Array(6), dims: [2, 3] });
    const embedder = await createTransformersEmbedder(config);
    await embedder.embed(["uno", "due"]);
    expect(state.extractor).toHaveBeenCalledWith(["query: uno", "query: due"], {
      pooling: "mean",
      normalize: true,
    });
  });

  it("separa le righe del risultato in un vettore per testo", async () => {
    state.extractor.mockResolvedValue({ data: Float32Array.from([1, 2, 3, 4, 5, 6]), dims: [2, 3] });
    const embedder = await createTransformersEmbedder(config);
    const vectors = await embedder.embed(["a", "b"]);
    expect(vectors.map((v) => Array.from(v))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(vectors[0]).not.toBe(vectors[1]);
  });

  it("con nessun testo non interroga il modello", async () => {
    const embedder = await createTransformersEmbedder(config);
    expect(await embedder.embed([])).toEqual([]);
    expect(state.extractor).not.toHaveBeenCalled();
  });

  it("rifiuta risultati con dimensioni inattese", async () => {
    const embedder = await createTransformersEmbedder(config);
    state.extractor.mockResolvedValue({ data: new Float32Array(8), dims: [2, 4] });
    await expect(embedder.embed(["a", "b"])).rejects.toThrow(/dimensioni 2x4, attese 2x3/);
    state.extractor.mockResolvedValue({ data: new Float32Array(3), dims: [1, 3] });
    await expect(embedder.embed(["a", "b"])).rejects.toThrow(/attese 2x3/);
  });

  it("se il modello non si carica dà un messaggio comprensibile con il rimedio", async () => {
    state.pipeline.mockRejectedValue(new Error("file non trovato"));
    await expect(createTransformersEmbedder(config)).rejects.toThrow(/file non trovato.*npm run assets/);
  });
});
