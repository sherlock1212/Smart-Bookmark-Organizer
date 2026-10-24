// Prova dell'embedder nel browser (WASM), con la stessa CSP dell'app.
//
// Richiede: `npm run assets` (modello in public/models) e
//           `npx vite build -c vite.smoke.config.ts` (pagina in dist-smoke).
// Usa Chrome già installato (in CI: canale "chrome"); in locale si può indicare il percorso
// con SMOKE_CHROME_PATH. Scrive results/browser-smoke.json ed esce con codice 1 se qualcosa non va.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createSmokeServer } from "./smoke-server.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const csp = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")).app.security.csp;
const distDir = join(root, "dist-smoke");
const modelsDir = join(root, "public", "models");
const referencePath = join(root, "results", "reference-vectors.json");

const problems = [];
const fail = (message) => problems.push(message);

if (!existsSync(join(distDir, "smoke.html"))) fail("dist-smoke/smoke.html non trovato: esegui la build di prova.");
if (!existsSync(modelsDir)) fail("public/models non trovato: esegui `npm run assets`.");
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const server = createSmokeServer({ distDir, modelsDir, csp });
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const consoleMessages = [];
const externalRequests = [];
const failedRequests = [];
let smoke = null;
let browser = null;

try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.SMOKE_CHROME_PATH
      ? { executablePath: process.env.SMOKE_CHROME_PATH }
      : { channel: process.env.SMOKE_CHROME_CHANNEL ?? "chrome" }),
  });
  const page = await browser.newPage();
  page.on("console", (m) => consoleMessages.push(`${m.type()}: ${m.text()}`.slice(0, 500)));
  page.on("pageerror", (e) => consoleMessages.push(`pageerror: ${e.message}`.slice(0, 500)));
  page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:")) {
      externalRequests.push(url);
    }
  });
  page.on("requestfailed", (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ""}`));

  await page.goto(`${origin}/smoke.html`);
  await page.waitForFunction(() => window.__smoke?.done === true, undefined, { timeout: 600_000 });
  smoke = await page.evaluate(() => window.__smoke);
} catch (error) {
  fail(`Esecuzione nel browser non riuscita: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser?.close();
  server.close();
}

const cosine = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const checks = {};

if (smoke) {
  if (!smoke.ok) fail(`La pagina ha riportato un errore: ${smoke.error}`);
  if (smoke.cspViolations.length > 0) fail(`Violazioni della CSP: ${smoke.cspViolations.join(" | ")}`);

  if (existsSync(referencePath)) {
    const reference = JSON.parse(readFileSync(referencePath, "utf8"));
    checks.similarityToNode = reference.vectors.map((v, i) =>
      smoke.referenceVectors[i] ? Number(cosine(v, smoke.referenceVectors[i]).toFixed(5)) : null,
    );
    if (checks.similarityToNode.some((s) => s === null || s < 0.98)) {
      fail(`Vettori nel browser troppo diversi da quelli di Node: ${JSON.stringify(checks.similarityToNode)}`);
    }
  } else {
    checks.similarityToNode = "riferimento di Node non disponibile";
  }

  const bench = smoke.benchmark;
  if (bench && bench.inbox && bench.inbox.top3 < 0.75) fail(`top3 troppo basso nel browser: ${bench.inbox.top3}`);
}
if (externalRequests.length > 0) fail(`Richieste verso l'esterno (non dovrebbero esistere): ${externalRequests.join(", ")}`);

const report = {
  ok: problems.length === 0,
  problems,
  crossOriginIsolated: smoke?.crossOriginIsolated ?? null,
  loadMs: smoke?.loadMs ?? null,
  benchmark: smoke?.benchmark ?? null,
  checks,
  externalRequests,
  failedRequests: failedRequests.slice(0, 20),
  console: consoleMessages.slice(0, 40),
};
mkdirSync(join(root, "results"), { recursive: true });
writeFileSync(join(root, "results", "browser-smoke.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, problems, loadMs: report.loadMs, checks }, null, 2));
process.exit(report.ok ? 0 : 1);
