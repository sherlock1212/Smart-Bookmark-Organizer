import { defineConfig } from "vite";

// Build separata della pagina di prova nel browser (solo CI/sviluppo): non entra nell'app.
// I file del modello e di WASM NON vengono copiati qui: li serve scripts/smoke-server.mjs
// direttamente da public/, come farebbe l'app.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist-smoke",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: { input: "smoke.html" },
  },
});
