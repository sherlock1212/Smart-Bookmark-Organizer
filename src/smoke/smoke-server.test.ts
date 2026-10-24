import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSmokeServer, resolveInside } from "../../scripts/smoke-server.mjs";

let base: string;
let dist: string;
let models: string;
let port = 0;
let server: ReturnType<typeof createSmokeServer>;
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'";

function get(path: string): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    // request() con path grezzo: non normalizza i segmenti ".." come farebbe fetch
    const req = request({ host: "127.0.0.1", port, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), "sbo-smoke-"));
  dist = join(base, "dist");
  models = join(base, "models");
  mkdirSync(join(dist, "assets"), { recursive: true });
  mkdirSync(join(models, "org", "m", "onnx"), { recursive: true });
  writeFileSync(join(dist, "smoke.html"), "<html>ok</html>");
  writeFileSync(join(dist, "assets", "x.wasm"), "wasm");
  writeFileSync(join(models, "org", "m", "onnx", "model.onnx"), "onnx");
  writeFileSync(join(base, "segreto.txt"), "NON DEVE USCIRE");
  server = createSmokeServer({ distDir: dist, modelsDir: models, csp: CSP });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
  rmSync(base, { recursive: true, force: true });
});

describe("smoke-server", () => {
  it("serve la pagina alla radice con la CSP e senza cache", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.body).toBe("<html>ok</html>");
    expect(res.headers["content-security-policy"]).toBe(CSP);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("usa il tipo giusto per i file WASM e serve i modelli da /models/", async () => {
    expect((await get("/assets/x.wasm")).headers["content-type"]).toBe("application/wasm");
    const model = await get("/models/org/m/onnx/model.onnx");
    expect(model.status).toBe(200);
    expect(model.body).toBe("onnx");
  });

  it("risponde 404 per file inesistenti", async () => {
    expect((await get("/non-esiste.js")).status).toBe(404);
    expect((await get("/models/org/non-esiste")).status).toBe(404);
  });

  it("non esce dalle cartelle servite (path traversal)", async () => {
    for (const path of [
      "/models/../segreto.txt",
      "/models/%2e%2e/segreto.txt",
      "/models/..%2fsegreto.txt",
      "/%2e%2e/segreto.txt",
      "/assets/..%2f..%2fsegreto.txt",
      "/models/%00",
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.body).not.toContain("NON DEVE USCIRE");
    }
  });
});

describe("resolveInside", () => {
  it("accetta file dentro la base e rifiuta il resto", () => {
    expect(resolveInside(dist, "smoke.html")).toBe(join(dist, "smoke.html"));
    expect(resolveInside(dist, "../segreto.txt")).toBeNull();
    expect(resolveInside(dist, "assets")).toBeNull(); // cartella, non file
    expect(resolveInside(dist, "%E0%A4%A")).toBeNull(); // codifica non valida
  });
});
