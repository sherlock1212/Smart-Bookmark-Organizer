import type { Bookmark, BookmarkTree, Folder } from "./types";

export interface InboxSplit {
  /** La cartella scelta come inbox. */
  inboxFolder: Folder;
  /** Preferiti direttamente nella cartella inbox: sono quelli da smistare. */
  inbox: Bookmark[];
  /** Preferiti fuori dall'inbox: servono solo come esempi di riferimento. */
  reference: Bookmark[];
  /**
   * Cartelle che possono ricevere preferiti: tutte tranne le radici
   * (barra dei preferiti, ecc.) e l'inbox con le sue sottocartelle.
   */
  destinationFolders: Folder[];
  /** Preferiti nelle sottocartelle dell'inbox: non sono né da smistare né di riferimento. */
  ignoredInInboxSubfolders: number;
}

/** Elenco piatto di tutte le cartelle, radici incluse, in ordine di visita. */
export function flattenFolders(tree: BookmarkTree): Folder[] {
  const result: Folder[] = [];
  const walk = (folder: Folder): void => {
    result.push(folder);
    folder.children.forEach(walk);
  };
  tree.roots.forEach(walk);
  return result;
}

/** Trova una cartella per id, o undefined. */
export function findFolder(tree: BookmarkTree, folderId: string): Folder | undefined {
  return flattenFolders(tree).find((f) => f.id === folderId);
}

/**
 * Separa i preferiti da smistare (inbox) da quelli di riferimento.
 * Lancia un errore se la cartella non esiste.
 *
 * Scelte (vedi PROJECT.md): le sottocartelle dell'inbox non vengono smistate né usate
 * come riferimento, e le radici non sono destinazioni.
 */
export function splitInbox(tree: BookmarkTree, inboxFolderId: string): InboxSplit {
  const folders = flattenFolders(tree);
  const inboxFolder = folders.find((f) => f.id === inboxFolderId);
  if (!inboxFolder) {
    throw new Error(`Cartella inbox non trovata (id ${inboxFolderId}).`);
  }

  const inboxTreeIds = new Set(flattenFolders({ ...tree, roots: [inboxFolder] }).map((f) => f.id));

  const inbox: Bookmark[] = [];
  const reference: Bookmark[] = [];
  let ignoredInInboxSubfolders = 0;
  for (const bookmark of tree.bookmarks) {
    if (bookmark.folderId === inboxFolder.id) {
      inbox.push(bookmark);
    } else if (inboxTreeIds.has(bookmark.folderId)) {
      ignoredInInboxSubfolders += 1;
    } else {
      reference.push(bookmark);
    }
  }

  const destinationFolders = folders.filter((f) => !f.isRoot && !inboxTreeIds.has(f.id));

  return { inboxFolder, inbox, reference, destinationFolders, ignoredInInboxSubfolders };
}

/** Testo leggibile del percorso di una cartella. */
export function formatFolderPath(folder: Pick<Folder, "path">): string {
  return folder.path.join(" › ");
}

/**
 * Filtra le cartelle per una ricerca testuale (ignora maiuscole e accenti).
 * Una ricerca vuota restituisce tutte le cartelle. Tutte le parole devono comparire.
 */
export function filterFolders<T extends Pick<Folder, "path">>(folders: T[], query: string): T[] {
  const normalize = (s: string): string =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const words = normalize(query).split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return folders;
  return folders.filter((folder) => {
    const haystack = normalize(formatFolderPath(folder));
    return words.every((w) => haystack.includes(w));
  });
}
