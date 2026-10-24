import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransformersEmbedderConfig } from "./transformers-embedder";

// Libreria simulata: qui si prova il NOSTRO codice (configurazione, prefisso, lettura dei
// risultati). La qualità del modello vero si prova nei test *.model.test.ts.
const state = vi.hoisted(() => ({
  env: {
    backends: { onnx: { wasm: {} as Record<string, unknown> } },
  } as Record<string, any>,
  pipeline: vi.fn(),
  loadTokenizer: vi.fn(),
  loadModel: vi.fn(),
  extractorArgs: undefined as Record<string, unknown> | undefined,
  extractor: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  env: state.env,
  // pipeline() NON deve essere usata (vedi transformers-embedder.ts): se lo fosse, i test falliscono.
  pipeline: state.pipeline,
  AutoTokenizer: { from_pretrained: state.loadTokenizer },
  AutoModel: { from_pretrained: state.loadModel },
  FeatureExtractionPipeline: class {
    constructor(args: Record<string, unknown>) {
      state.extractorArgs = args;
      return state.extractor as unknown as object;
    }
  },
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

const fakeTokenizer = { name: "tokenizer" };
const fakeModel = { name: "model" };

beforeEach(() => {
  state.env.backends.onnx.wasm = {};
  state.pipeline.mockReset();
  state.loadTokenizer.mockReset();
  state.loadModel.mockReset();
  state.extractor.mockReset();
  state.extractorArgs = undefined;
  state.loadTokenizer.mockResolvedValue(fakeTokenizer);
  state.loadModel.mockResolvedValue(fakeModel);
});

describe("createTransformersEmbedder", () => {
  it("via HTTP (browser) l'unico 'remoto' ammesso è la cartella dell'app stessa, mai Hugging Face", async () => {
    await createTransformersEmbedder(config);
    expect(state.env).toMatchObject({
      allowRemoteModels: true,
      allowLocalModels: true,
      localModelPath: "http://app.local/models/",
      remoteHost: "http://app.local/models/",
      remotePathTemplate: "{model}/",
      useBrowserCache: false,
      useWasmCache: false,
    });
    expect(String(state.env["remoteHost"])).not.toContain("huggingface");
  });

  it("con percorsi su disco (Node) la rete è disattivata", async () => {
    await createTransformersEmbedder({ ...config, localModelPath: "/data/models/", wasmPaths: undefined });
    expect(state.env["allowRemoteModels"]).toBe(false);
    expect(state.env["localModelPath"]).toBe("/data/models/");
  });

  it("configura i file WASM locali e un solo thread", async () => {
    await createTransformersEmbedder(config);
    expect(state.env.backends.onnx.wasm).toEqual({
      wasmPaths: { mjs: "http://app.local/ort/a.mjs", wasm: "http://app.local/ort/a.wasm" },
      numThreads: 1,
    });
  });

  it("senza wasmPaths (Node) non tocca la configurazione WASM", async () => {
    await createTransformersEmbedder({ ...config, wasmPaths: undefined });
    expect(state.env.backends.onnx.wasm).toEqual({});
  });

  it("carica tokenizer e modello indicati, con la precisione indicata", async () => {
    await createTransformersEmbedder(config);
    expect(state.loadTokenizer).toHaveBeenCalledWith("org/model", {});
    expect(state.loadModel).toHaveBeenCalledWith("org/model", { dtype: "q8" });
  });

  it("passa SEMPRE il tokenizer all'estrattore e non usa pipeline() (sonda di esistenza difettosa via HTTP)", async () => {
    await createTransformersEmbedder(config);
    expect(state.pipeline).not.toHaveBeenCalled();
    expect(state.extractorArgs).toEqual({
      task: "feature-extraction",
      model: fakeModel,
      tokenizer: fakeTokenizer,
    });
  });

  it("rifiuta un tokenizer mancante invece di proseguire senza", async () => {
    state.loadTokenizer.mockResolvedValue(null);
    await expect(createTransformersEmbedder(config)).rejects.toThrow(/tokenizer o modello non caricati/);
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
    state.loadModel.mockRejectedValue(new Error("file non trovato"));
    await expect(createTransformersEmbedder(config)).rejects.toThrow(/file non trovato.*npm run assets/);
  });
});
