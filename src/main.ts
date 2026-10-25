import "./style.css";
import { getBraveDataDir, isTauri, loadBraveBookmarks, loadBraveProfiles } from "./brave/bridge";
import { mountSetupScreen } from "./ui/setup-screen";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Elemento #app non trovato in index.html");
}

mountSetupScreen(root, {
  isTauri,
  getDataDir: getBraveDataDir,
  listProfiles: loadBraveProfiles,
  loadProfileBookmarks: loadBraveBookmarks,
  readFileText: (file) => file.text(),
  // Il modello si carica solo quando l'utente avvia la classificazione, non all'avvio dell'app.
  createEmbedder: async () => {
    const [{ createTransformersEmbedder }, { appEmbedderConfig }] = await Promise.all([
      import("./classify/transformers-embedder"),
      import("./classify/app-embedder-config"),
    ]);
    return createTransformersEmbedder(appEmbedderConfig());
  },
});
