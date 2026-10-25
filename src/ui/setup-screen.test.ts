// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { BookmarkTree, BraveProfile } from "../bookmarks/types";
import { parseBookmarksFile } from "../brave/parse-bookmarks";
import { parseLocalState } from "../brave/parse-local-state";
import { HashingEmbedder } from "../test-fixtures/hashing-embedder";
import {
  bookmarksFile,
  folderNode,
  sampleBookmarks,
  sampleLocalState,
  urlNode,
} from "../test-fixtures/chromium";
import { mountSetupScreen, type SetupDeps } from "./setup-screen";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeDeps(overrides: Partial<SetupDeps> = {}): SetupDeps {
  return {
    isTauri: () => true,
    getDataDir: async () => "C:\\Users\\x\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data",
    listProfiles: async () => parseLocalState(sampleLocalState()),
    loadProfileBookmarks: async () => parseBookmarksFile(sampleBookmarks()),
    readFileText: async () => sampleBookmarks(),
    createEmbedder: async () => new HashingEmbedder(),
    ...overrides,
  };
}

let root: HTMLElement;
const q = <T extends HTMLElement>(selector: string): T => {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Elemento non trovato: ${selector}`);
  return el;
};
const optionValues = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).map((o) => o.value);

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  root = document.getElementById("app")!;
});

describe("schermata iniziale: dentro Tauri", () => {
  it("mostra i profili e non legge nulla finché non ne scegli uno", async () => {
    let loads = 0;
    mountSetupScreen(
      root,
      makeDeps({
        loadProfileBookmarks: async () => {
          loads += 1;
          return parseBookmarksFile(sampleBookmarks());
        },
      }),
    );
    await flush();

    expect(optionValues(q("#profile-select"))).toEqual(["", "Default", "Profile 2", "Profile 10"]);
    expect(q("#data-dir").textContent).toContain("Brave-Browser");
    expect(loads).toBe(0);
    expect(q("#inbox-section").hidden).toBe(true);
  });

  it("con un solo profilo lo legge subito", async () => {
    const one: BraveProfile[] = [{ dirName: "Default", displayName: "Persona 1", email: null }];
    mountSetupScreen(root, makeDeps({ listProfiles: async () => one }));
    await flush();
    expect(q("#inbox-section").hidden).toBe(false);
    expect(q<HTMLSelectElement>("#profile-select").value).toBe("Default");
  });

  it("scelto un profilo elenca le cartelle e, scelta l'inbox, mostra il riepilogo", async () => {
    mountSetupScreen(root, makeDeps());
    await flush();
    choose(q<HTMLSelectElement>("#profile-select"), "Default");
    await flush();

    expect(q("#loaded-info").textContent).toContain("9 preferiti");
    expect(q("#loaded-info").textContent).toContain("7 cartelle");

    choose(q<HTMLSelectElement>("#inbox-select"), "10");
    const text = q("#summary").textContent ?? "";
    expect(text).toContain("Da smistare: 3 preferiti");
    expect(text).toContain("Bookmarks bar › Inbox");
    expect(text).toContain("Riferimento: 6 preferiti in 4 cartelle di destinazione");
    expect(text).toContain("1 senza preferiti");
  });

  it("il filtro riduce l'elenco e conserva l'inbox già scelta", async () => {
    mountSetupScreen(root, makeDeps());
    await flush();
    choose(q<HTMLSelectElement>("#profile-select"), "Default");
    await flush();
    choose(q<HTMLSelectElement>("#inbox-select"), "10");

    const filter = q<HTMLInputElement>("#folder-filter");
    filter.value = "italia";
    filter.dispatchEvent(new Event("input"));
    expect(optionValues(q("#inbox-select"))).toEqual(["12"]);
    expect(q("#summary").textContent).toContain("Da smistare: 3 preferiti");

    filter.value = "";
    filter.dispatchEvent(new Event("input"));
    expect(q<HTMLSelectElement>("#inbox-select").value).toBe("10");
  });

  it("se due letture si sovrappongono vale solo l'ultima scelta", async () => {
    const slow = deferred<BookmarkTree>();
    const fast = parseBookmarksFile(
      bookmarksFile({ bookmark_bar: folderNode("1", "Solo veloce", [urlNode("5", "x", "https://e.com")]) }),
    );
    mountSetupScreen(
      root,
      makeDeps({
        loadProfileBookmarks: (dir) => (dir === "Default" ? slow.promise : Promise.resolve(fast)),
      }),
    );
    await flush();
    choose(q<HTMLSelectElement>("#profile-select"), "Default");
    choose(q<HTMLSelectElement>("#profile-select"), "Profile 2");
    await flush();
    slow.resolve(parseBookmarksFile(sampleBookmarks()));
    await flush();

    expect(q("#loaded-info").textContent).toContain("1 preferito in 1 cartella");
  });

  it("mostra un errore comprensibile se non riesce a leggere i profili", async () => {
    mountSetupScreen(
      root,
      makeDeps({ listProfiles: () => Promise.reject("Non trovo il file 'Local State' di Brave.") }),
    );
    await flush();
    const error = q("#error").textContent ?? "";
    expect(error).toContain("Local State");
    expect(error).toContain("aprire a mano un file");
  });

  it("mostra l'errore se la lettura del profilo fallisce", async () => {
    mountSetupScreen(
      root,
      makeDeps({
        loadProfileBookmarks: () => Promise.reject("Il profilo 'Default' non ha ancora un file dei preferiti."),
      }),
    );
    await flush();
    choose(q<HTMLSelectElement>("#profile-select"), "Default");
    await flush();
    expect(q("#error").textContent).toContain("non ha ancora un file");
    expect(q("#inbox-section").hidden).toBe(true);
  });

  it("'Rileggi' riprende l'elenco dei profili e conserva quello scelto", async () => {
    let listCalls = 0;
    mountSetupScreen(
      root,
      makeDeps({
        listProfiles: async () => {
          listCalls += 1;
          return parseLocalState(sampleLocalState());
        },
      }),
    );
    await flush();
    choose(q<HTMLSelectElement>("#profile-select"), "Profile 2");
    await flush();
    q<HTMLButtonElement>("#reload").click();
    await flush();
    expect(listCalls).toBe(2);
    expect(q<HTMLSelectElement>("#profile-select").value).toBe("Profile 2");
  });
});

describe("schermata iniziale: contenuti", () => {
  it("avverte se l'inbox ha sottocartelle o è vuota", async () => {
    const withSub = bookmarksFile({
      bookmark_bar: folderNode("1", "Barra", [
        folderNode("10", "Inbox", [folderNode("11", "Sotto", [urlNode("110", "B", "https://e.com/b")])]),
      ]),
    });
    mountSetupScreen(root, makeDeps({ isTauri: () => false, readFileText: async () => withSub }));
    const input = q<HTMLInputElement>("#file-input");
    Object.defineProperty(input, "files", { value: [new File(["x"], "Bookmarks")] });
    input.dispatchEvent(new Event("change"));
    await flush();
    choose(q<HTMLSelectElement>("#inbox-select"), "10");

    const text = q("#summary").textContent ?? "";
    expect(text).toContain("nelle sottocartelle dell'inbox");
    expect(text).toContain("non contiene preferiti da smistare");
  });

  it("mostra gli avvisi di lettura", async () => {
    const odd = bookmarksFile({
      bookmark_bar: folderNode("1", "Barra", [{ id: "9", type: "boh", name: "?" }]),
    });
    mountSetupScreen(root, makeDeps({ isTauri: () => false, readFileText: async () => odd }));
    const input = q<HTMLInputElement>("#file-input");
    Object.defineProperty(input, "files", { value: [new File(["x"], "Bookmarks")] });
    input.dispatchEvent(new Event("change"));
    await flush();
    expect(q<HTMLElement>("#warnings").hidden).toBe(false);
    expect(q("#warnings").textContent).toContain("1 avviso di lettura");
  });

  it("i nomi delle cartelle con HTML restano testo (nessun elemento creato)", async () => {
    const evil = bookmarksFile({
      bookmark_bar: folderNode("1", "<img src=x onerror=alert(1)>", [
        folderNode("10", "<b>grassetto</b>", []),
      ]),
    });
    mountSetupScreen(root, makeDeps({ isTauri: () => false, readFileText: async () => evil }));
    const input = q<HTMLInputElement>("#file-input");
    Object.defineProperty(input, "files", { value: [new File(["x"], "Bookmarks")] });
    input.dispatchEvent(new Event("change"));
    await flush();
    choose(q<HTMLSelectElement>("#inbox-select"), "10");

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("b")).toBeNull();
    expect(q("#inbox-select").textContent).toContain("<b>grassetto</b>");
    expect(q("#summary").textContent).toContain("<b>grassetto</b>");
  });
});

describe("schermata iniziale: fuori da Tauri", () => {
  it("nasconde Brave, spiega perché e permette di aprire un file", async () => {
    mountSetupScreen(root, makeDeps({ isTauri: () => false }));
    expect(q<HTMLElement>("#brave-block").hidden).toBe(true);
    expect(q("#status").textContent).toContain("apri a mano");

    const input = q<HTMLInputElement>("#file-input");
    Object.defineProperty(input, "files", { value: [new File(["x"], "Bookmarks")] });
    input.dispatchEvent(new Event("change"));
    await flush();
    expect(q("#loaded-info").textContent).toContain('file "Bookmarks"');
    expect(q<HTMLSelectElement>("#inbox-select").options.length).toBe(7);
  });

  it("segnala un file non valido senza bloccarsi", async () => {
    mountSetupScreen(root, makeDeps({ isTauri: () => false, readFileText: async () => "non json" }));
    const input = q<HTMLInputElement>("#file-input");
    Object.defineProperty(input, "files", { value: [new File(["x"], "Bookmarks")] });
    input.dispatchEvent(new Event("change"));
    await flush();
    expect(q("#error").textContent).toContain("non è leggibile");
    expect(q("#inbox-section").hidden).toBe(true);
  });
});
