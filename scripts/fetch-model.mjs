// Scarica i file del modello di embedding a una revisione FISSA di Hugging Face e li mette in
// public/models/<modelId>/<file>, dove l'app li legge in locale (nessuna richiesta a Internet
// a runtime). Se nel manifesto è presente "sha256" per un file, la verifica è obbligatoria.
//
// Uso: node scripts/fetch-model.mjs
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "scripts", "model-manifest.json"), "utf8"));
const targetDir = join(root, "public", "models", ...manifest.modelId.split("/"));

const log = (message) => console.log(message);
const notice = (message) =>
  console.log(process.env.GITHUB_ACTIONS ? `::notice title=fetch-model::${message}` : message);

async function sha256Of(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function download(url, destination) {
  const tmp = `${destination}.part`;
  rmSync(tmp, { force: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} per ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmp));
  renameSync(tmp, destination);
}

let failed = false;
for (const file of manifest.files) {
  const destination = join(targetDir, ...file.path.split("/"));
  mkdirSync(dirname(destination), { recursive: true });

  if (existsSync(destination) && statSync(destination).size > 0) {
    if (!file.sha256 || (await sha256Of(destination)) === file.sha256) {
      log(`già presente: ${file.path}`);
      continue;
    }
    log(`hash diverso, riscarico: ${file.path}`);
  }

  const url = `https://huggingface.co/${manifest.modelId}/resolve/${manifest.revision}/${file.path}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await download(url, destination);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      log(`tentativo ${attempt} fallito per ${file.path}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  if (lastError) {
    console.error(`ERRORE: impossibile scaricare ${file.path}: ${lastError.message}`);
    failed = true;
    continue;
  }

  const size = statSync(destination).size;
  const digest = await sha256Of(destination);
  if (size === 0) {
    console.error(`ERRORE: ${file.path} è vuoto`);
    failed = true;
  } else if (file.sha256 && digest !== file.sha256) {
    console.error(`ERRORE: hash di ${file.path} non corrisponde (atteso ${file.sha256}, ottenuto ${digest})`);
    rmSync(destination, { force: true });
    failed = true;
  } else {
    notice(`${file.path}: ${size} byte, sha256 ${digest}${file.sha256 ? " (verificato)" : " (NON fissato nel manifesto)"}`);
  }
}

process.exit(failed ? 1 : 0);
