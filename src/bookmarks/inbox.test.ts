import { describe, expect, it } from "vitest";
import { parseBookmarksFile } from "../brave/parse-bookmarks";
import { bookmarksFile, folderNode, sampleBookmarks, urlNode } from "../test-fixtures/chromium";
import { filterFolders, findFolder, flattenFolders, formatFolderPath, splitInbox } from "./inbox";

const tree = parseBookmarksFile(sampleBookmarks());

describe("splitInbox", () => {
  const split = splitInbox(tree, "10");

  it("mette in inbox solo i preferiti della cartella scelta", () => {
    expect(split.inbox.map((b) => b.id)).toEqual(["100", "101", "102"]);
    expect(split.inboxFolder.name).toBe("Inbox");
  });

  it("tutti gli altri preferiti sono di riferimento", () => {
    expect(split.reference).toHaveLength(6);
    expect(split.reference.some((b) => b.folderId === "10")).toBe(false);
  });

  it("nessun elemento perso né duplicato: inbox + riferimento + ignorati = totale", () => {
    const ids = [...split.inbox, ...split.reference].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length + split.ignoredInInboxSubfolders).toBe(tree.bookmarks.length);
  });

  it("le destinazioni escludono radici e inbox, e includono le cartelle vuote", () => {
    const names = split.destinationFolders.map((f) => f.name);
    expect(names).toEqual(["Viaggi", "Italia", "Vuota", "Programmazione"]);
  });

  it("le sottocartelle dell'inbox non sono destinazioni né riferimento", () => {
    const withSub = parseBookmarksFile(
      bookmarksFile({
        bookmark_bar: folderNode("1", "Barra", [
          folderNode("10", "Inbox", [
            urlNode("100", "A", "https://example.com/a"),
            folderNode("11", "Sotto", [urlNode("110", "B", "https://example.com/b")]),
          ]),
          folderNode("12", "Altro", [urlNode("120", "C", "https://example.com/c")]),
        ]),
      }),
    );
    const result = splitInbox(withSub, "10");
    expect(result.inbox.map((b) => b.id)).toEqual(["100"]);
    expect(result.reference.map((b) => b.id)).toEqual(["120"]);
    expect(result.ignoredInInboxSubfolders).toBe(1);
    expect(result.destinationFolders.map((f) => f.name)).toEqual(["Altro"]);
  });

  it("l'inbox può essere una radice: in quel caso nessun'altra radice è destinazione", () => {
    const result = splitInbox(tree, "2");
    expect(result.inbox.map((b) => b.id)).toEqual(["21"]);
    // Programmazione è dentro la radice scelta come inbox: ignorata, non destinazione
    expect(result.destinationFolders.map((f) => f.name)).toEqual(["Inbox", "Viaggi", "Italia", "Vuota"]);
    expect(result.ignoredInInboxSubfolders).toBe(2);
  });

  it("lancia un errore se la cartella non esiste", () => {
    expect(() => splitInbox(tree, "nope")).toThrow(/non trovata/);
  });

  it("non modifica l'albero di origine", () => {
    const before = JSON.stringify(tree);
    splitInbox(tree, "10");
    expect(JSON.stringify(tree)).toBe(before);
  });
});

describe("flattenFolders / findFolder", () => {
  it("elenca tutte le cartelle, radici incluse", () => {
    expect(flattenFolders(tree)).toHaveLength(tree.folderCount);
  });

  it("trova una cartella per id", () => {
    expect(findFolder(tree, "12")?.name).toBe("Italia");
    expect(findFolder(tree, "999")).toBeUndefined();
  });
});

describe("filterFolders", () => {
  const folders = flattenFolders(tree);

  it("restituisce tutto con ricerca vuota", () => {
    expect(filterFolders(folders, "   ")).toHaveLength(folders.length);
  });

  it("cerca nel percorso completo, senza distinguere maiuscole e accenti", () => {
    expect(filterFolders(folders, "VIAGGI italia").map((f) => f.name)).toEqual(["Italia"]);
    const accented = [{ path: ["Radice", "Caffè e tè"] }];
    expect(filterFolders(accented, "caffe")).toHaveLength(1);
  });

  it("nessun risultato se una parola non compare", () => {
    expect(filterFolders(folders, "viaggi zzz")).toEqual([]);
  });
});

describe("formatFolderPath", () => {
  it("unisce i nomi con il separatore", () => {
    expect(formatFolderPath({ path: ["A", "B"] })).toBe("A › B");
  });
});
