/** Costruttori di file di prova nel formato di Chromium/Brave. Solo per i test. */

export interface FixtureNode {
  [key: string]: unknown;
}

export function urlNode(
  id: string,
  name: string,
  url: string,
  dateAdded = "13285468800000000",
): FixtureNode {
  return { id, guid: `guid-${id}`, name, type: "url", url, date_added: dateAdded };
}

export function folderNode(
  id: string,
  name: string,
  children: FixtureNode[] = [],
): FixtureNode {
  return {
    id,
    guid: `guid-${id}`,
    name,
    type: "folder",
    date_added: "13285468800000000",
    children,
  };
}

export function bookmarksFile(roots: Record<string, FixtureNode>): string {
  return JSON.stringify({
    checksum: "00000000000000000000000000000000",
    roots: { ...roots, sync_transaction_version: "1" },
    version: 1,
  });
}

/**
 * Raccolta di esempio:
 *   Bookmarks bar
 *     Inbox (3 preferiti)
 *     Viaggi (1) > Italia (2)
 *     Vuota
 *   Other bookmarks
 *     Programmazione (2)
 *     1 preferito sciolto
 */
export function sampleBookmarks(): string {
  return bookmarksFile({
    bookmark_bar: folderNode("1", "Bookmarks bar", [
      folderNode("10", "Inbox", [
        urlNode("100", "Ricetta carbonara", "https://example.com/carbonara"),
        urlNode("101", "Home", "https://example.org/"),
        urlNode("102", "Vim cheatsheet", "https://example.net/vim"),
      ]),
      folderNode("11", "Viaggi", [
        urlNode("110", "Voli low cost", "https://example.com/voli"),
        folderNode("12", "Italia", [
          urlNode("120", "Treni Italia", "https://example.com/treni"),
          urlNode("121", "Agriturismi Toscana", "https://example.com/agri"),
        ]),
      ]),
      folderNode("13", "Vuota", []),
    ]),
    other: folderNode("2", "Other bookmarks", [
      folderNode("20", "Programmazione", [
        urlNode("200", "Documentazione TypeScript", "https://example.com/ts"),
        urlNode("201", "Rust book", "https://example.com/rust"),
      ]),
      urlNode("21", "Sciolto", "https://example.com/sciolto"),
    ]),
  });
}

export function sampleLocalState(): string {
  return JSON.stringify({
    profile: {
      info_cache: {
        "Profile 10": { name: "Lavoro", user_name: "me@example.com" },
        "Profile 2": { name: "Svago", user_name: "" },
        Default: { name: "Persona 1" },
      },
      profiles_order: ["Default", "Profile 2", "Profile 10"],
      last_used: "Default",
    },
  });
}
