import { describe, expect, it } from "vitest";
import { appEmbedderConfig } from "./app-embedder-config";
import { MODEL_MANIFEST } from "./model-manifest";

describe("appEmbedderConfig", () => {
  const config = appEmbedderConfig("http://tauri.localhost");

  it("legge i modelli dalla stessa origine dell'app, mai da Internet", () => {
    expect(config.localModelPath).toBe("http://tauri.localhost/models/");
  });

  it("serve i file WASM dalla stessa origine", () => {
    expect(config.wasmPaths?.mjs.startsWith("http://tauri.localhost/")).toBe(true);
    expect(config.wasmPaths?.wasm.startsWith("http://tauri.localhost/")).toBe(true);
    expect(config.wasmPaths?.mjs).toMatch(/\.mjs(\?|$)/);
    expect(config.wasmPaths?.wasm).toMatch(/\.wasm(\?|$)/);
  });

  it("nessun indirizzo punta a una CDN", () => {
    expect(JSON.stringify(config)).not.toMatch(/jsdelivr|unpkg|cdn\.|huggingface\.co/);
  });

  it("usa i parametri del manifesto", () => {
    expect(config).toMatchObject({
      modelId: MODEL_MANIFEST.modelId,
      revision: MODEL_MANIFEST.revision,
      dtype: "q8",
      prefix: "query: ",
      dimensions: 384,
    });
  });
});

describe("manifesto del modello", () => {
  it("fissa una revisione precisa (40 caratteri esadecimali), non un ramo mobile", () => {
    expect(MODEL_MANIFEST.revision).toMatch(/^[0-9a-f]{40}$/);
  });

  it("elenca i file necessari al modello quantizzato, senza percorsi pericolosi", () => {
    const paths = MODEL_MANIFEST.files.map((f) => f.path);
    expect(paths).toContain("onnx/model_quantized.onnx");
    expect(paths).toContain("tokenizer.json");
    expect(paths.every((p) => !p.startsWith("/") && !p.includes(".."))).toBe(true);
  });
});
