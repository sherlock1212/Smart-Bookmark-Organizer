// Piccolo server statico per la prova nel browser: serve la pagina compilata (dist-smoke) e i
// file del modello (public/models) da una sola origine, con la stessa Content-Security-Policy
// dell'app. Ascolta solo su 127.0.0.1.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
};

/** Percorso assoluto di `relative` dentro `base`, o null se esce da `base` o non è un file. */
export function resolveInside(base, relative) {
  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const root = resolve(base);
  const full = resolve(root, decoded);
  if (full !== root && !full.startsWith(root + sep)) return null;
  try {
    return statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

export function createSmokeServer({ distDir, modelsDir, csp }) {
  return createServer((request, response) => {
    const pathname = (request.url ?? "/").split("?")[0] ?? "/";
    let file = null;
    if (pathname.startsWith("/models/")) {
      file = resolveInside(modelsDir, pathname.slice("/models/".length));
    } else {
      file = resolveInside(distDir, pathname === "/" ? "smoke.html" : pathname.slice(1));
    }
    if (!file) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("non trovato");
      return;
    }
    response.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Content-Length": statSync(file).size,
      "Content-Security-Policy": csp,
      "Cache-Control": "no-store",
    });
    createReadStream(file).pipe(response);
  });
}
