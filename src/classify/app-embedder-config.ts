// I file WASM si importano con ?url direttamente dalla libreria: Vite li include nel pacchetto
// con un nome univoco (una sola copia) e la loro versione coincide sempre con quella della
// libreria. Senza questo, la libreria li scaricherebbe da una CDN.
import ortFactoryUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortWasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url";
import { MODEL_MANIFEST } from "./model-manifest";
import type { TransformersEmbedderConfig } from "./transformers-embedder";

/**
 * Configurazione dell'embedder dentro l'app: i file del modello sono serviti dalla stessa
 * origine dell'interfaccia (cartella /models/, riempita da `npm run assets`), insieme ai file WASM.
 */
export function appEmbedderConfig(origin: string = window.location.origin): TransformersEmbedderConfig {
  return {
    modelId: MODEL_MANIFEST.modelId,
    revision: MODEL_MANIFEST.revision,
    dtype: MODEL_MANIFEST.dtype,
    prefix: MODEL_MANIFEST.prefix,
    dimensions: MODEL_MANIFEST.dimensions,
    localModelPath: new URL("/models/", origin).href,
    wasmPaths: {
      mjs: new URL(ortFactoryUrl, origin).href,
      wasm: new URL(ortWasmUrl, origin).href,
    },
  };
}
