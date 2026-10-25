import { describe, expect, it } from "vitest";
import { splitInbox } from "../bookmarks/inbox";
import { parseBookmarksFile } from "../brave/parse-bookmarks";
import { bookmarksFile, folderNode, urlNode } from "../test-fixtures/chromium";
import { buildCorpus } from "../test-fixtures/corpus";
import { HashingEmbedder } from "../test-fixtures/hashing-embedder";
import { CancelledError } from "./embedder";
import { DEFAULT_MATCHER_OPTIONS } from "./matcher";
import { countTextsToEmbed, sortInbox, type SortProgress } from "./sort-inbox";

// L'embedder finto dà punteggi più bassi del modello vero (0,25-0,46 su questo corpus): le soglie
// iniziali (0,8) valgono per il modello vero e qui non assegnerebbero mai nulla.
const FAKE_EMBEDDER_THRESHOLDS = { ...DEFAULT_MATCHER_OPTIONS, minScore: 0.25, minMargin: 0.05 };

describe("sortInbox", () => {
  const corpus = buildCorpus();

  it("restituisce una riga per ogni preferito dell'inbox, senza perderne né duplicarne", async () => {
    const result = await sortInbox(corpus.split, new HashingEmbedder());
    const ids = [...result.assigned, ...result.uncertain].map((r) => r.bookmark.id);
    expect(ids.length).toBe(corpus.split.inbox.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(corpus.split.inbox.map((b) => b.id)));
  });

  it("propone la cartella giusta per gli elementi assegnati con sicurezza", async () => {
    const result = await sortInbox(corpus.split, new HashingEmbedder(), { matcher: FAKE_EMBEDDER_THRESHOLDS });
    expect(result.assigned.length).toBe(corpus.split.inbox.length);
    for (const row of result.assigned) {
      expect(row.best?.id).toBe(corpus.expected[row.bookmark.id]);
    }
  });

  it("ordina ogni gruppo dal punteggio più alto", async () => {
    const result = await sortInbox(corpus.split, new HashingEmbedder(), {
      matcher: { ...FAKE_EMBEDDER_THRESHOLDS, minScore: 0.3 },
    });
    expect(result.assigned.length).toBeGreaterThan(0);
    expect(result.uncertain.length).toBeGreaterThan(0);
    for (const group of [result.assigned, result.uncertain]) {
      const scores = group.map((r) => r.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    }
  });

  it("le alternative sono altre cartelle, mai la stessa proposta", async () => {
    const result = await sortInbox(corpus.split, new HashingEmbedder());
    for (const row of [...result.assigned, ...result.uncertain]) {
      expect(row.alternatives.length).toBeLessThanOrEqual(2);
      expect(row.alternatives.map((f) => f.id)).not.toContain(row.best?.id);
    }
  });

  it("è deterministico: stesso input, stesso risultato", async () => {
    const a = await sortInbox(corpus.split, new HashingEmbedder());
    const b = await sortInbox(corpus.split, new HashingEmbedder());
    const summary = (r: typeof a): unknown =>
      [...r.assigned, ...r.uncertain].map((x) => [x.bookmark.id, x.best?.id, x.decision, x.score]);
    expect(summary(a)).toEqual(summary(b));
  });

  it("include la valutazione sui preferiti già ordinati, con le tre verifiche di accettazione", async () => {
    const result = await sortInbox(corpus.split, new HashingEmbedder());
    expect(result.evaluation.evaluated).toBeGreaterThan(0);
    expect(result.acceptance).toHaveLength(3);
  });

  it("non modifica l'input", async () => {
    const before = JSON.stringify(corpus.split);
    await sortInbox(corpus.split, new HashingEmbedder());
    expect(JSON.stringify(corpus.split)).toBe(before);
  });

  it("riporta l'avanzamento in due fasi, ciascuna fino al totale", async () => {
    const events: SortProgress[] = [];
    await sortInbox(corpus.split, new HashingEmbedder(), { onProgress: (p) => events.push(p), batchSize: 4 });
    const folders = events.filter((e) => e.phase === "folders");
    const inbox = events.filter((e) => e.phase === "inbox");
    expect(folders.length).toBeGreaterThan(1);
    expect(inbox.length).toBeGreaterThan(0);
    expect(folders.at(-1)!.done).toBe(folders.at(-1)!.total);
    expect(inbox.at(-1)!.done).toBe(inbox.at(-1)!.total);
    expect(events.findIndex((e) => e.phase === "inbox")).toBeGreaterThan(
      events.map((e) => e.phase).lastIndexOf("folders") - 1,
    );
  });

  it("si può annullare", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sortInbox(corpus.split, new HashingEmbedder(), { signal: controller.signal })).rejects.toBeInstanceOf(
      CancelledError,
    );
  });

  it("si annulla anche a metà lavoro", async () => {
    const controller = new AbortController();
    await expect(
      sortInbox(corpus.split, new HashingEmbedder(), {
        signal: controller.signal,
        batchSize: 2,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toBeInstanceOf(CancelledError);
  });

  it("senza cartelle di destinazione mette tutto da rivedere, senza errori", async () => {
    const tree = parseBookmarksFile(
      bookmarksFile({
        bookmark_bar: folderNode("1", "Barra", [
          folderNode("10", "Inbox", [urlNode("100", "Qualcosa", "https://example.com/x")]),
        ]),
      }),
    );
    const split = splitInbox(tree, "10");
    expect(split.destinationFolders).toHaveLength(0);
    const result = await sortInbox(split, new HashingEmbedder());
    expect(result.assigned).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]!.best).toBeNull();
    expect(result.evaluation.evaluated).toBe(0);
  });

  it("con inbox vuota restituisce un risultato vuoto", async () => {
    const tree = parseBookmarksFile(
      bookmarksFile({
        bookmark_bar: folderNode("1", "Barra", [
          folderNode("10", "Inbox", []),
          folderNode("11", "Altro", [urlNode("110", "Uno", "https://example.com/a")]),
        ]),
      }),
    );
    const result = await sortInbox(splitInbox(tree, "10"), new HashingEmbedder());
    expect(result.assigned).toHaveLength(0);
    expect(result.uncertain).toHaveLength(0);
  });
});

describe("countTextsToEmbed", () => {
  it("coincide con i testi che l'embedder riceve davvero", async () => {
    const corpus = buildCorpus();
    const embedder = new HashingEmbedder();
    await sortInbox(corpus.split, embedder);
    expect(countTextsToEmbed(corpus.split)).toBe(new Set(embedder.textsSeen).size);
  });
});
