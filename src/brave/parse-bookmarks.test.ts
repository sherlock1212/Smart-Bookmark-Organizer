import { describe, expect, it } from "vitest";
import { SourceParseError } from "../bookmarks/types";
import {
  bookmarksFile,
  folderNode,
  sampleBookmarks,
  urlNode,
} from "../test-fixtures/chromium";
import { chromeTimeToIso, parseBookmarksFile } from "./parse-bookmarks";

describe("chromeTimeToIso", () => {
  it("converte microsecondi dal 1601 in ISO", () => {
    // 2022-01-01T00:00:00Z = (1640995200 + 11644473600) secondi * 1e6
    expect(chromeTimeToIso("13285468800000000")).toBe("2022-01-01T00:00:00.000Z");
  });

  it("restituisce null per valori assenti, zero o non validi", () => {
    expect(chromeTimeToIso(undefined)).toBeNull();
    expect(chromeTimeToIso("0")).toBeNull();
    expect(chromeTimeToIso("abc")).toBeNull();
    expect(chromeTimeToIso("-5")).toBeNull();
    expect(chromeTimeToIso(12345)).toBeNull();
    expect(chromeTimeToIso("99999999999999999999999")).toBeNull();
  });
});

describe("parseBookmarksFile", () => {
  const tree = parseBookmarksFile(sampleBookmarks());

  it("legge le radici ignorando i campi che non sono cartelle", () => {
    expect(tree.roots.map((r) => r.name)).toEqual(["Bookmarks bar", "Other bookmarks"]);
    expect(tree.roots.every((r) => r.isRoot && r.parentId === null)).toBe(true);
  });

  it("conta cartelle e preferiti", () => {
    expect(tree.folderCount).toBe(7); // 2 radici + Inbox, Viaggi, Italia, Vuota, Programmazione
    expect(tree.bookmarks).toHaveLength(9);
    expect(tree.warnings).toEqual([]);
  });

  it("calcola i conteggi diretti e totali per cartella", () => {
    const bar = tree.roots[0]!;
    const viaggi = bar.children.find((f) => f.name === "Viaggi")!;
    expect(viaggi.bookmarkCount).toBe(1);
    expect(viaggi.totalBookmarkCount).toBe(3);
    expect(bar.totalBookmarkCount).toBe(6);
  });

  it("costruisce percorso completo e riferimento al genitore", () => {
    const italia = tree.roots[0]!.children[1]!.children[0]!;
    expect(italia.path).toEqual(["Bookmarks bar", "Viaggi", "Italia"]);
    expect(italia.parentId).toBe("11");
    expect(italia.isRoot).toBe(false);
  });

  it("conserva titolo, URL, cartella e data originali", () => {
    const b = tree.bookmarks.find((x) => x.id === "120")!;
    expect(b).toEqual({
      id: "120",
      guid: "guid-120",
      title: "Treni Italia",
      url: "https://example.com/treni",
      folderId: "12",
      folderPath: ["Bookmarks bar", "Viaggi", "Italia"],
      dateAdded: "2022-01-01T00:00:00.000Z",
    });
  });

  it("gestisce i preferiti sciolti direttamente in una radice", () => {
    const b = tree.bookmarks.find((x) => x.id === "21")!;
    expect(b.folderId).toBe("2");
    expect(b.folderPath).toEqual(["Other bookmarks"]);
  });

  it("accetta cartelle senza 'children'", () => {
    const node = folderNode("1", "Radice");
    delete node["children"];
    const result = parseBookmarksFile(bookmarksFile({ bookmark_bar: node }));
    expect(result.roots[0]!.totalBookmarkCount).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("accetta un BOM iniziale", () => {
    const result = parseBookmarksFile("﻿" + sampleBookmarks());
    expect(result.bookmarks).toHaveLength(9);
  });

  it("ignora e segnala preferiti senza URL, senza id o duplicati", () => {
    const result = parseBookmarksFile(
      bookmarksFile({
        bookmark_bar: folderNode("1", "Barra", [
          { id: "5", name: "Senza URL", type: "url" },
          { name: "Senza id", type: "url", url: "https://example.com/x" },
          urlNode("6", "Buono", "https://example.com/ok"),
          urlNode("6", "Doppione", "https://example.com/ok2"),
        ]),
      }),
    );
    expect(result.bookmarks.map((b) => b.title)).toEqual(["Buono"]);
    expect(result.warnings).toHaveLength(3);
  });

  it("segnala tipi sconosciuti ed elementi non validi senza interrompersi", () => {
    const result = parseBookmarksFile(
      bookmarksFile({
        bookmark_bar: folderNode("1", "Barra", [
          { id: "9", type: "qualcosa", name: "?" },
          "stringa" as unknown as Record<string, unknown>,
          urlNode("6", "Buono", "https://example.com/ok"),
        ]),
      }),
    );
    expect(result.bookmarks).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
  });

  it("non perde né inventa elementi: ogni preferito è contato nella sua cartella", () => {
    const perFolder = new Map<string, number>();
    for (const b of tree.bookmarks) perFolder.set(b.folderId, (perFolder.get(b.folderId) ?? 0) + 1);
    const walk = (folders: typeof tree.roots): void => {
      for (const f of folders) {
        expect(f.bookmarkCount).toBe(perFolder.get(f.id) ?? 0);
        walk(f.children);
      }
    };
    walk(tree.roots);
  });

  it("dà nome 'senza nome' alle cartelle prive di nome", () => {
    const node = folderNode("1", "");
    const result = parseBookmarksFile(bookmarksFile({ bookmark_bar: node }));
    expect(result.roots[0]!.name).toBe("(senza nome)");
  });

  it("mantiene i caratteri speciali nei titoli e negli URL", () => {
    const result = parseBookmarksFile(
      bookmarksFile({
        bookmark_bar: folderNode("1", "Barra", [
          urlNode("6", "Città — «prova» 日本", "https://example.com/a?b=1&c=%C3%A0#x"),
        ]),
      }),
    );
    expect(result.bookmarks[0]!.title).toBe("Città — «prova» 日本");
    expect(result.bookmarks[0]!.url).toBe("https://example.com/a?b=1&c=%C3%A0#x");
  });

  it("segnala file non validi", () => {
    expect(() => parseBookmarksFile("non json")).toThrow(SourceParseError);
    expect(() => parseBookmarksFile("{}")).toThrow(/roots/);
    expect(() => parseBookmarksFile(JSON.stringify({ roots: {} }))).toThrow(/nessuna cartella/);
  });
});
