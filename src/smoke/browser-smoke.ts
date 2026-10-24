// Pagina di prova (solo sviluppo/CI): esegue l'embedder vero in WASM dentro un browser, con la
// stessa CSP dell'app, e pubblica il risultato in window.__smoke per il pilota (scripts/browser-smoke.mjs).
import { runCorpusBenchmark } from "../classify/benchmark";
import { appEmbedderConfig } from "../classify/app-embedder-config";
import { createTransformersEmbedder } from "../classify/transformers-embedder";
import { buildRealisticCorpus } from "../test-fixtures/realistic-corpus";

export interface SmokeResult {
  done: boolean;
  ok: boolean;
  error: string | null;
  crossOriginIsolated: boolean;
  loadMs: number | null;
  referenceTexts: string[];
  referenceVectors: number[][];
  benchmark: Record<string, unknown> | null;
  cspViolations: string[];
}

declare global {
  interface Window {
    __smoke?: SmokeResult;
  }
}

const REFERENCE_TEXTS = ["ricetta della carbonara", "Weekend a Praga: cosa fare", "TypeScript handbook: generics"];

async function run(): Promise<void> {
  const result: SmokeResult = {
    done: false,
    ok: false,
    error: null,
    crossOriginIsolated: window.crossOriginIsolated,
    loadMs: null,
    referenceTexts: REFERENCE_TEXTS,
    referenceVectors: [],
    benchmark: null,
    cspViolations: [],
  };
  document.addEventListener("securitypolicyviolation", (event) => {
    result.cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
  });

  try {
    const started = performance.now();
    const embedder = await createTransformersEmbedder(appEmbedderConfig());
    result.loadMs = Math.round(performance.now() - started);

    result.referenceVectors = (await embedder.embed(REFERENCE_TEXTS)).map((v) => Array.from(v));
    result.benchmark = await runCorpusBenchmark(embedder, buildRealisticCorpus());
    result.ok = true;
  } catch (error) {
    result.error = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  }
  result.done = true;
  window.__smoke = result;
  const out = document.getElementById("out");
  if (out) out.textContent = result.ok ? "Prova completata." : `Prova fallita: ${result.error}`;
}

void run();
