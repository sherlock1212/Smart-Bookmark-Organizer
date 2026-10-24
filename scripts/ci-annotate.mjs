// Mostra i risultati misurati come annotazioni di GitHub Actions: i log completi della CI non
// sono leggibili da tutti gli ambienti, le annotazioni sì. Uso: node scripts/ci-annotate.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CHUNK = 3000;
const files = ["model-quality.json", "browser-smoke.json"];

function emit(level, title, text) {
  const compact = text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  for (let i = 0, part = 1; i < compact.length; i += CHUNK, part++) {
    const suffix = compact.length > CHUNK ? ` (${part})` : "";
    console.log(`::${level} title=${title}${suffix}::${compact.slice(i, i + CHUNK)}`);
  }
}

for (const name of files) {
  const path = join("results", name);
  if (!existsSync(path)) {
    emit("warning", name, "file dei risultati non prodotto");
    continue;
  }
  const data = JSON.parse(readFileSync(path, "utf8"));
  const level = data.ok === false ? "error" : "notice";
  emit(level, name, JSON.stringify(data));
}
