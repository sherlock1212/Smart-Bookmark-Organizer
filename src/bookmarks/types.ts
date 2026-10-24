/** Un preferito letto da una sorgente. L'origine non viene mai modificata. */
export interface Bookmark {
  /** Identificativo interno del file di origine (id di Chromium). */
  id: string;
  guid: string;
  title: string;
  url: string;
  /** Id della cartella che lo contiene. */
  folderId: string;
  /** Percorso completo della cartella, radice compresa. */
  folderPath: string[];
  /** Data di aggiunta in formato ISO 8601, o null se assente o non valida. */
  dateAdded: string | null;
}

export interface Folder {
  id: string;
  guid: string;
  name: string;
  /** Percorso completo, radice compresa, nome della cartella incluso. */
  path: string[];
  parentId: string | null;
  isRoot: boolean;
  children: Folder[];
  /** Preferiti direttamente contenuti (sottocartelle escluse). */
  bookmarkCount: number;
  /** Preferiti contenuti, sottocartelle incluse. */
  totalBookmarkCount: number;
}

export interface BookmarkTree {
  /** Cartelle radice (barra dei preferiti, altri preferiti, ecc.). */
  roots: Folder[];
  bookmarks: Bookmark[];
  /** Numero totale di cartelle, radici incluse. */
  folderCount: number;
  /** Elementi ignorati o anomali, in italiano, da mostrare all'utente. */
  warnings: string[];
}

export interface BraveProfile {
  /** Nome della cartella del profilo ("Default", "Profile 1", ...). */
  dirName: string;
  /** Nome mostrato in Brave. */
  displayName: string;
  /** Account associato, se presente. */
  email: string | null;
}

/** Errore di lettura con messaggio già pronto per l'utente. */
export class SourceParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceParseError";
  }
}
