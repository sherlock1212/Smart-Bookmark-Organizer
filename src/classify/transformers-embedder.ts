import type { Embedder } from "./embedder";

export interface TransformersEmbedderConfig {
  modelId: string;
  /** Revisione fissa del modello (entra nell'id: vettori di revisioni diverse non si mescolano). */
  revision: string;
  /** Precisione dei pesi, es. "q8" (quantizzato a 8 bit). */
  dtype: string;
  /** Prefisso richiesto dal modello davanti a ogni testo (es. "query: " per e5). */
  prefix: string;
  dimensions: number;
  /** Cartella (Node) o URL base (browser) da cui leggere i file del modello. */
  localModelPath: string;
  /** Percorsi locali dei file WASM di ONNX Runtime. Solo browser: in Node non servono. */
  wasmPaths?: { mjs: string; wasm: string };
}

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: ArrayLike<number>; dims: number[] }>;

type PipelineFactory = (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<Extractor>;

/**
 * Crea l'embedder locale basato su transformers.js.
 *
 * - Nessuna richiesta a Internet: i modelli si leggono solo da `localModelPath` e i file WASM
 *   solo da `wasmPaths` (la libreria, per default, userebbe una CDN).
 * - La libreria si carica solo qui (import dinamico), così non rallenta l'avvio dell'app.
 * - Un solo thread WASM: i thread richiederebbero isolamento cross-origin e worker.
 */
export async function createTransformersEmbedder(
  config: TransformersEmbedderConfig,
): Promise<Embedder> {
  const transformers = await import("@huggingface/transformers");
  const { env } = transformers;

  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = config.localModelPath;
  env.useBrowserCache = false; // niente copie nascoste dei modelli nella cache del browser
  env.useWasmCache = false; // evita URL blob: (non ammessi dalla CSP dell'app)

  if (config.wasmPaths) {
    const wasm = env.backends.onnx.wasm;
    if (!wasm) throw new Error("Backend ONNX WASM non disponibile.");
    wasm.wasmPaths = { mjs: config.wasmPaths.mjs, wasm: config.wasmPaths.wasm };
    wasm.numThreads = 1;
  }

  const createPipeline = transformers.pipeline as unknown as PipelineFactory;
  let extractor: Extractor;
  try {
    extractor = await createPipeline("feature-extraction", config.modelId, { dtype: config.dtype });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Impossibile caricare il modello di embedding "${config.modelId}": ${reason}. ` +
        "Se hai compilato l'app a mano, esegui prima 'npm run assets'.",
    );
  }

  return {
    id: `${config.modelId}@${config.revision}:${config.dtype}`,
    dimensions: config.dimensions,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const output = await extractor(
        texts.map((text) => config.prefix + text),
        { pooling: "mean", normalize: true },
      );
      const [rows, width] = output.dims;
      if (rows !== texts.length || width !== config.dimensions) {
        throw new Error(
          `Risposta inattesa dal modello: dimensioni ${output.dims.join("x")}, ` +
            `attese ${texts.length}x${config.dimensions}.`,
        );
      }
      return texts.map((_, i) => {
        const row = new Float32Array(config.dimensions);
        for (let j = 0; j < config.dimensions; j++) row[j] = output.data[i * config.dimensions + j]!;
        return row;
      });
    },
  };
}
