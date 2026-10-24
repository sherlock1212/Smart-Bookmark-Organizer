import type { Bookmark, Folder } from "../bookmarks/types";

const MAX_TEXT_LENGTH = 240;
const MAX_URL_WORDS = 8;

/** Dominio senza "www.", in minuscolo; null se l'URL non è valido. */
export function domainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

/**
 * Parole utili dal percorso dell'URL. Si scartano query e frammento (di solito identificativi),
 * numeri puri, sequenze che sembrano codici (hash) e parole troppo lunghe.
 */
export function urlWords(url: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return [];
  }
  const words: string[] = [];
  for (const segment of pathname.split("/")) {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      // segmento con codifica non valida: si usa così com'è
    }
    for (const token of decoded.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (token.length < 2 || token.length > 24) continue;
      if (/^\d+$/.test(token)) continue;
      if (/^[a-f0-9]{8,}$/.test(token)) continue;
      words.push(token);
      if (words.length >= MAX_URL_WORDS) return words;
    }
  }
  return words;
}

/** Testo che rappresenta un preferito: titolo, dominio e parole del percorso. */
export function bookmarkText(bookmark: Pick<Bookmark, "title" | "url">): string {
  const parts: string[] = [];
  const title = bookmark.title.trim().replace(/\s+/g, " ");
  if (title !== "") parts.push(title);
  const domain = domainOf(bookmark.url);
  if (domain) parts.push(domain);
  const words = urlWords(bookmark.url);
  if (words.length > 0) parts.push(words.join(" "));
  return parts.join(" · ").slice(0, MAX_TEXT_LENGTH);
}

/**
 * Testo che rappresenta una cartella: gli ultimi componenti del percorso, senza la radice
 * ("Bookmarks bar" non dice nulla sull'argomento).
 */
export function folderText(folder: Pick<Folder, "path">): string {
  const names = folder.path.length > 1 ? folder.path.slice(1) : folder.path;
  return names.slice(-3).join(" · ").slice(0, MAX_TEXT_LENGTH);
}
