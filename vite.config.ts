import { defineConfig } from "vite";

// Porta fissa: Tauri la usa come devUrl (vedi src-tauri/tauri.conf.json).
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
