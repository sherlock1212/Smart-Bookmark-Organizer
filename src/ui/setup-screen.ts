import {
  filterFolders,
  flattenFolders,
  formatFolderPath,
  splitInbox,
} from "../bookmarks/inbox";
import type { BookmarkTree, BraveProfile } from "../bookmarks/types";
import { parseBookmarksFile } from "../brave/parse-bookmarks";
import { errorMessage } from "../errors";

/** Dipendenze esterne della schermata: sostituibili nei test. */
export interface SetupDeps {
  isTauri: () => boolean;
  getDataDir: () => Promise<string>;
  listProfiles: () => Promise<BraveProfile[]>;
  loadProfileBookmarks: (profileDir: string) => Promise<BookmarkTree>;
  readFileText: (file: File) => Promise<string>;
}

const MAX_WARNINGS_SHOWN = 20;

/** Crea un elemento. Il testo è sempre inserito come testo, mai come HTML. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Schermata iniziale: scelta del profilo Brave (o di un file Bookmarks) e della cartella
 * inbox. Per ora si ferma al riepilogo: lo smistamento arriva nei passi successivi.
 */
export function mountSetupScreen(root: HTMLElement, deps: SetupDeps): void {
  let tree: BookmarkTree | null = null;
  let profiles: BraveProfile[] = [];
  let inboxFolderId: string | null = null;
  let loadTicket = 0;

  // --- struttura ---
  const statusLine = h("p", { id: "status", role: "status" });
  const errorLine = h("p", { id: "error", role: "alert" });

  const profileSelect = h("select", { id: "profile-select" });
  const reloadButton = h("button", { id: "reload", type: "button" }, "Rileggi");
  const dataDirLine = h("p", { id: "data-dir", class: "hint" });
  const braveBlock = h(
    "div",
    { id: "brave-block" },
    h("label", { for: "profile-select" }, "Profilo Brave: "),
    profileSelect,
    " ",
    reloadButton,
    dataDirLine,
  );

  const fileInput = h("input", { id: "file-input", type: "file" });
  const fileBlock = h(
    "p",
    {},
    h("label", { for: "file-input" }, "Oppure apri a mano un file dei preferiti (Bookmarks): "),
    fileInput,
  );

  const loadedInfo = h("p", { id: "loaded-info" });
  const warningsBox = h("details", { id: "warnings" });
  const filterInput = h("input", {
    id: "folder-filter",
    type: "search",
    placeholder: "Scrivi per filtrare le cartelle…",
    "aria-label": "Filtra le cartelle",
  });
  const folderSelect = h("select", {
    id: "inbox-select",
    size: "10",
    "aria-label": "Cartella inbox",
  });
  const summary = h("div", { id: "summary" });
  const inboxSection = h(
    "section",
    { id: "inbox-section" },
    h("h2", {}, "2. Quale cartella contiene i preferiti da smistare?"),
    loadedInfo,
    warningsBox,
    h("p", {}, filterInput),
    h("p", {}, folderSelect),
    summary,
  );
  inboxSection.hidden = true;

  root.replaceChildren(
    h("h1", {}, "Smart Bookmark Organizer"),
    h(
      "section",
      { id: "source-section" },
      h("h2", {}, "1. Da dove leggo i preferiti?"),
      braveBlock,
      fileBlock,
      statusLine,
      errorLine,
    ),
    inboxSection,
  );

  // --- aggiornamento della vista ---
  const setStatus = (message: string | null): void => {
    statusLine.textContent = message ?? "";
  };
  const setError = (message: string | null): void => {
    errorLine.textContent = message ?? "";
  };

  const renderProfiles = (selected: string | null): void => {
    const options: HTMLOptionElement[] = [
      h("option", { value: "" }, "Scegli un profilo…"),
      ...profiles.map((p) => {
        const label = p.email ? `${p.displayName} (${p.email})` : p.displayName;
        return h("option", { value: p.dirName }, `${label} — ${p.dirName}`);
      }),
    ];
    profileSelect.replaceChildren(...options);
    profileSelect.value = selected ?? "";
  };

  const renderWarnings = (): void => {
    const warnings = tree?.warnings ?? [];
    warningsBox.hidden = warnings.length === 0;
    if (warnings.length === 0) {
      warningsBox.replaceChildren();
      return;
    }
    const shown = warnings.slice(0, MAX_WARNINGS_SHOWN);
    const rest = warnings.length - shown.length;
    warningsBox.replaceChildren(
      h("summary", {}, plural(warnings.length, "avviso di lettura", "avvisi di lettura")),
      h("ul", {}, ...shown.map((w) => h("li", {}, w))),
      ...(rest > 0 ? [h("p", {}, `…e altri ${rest}.`)] : []),
    );
  };

  const renderSummary = (): void => {
    if (!tree || inboxFolderId === null) {
      summary.replaceChildren();
      return;
    }
    const split = splitInbox(tree, inboxFolderId);
    const emptyDestinations = split.destinationFolders.filter(
      (f) => f.totalBookmarkCount === 0,
    ).length;
    const lines: Array<Node> = [
      h(
        "p",
        {},
        h("strong", {}, `Da smistare: ${plural(split.inbox.length, "preferito", "preferiti")}`),
        ` nella cartella "${formatFolderPath(split.inboxFolder)}".`,
      ),
      h(
        "p",
        {},
        `Riferimento: ${plural(split.reference.length, "preferito", "preferiti")} in ` +
          `${plural(split.destinationFolders.length, "cartella di destinazione", "cartelle di destinazione")}` +
          (emptyDestinations > 0 ? ` (${emptyDestinations} senza preferiti)` : "") +
          ".",
      ),
    ];
    if (split.ignoredInInboxSubfolders > 0) {
      lines.push(
        h(
          "p",
          { class: "warn" },
          `Attenzione: ${plural(split.ignoredInInboxSubfolders, "preferito è", "preferiti sono")} ` +
            "nelle sottocartelle dell'inbox e non verrà considerato; quelle sottocartelle " +
            "non saranno usate come destinazioni.",
        ),
      );
    }
    if (split.inbox.length === 0) {
      lines.push(h("p", { class: "warn" }, "Questa cartella non contiene preferiti da smistare."));
    }
    lines.push(
      h("p", { class: "hint" }, "Lo smistamento vero e proprio arriva nel prossimo passo di sviluppo."),
    );
    summary.replaceChildren(...lines);
  };

  const renderFolders = (): void => {
    if (!tree) {
      folderSelect.replaceChildren();
      return;
    }
    const visible = filterFolders(flattenFolders(tree), filterInput.value);
    folderSelect.replaceChildren(
      ...visible.map((f) => {
        const option = h(
          "option",
          { value: f.id },
          `${formatFolderPath(f)} (${f.bookmarkCount})`,
        );
        option.selected = f.id === inboxFolderId;
        return option;
      }),
    );
  };

  const applyTree = (newTree: BookmarkTree, origin: string): void => {
    tree = newTree;
    if (inboxFolderId !== null && !flattenFolders(newTree).some((f) => f.id === inboxFolderId)) {
      inboxFolderId = null;
    }
    inboxSection.hidden = false;
    loadedInfo.textContent =
      `Letti ${plural(newTree.bookmarks.length, "preferito", "preferiti")} in ` +
      `${plural(newTree.folderCount, "cartella", "cartelle")} (${origin}). ` +
      "Il numero tra parentesi è quello dei preferiti direttamente nella cartella.";
    renderWarnings();
    renderFolders();
    renderSummary();
    setStatus(null);
  };

  // --- azioni ---
  const loadProfile = async (dirName: string): Promise<void> => {
    const ticket = ++loadTicket;
    setError(null);
    setStatus("Leggo i preferiti…");
    try {
      const loaded = await deps.loadProfileBookmarks(dirName);
      if (ticket !== loadTicket) return; // nel frattempo l'utente ha scelto altro
      const name = profiles.find((p) => p.dirName === dirName)?.displayName ?? dirName;
      applyTree(loaded, `profilo "${name}"`);
    } catch (error) {
      if (ticket !== loadTicket) return;
      setStatus(null);
      setError(errorMessage(error));
    }
  };

  const loadProfileList = async (keepSelected: string | null): Promise<void> => {
    setError(null);
    setStatus("Cerco i profili di Brave…");
    try {
      dataDirLine.textContent = `Cartella di Brave: ${await deps.getDataDir()}`;
      profiles = await deps.listProfiles();
      const selected =
        keepSelected !== null && profiles.some((p) => p.dirName === keepSelected)
          ? keepSelected
          : profiles.length === 1
            ? (profiles[0]?.dirName ?? null)
            : null;
      renderProfiles(selected);
      setStatus(null);
      if (selected !== null) await loadProfile(selected);
    } catch (error) {
      setStatus(null);
      setError(
        `${errorMessage(error)} Puoi comunque aprire a mano un file dei preferiti qui sotto.`,
      );
    }
  };

  profileSelect.addEventListener("change", () => {
    if (profileSelect.value !== "") void loadProfile(profileSelect.value);
  });

  reloadButton.addEventListener("click", () => {
    void loadProfileList(profileSelect.value === "" ? null : profileSelect.value);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const ticket = ++loadTicket;
    setError(null);
    setStatus("Leggo il file…");
    deps
      .readFileText(file)
      .then((text) => {
        if (ticket !== loadTicket) return;
        applyTree(parseBookmarksFile(text), `file "${file.name}"`);
        profileSelect.value = "";
      })
      .catch((error: unknown) => {
        if (ticket !== loadTicket) return;
        setStatus(null);
        setError(errorMessage(error));
      });
  });

  filterInput.addEventListener("input", renderFolders);

  folderSelect.addEventListener("change", () => {
    inboxFolderId = folderSelect.value === "" ? null : folderSelect.value;
    renderSummary();
  });

  // --- avvio ---
  if (deps.isTauri()) {
    renderProfiles(null);
    void loadProfileList(null);
  } else {
    braveBlock.hidden = true;
    setStatus(
      "Lettura automatica di Brave non disponibile fuori dall'app: apri a mano un file dei preferiti.",
    );
  }
}
