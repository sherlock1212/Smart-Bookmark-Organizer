import {
  SourceParseError,
  type Bookmark,
  type BookmarkTree,
  type Folder,
} from "../bookmarks/types";

/** Millisecondi tra 1601-01-01 (epoca di Chromium) e 1970-01-01. */
const CHROME_EPOCH_OFFSET_MS = 11_644_473_600_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Converte una data di Chromium (microsecondi dal 1601, come stringa) in ISO 8601.
 * Restituisce null per valori assenti, zero o non validi.
 * Usa BigInt perché i valori superano la precisione dei numeri normali.
 */
export function chromeTimeToIso(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const micros = BigInt(value);
  if (micros === 0n) return null;
  const unixMs = Number(micros / 1000n) - CHROME_EPOCH_OFFSET_MS;
  const date = new Date(unixMs);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

/**
 * Legge un file "Bookmarks" in formato Chromium (usato da Brave).
 * Funzione pura: nessun accesso a file o rete.
 */
export function parseBookmarksFile(text: string): BookmarkTree {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new SourceParseError(
      "Il file dei preferiti non è leggibile (JSON non valido).",
    );
  }
  const rootsRecord = isRecord(data) ? data["roots"] : undefined;
  if (!isRecord(rootsRecord)) {
    throw new SourceParseError(
      "Il file non sembra un file di preferiti di Brave o Chrome (manca la sezione 'roots').",
    );
  }

  const bookmarks: Bookmark[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  let folderCount = 0;

  const buildFolder = (
    node: Record<string, unknown>,
    parent: Folder | null,
  ): Folder | null => {
    const guid = readString(node, "guid") ?? "";
    const id = readString(node, "id") ?? (guid !== "" ? guid : null);
    const rawName = readString(node, "name") ?? "";
    const name = rawName.trim() !== "" ? rawName : "(senza nome)";
    if (id === null) {
      warnings.push(`Cartella "${name}" ignorata: manca l'identificativo.`);
      return null;
    }
    if (seenIds.has(`f:${id}`)) {
      warnings.push(`Cartella "${name}" ignorata: identificativo duplicato.`);
      return null;
    }
    seenIds.add(`f:${id}`);
    folderCount += 1;

    const folder: Folder = {
      id,
      guid,
      name,
      path: [...(parent?.path ?? []), name],
      parentId: parent?.id ?? null,
      isRoot: parent === null,
      children: [],
      bookmarkCount: 0,
      totalBookmarkCount: 0,
    };

    const children = node["children"];
    if (children !== undefined && !Array.isArray(children)) {
      warnings.push(`Cartella "${name}": elenco dei contenuti non valido.`);
      return folder;
    }

    for (const child of children ?? []) {
      if (!isRecord(child)) {
        warnings.push(`Elemento non valido in "${folder.path.join(" › ")}", ignorato.`);
        continue;
      }
      const type = readString(child, "type");
      if (type === "folder") {
        const sub = buildFolder(child, folder);
        if (sub) {
          folder.children.push(sub);
          folder.totalBookmarkCount += sub.totalBookmarkCount;
        }
      } else if (type === "url") {
        const url = readString(child, "url");
        const childGuid = readString(child, "guid") ?? "";
        const childId = readString(child, "id") ?? (childGuid !== "" ? childGuid : null);
        const title = readString(child, "name") ?? "";
        if (url === null || url.trim() === "" || childId === null) {
          warnings.push(
            `Preferito "${title}" in "${folder.path.join(" › ")}" ignorato: URL o identificativo mancante.`,
          );
          continue;
        }
        if (seenIds.has(`b:${childId}`)) {
          warnings.push(`Preferito "${title}" ignorato: identificativo duplicato.`);
          continue;
        }
        seenIds.add(`b:${childId}`);
        bookmarks.push({
          id: childId,
          guid: childGuid,
          title,
          url,
          folderId: folder.id,
          folderPath: folder.path,
          dateAdded: chromeTimeToIso(child["date_added"]),
        });
        folder.bookmarkCount += 1;
        folder.totalBookmarkCount += 1;
      } else {
        warnings.push(
          `Elemento di tipo sconosciuto (${type ?? "assente"}) in "${folder.path.join(" › ")}", ignorato.`,
        );
      }
    }
    return folder;
  };

  const roots: Folder[] = [];
  for (const value of Object.values(rootsRecord)) {
    // Le radici sono cartelle; gli altri campi (es. contatori di sincronizzazione) si ignorano.
    if (!isRecord(value) || readString(value, "type") !== "folder") continue;
    const root = buildFolder(value, null);
    if (root) roots.push(root);
  }

  if (roots.length === 0) {
    throw new SourceParseError("Il file non contiene nessuna cartella di preferiti.");
  }

  return { roots, bookmarks, folderCount, warnings };
}
