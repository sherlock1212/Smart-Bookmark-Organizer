import type { Bookmark, Folder } from "../bookmarks/types";
import { embedMany, type EmbedOptions, type Embedder } from "./embedder";
import type { FolderProfile } from "./matcher";
import { bookmarkText, folderText } from "./text";

export interface ProfileOptions {
  /** Massimo di esempi per cartella: limita il lavoro con raccolte molto grandi. */
  maxExamplesPerFolder: number;
}

export const DEFAULT_PROFILE_OPTIONS: ProfileOptions = { maxExamplesPerFolder: 12 };

/**
 * Sceglie fino a `max` esempi in modo deterministico e ben distribuito
 * (stesso input → stessi esempi), senza duplicati di URL.
 */
export function selectExamples(bookmarks: Bookmark[], max: number): Bookmark[] {
  const seenUrls = new Set<string>();
  const unique: Bookmark[] = [];
  for (const bookmark of bookmarks) {
    if (bookmarkText(bookmark) === "" || seenUrls.has(bookmark.url)) continue;
    seenUrls.add(bookmark.url);
    unique.push(bookmark);
  }
  unique.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  if (unique.length <= max) return unique;
  const picked: Bookmark[] = [];
  for (let i = 0; i < max; i++) picked.push(unique[Math.floor((i * unique.length) / max)]!);
  return picked;
}

export interface ProfilesResult {
  profiles: FolderProfile[];
  /** Quanti testi distinti sono stati trasformati in vettori. */
  textsEmbedded: number;
}

/** Costruisce il profilo di ogni cartella di destinazione (nome + esempi). */
export async function buildFolderProfiles(
  folders: Folder[],
  referenceBookmarks: Bookmark[],
  embedder: Embedder,
  options: ProfileOptions = DEFAULT_PROFILE_OPTIONS,
  embedOptions: EmbedOptions = {},
): Promise<ProfilesResult> {
  const byFolder = new Map<string, Bookmark[]>();
  for (const bookmark of referenceBookmarks) {
    const list = byFolder.get(bookmark.folderId);
    if (list) list.push(bookmark);
    else byFolder.set(bookmark.folderId, [bookmark]);
  }

  const chosen = folders.map((folder) => ({
    folder,
    examples: selectExamples(byFolder.get(folder.id) ?? [], options.maxExamplesPerFolder),
  }));

  const texts: string[] = [];
  for (const { folder, examples } of chosen) {
    texts.push(folderText(folder));
    for (const example of examples) texts.push(bookmarkText(example));
  }
  const vectors = await embedMany(embedder, texts, embedOptions);

  const profiles: FolderProfile[] = chosen.map(({ folder, examples }) => ({
    folderId: folder.id,
    path: folder.path,
    nameVector: vectors.get(folderText(folder))!,
    examples: examples.map((example) => ({
      bookmarkId: example.id,
      vector: vectors.get(bookmarkText(example))!,
    })),
  }));
  return { profiles, textsEmbedded: vectors.size };
}
