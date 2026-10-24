import { describe, expect, it } from "vitest";
import type { Bookmark } from "../bookmarks/types";
import { buildCorpus } from "../test-fixtures/corpus";
import { HashingEmbedder } from "../test-fixtures/hashing-embedder";
import { buildFolderProfiles, selectExamples } from "./profiles";

function bm(id: string, url: string, title = `Titolo ${id}`): Bookmark {
  return { id, guid: id, title, url, folderId: "f", folderPath: ["R", "F"], dateAdded: null };
}

describe("selectExamples", () => {
  const many = Array.from({ length: 50 }, (_, i) => bm(String(i), `https://e.com/${i}`));

  it("restituisce al massimo max esempi, ben distribuiti e senza ripetizioni", () => {
    const picked = selectExamples(many, 10);
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((b) => b.id)).size).toBe(10);
    expect(picked.map((b) => b.id)).toEqual(["0", "5", "10", "15", "20", "25", "30", "35", "40", "45"]);
  });

  it("è deterministico e non dipende dall'ordine di ingresso", () => {
    const a = selectExamples(many, 7).map((b) => b.id);
    const b = selectExamples([...many].reverse(), 7).map((b) => b.id);
    expect(a).toEqual(b);
  });

  it("tiene tutto se sono pochi e scarta URL duplicati e testi vuoti", () => {
    const list = [
      bm("1", "https://e.com/a"),
      bm("2", "https://e.com/a"),
      bm("3", "non url", " "),
      bm("4", "https://e.com/b"),
    ];
    expect(selectExamples(list, 12).map((b) => b.id)).toEqual(["1", "4"]);
  });

  it("ordina gli id in modo numerico", () => {
    const list = ["10", "9", "100", "1"].map((id) => bm(id, `https://e.com/${id}`));
    expect(selectExamples(list, 12).map((b) => b.id)).toEqual(["1", "9", "10", "100"]);
  });
});

describe("buildFolderProfiles", () => {
  const { split } = buildCorpus();

  it("crea un profilo per ogni cartella di destinazione, anche vuota", async () => {
    const { profiles } = await buildFolderProfiles(
      split.destinationFolders,
      split.reference,
      new HashingEmbedder(),
    );
    expect(profiles).toHaveLength(split.destinationFolders.length);
    const vuota = profiles.find((p) => p.folderId === "f-vuota")!;
    expect(vuota.examples).toHaveLength(0);
    expect(profiles.find((p) => p.folderId === "f-cucina")!.examples).toHaveLength(8);
  });

  it("rispetta il massimo di esempi per cartella", async () => {
    const { profiles } = await buildFolderProfiles(
      split.destinationFolders,
      split.reference,
      new HashingEmbedder(),
      { maxExamplesPerFolder: 3 },
    );
    expect(profiles.every((p) => p.examples.length <= 3)).toBe(true);
  });

  it("calcola ogni testo una sola volta e non usa l'inbox", async () => {
    const embedder = new HashingEmbedder();
    const { textsEmbedded } = await buildFolderProfiles(split.destinationFolders, split.reference, embedder);
    expect(new Set(embedder.textsSeen).size).toBe(embedder.textsSeen.length);
    expect(textsEmbedded).toBe(embedder.textsSeen.length);
    // 5 cartelle + 4*8 esempi
    expect(textsEmbedded).toBe(5 + 32);
  });

  it("vettori normalizzati e di dimensione dell'embedder", async () => {
    const embedder = new HashingEmbedder();
    const { profiles } = await buildFolderProfiles(split.destinationFolders, split.reference, embedder);
    const v = profiles[0]!.nameVector;
    expect(v.length).toBe(embedder.dimensions);
    expect(Math.hypot(...v)).toBeCloseTo(1, 5);
  });
});
