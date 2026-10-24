import { splitInbox, type InboxSplit } from "../bookmarks/inbox";
import type { BookmarkTree } from "../bookmarks/types";
import { parseBookmarksFile } from "../brave/parse-bookmarks";
import { bookmarksFile, folderNode, urlNode, type FixtureNode } from "./chromium";

interface Theme {
  folderId: string;
  name: string;
  words: string[];
  domain: string;
}

const THEMES: Theme[] = [
  {
    folderId: "f-cucina",
    name: "Cucina",
    domain: "ricette.example.com",
    words: ["ricetta", "pasta", "carbonara", "guanciale", "forno", "torta", "lievito", "sugo", "risotto", "cucina", "impasto", "dolce"],
  },
  {
    folderId: "f-viaggi",
    name: "Viaggi",
    domain: "viaggi.example.com",
    words: ["voli", "hotel", "treni", "viaggio", "prenotazione", "itinerario", "spiaggia", "Firenze", "Roma", "weekend", "biglietti", "vacanza"],
  },
  {
    folderId: "f-prog",
    name: "Programmazione",
    domain: "dev.example.com",
    words: ["typescript", "javascript", "rust", "documentazione", "funzione", "compilatore", "errore", "tutorial", "algoritmo", "libreria", "codice", "debug"],
  },
  {
    folderId: "f-finanza",
    name: "Finanza",
    domain: "soldi.example.com",
    words: ["banca", "mutuo", "investimenti", "azioni", "tasse", "risparmio", "conto", "interessi", "bilancio", "pensione", "obbligazioni", "budget"],
  },
];

const EXAMPLES_PER_FOLDER = 8;
const INBOX_ITEMS_PER_THEME = 3;

export interface Corpus {
  tree: BookmarkTree;
  split: InboxSplit;
  /** Per ogni preferito dell'inbox, la cartella in cui dovrebbe finire. */
  expected: Record<string, string>;
}

/** Raccolta di prova: 4 cartelle a tema con esempi, 1 cartella vuota, un'inbox da smistare. */
export function buildCorpus(): Corpus {
  const expected: Record<string, string> = {};
  const folders: FixtureNode[] = THEMES.map((theme) => {
    const children: FixtureNode[] = [];
    for (let i = 0; i < EXAMPLES_PER_FOLDER; i++) {
      const w = theme.words;
      const title = `${w[i % 12]} ${w[(i * 5 + 3) % 12]} ${w[(i * 7 + 1) % 12]}`;
      const path = `${w[(i * 3) % 12]}-${w[(i * 11 + 2) % 12]}`;
      children.push(urlNode(`${theme.folderId}-b${i}`, title, `https://${theme.domain}/${path}`));
    }
    return folderNode(theme.folderId, theme.name, children);
  });
  folders.push(folderNode("f-vuota", "Varie", []));

  const inbox: FixtureNode[] = [];
  THEMES.forEach((theme) => {
    for (let i = 0; i < INBOX_ITEMS_PER_THEME; i++) {
      const w = theme.words;
      const id = `in-${theme.folderId}-${i}`;
      const title = `${w[(i * 2 + 5) % 12]} ${w[(i * 4 + 6) % 12]} ${w[(i + 9) % 12]}`;
      inbox.push(urlNode(id, title, `https://altro.example.org/${w[(i + 2) % 12]}`));
      expected[id] = theme.folderId;
    }
  });

  const tree = parseBookmarksFile(
    bookmarksFile({
      bookmark_bar: folderNode("1", "Bookmarks bar", [folderNode("inbox", "Inbox", inbox), ...folders]),
      other: folderNode("2", "Other bookmarks", []),
    }),
  );
  return { tree, split: splitInbox(tree, "inbox"), expected };
}
