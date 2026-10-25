import { describe, expect, it } from "vitest";
import { HashingEmbedder } from "../test-fixtures/hashing-embedder";
import { CancelledError, embedMany, type Embedder } from "./embedder";

describe("embedMany", () => {
  it("non ripete testi uguali e lavora a lotti", async () => {
    const embedder = new HashingEmbedder();
    const texts = ["uno", "due", "uno", "tre", "due", "quattro", "cinque"];
    const result = await embedMany(embedder, texts, { batchSize: 2 });
    expect(result.size).toBe(5);
    expect(embedder.textsSeen).toEqual(["uno", "due", "tre", "quattro", "cinque"]);
    expect(embedder.calls).toBe(3);
  });

  it("restituisce vettori normalizzati", async () => {
    const result = await embedMany(new HashingEmbedder(), ["ricetta pasta"]);
    const v = result.get("ricetta pasta")!;
    expect(Math.hypot(...v)).toBeCloseTo(1, 5);
  });

  it("riporta l'avanzamento", async () => {
    const progress: Array<[number, number]> = [];
    await embedMany(new HashingEmbedder(), ["a1", "b2", "c3"], {
      batchSize: 2,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(progress).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });

  it("si interrompe tra un lotto e l'altro se annullato", async () => {
    const controller = new AbortController();
    const embedder = new HashingEmbedder();
    const promise = embedMany(embedder, ["a1", "b2", "c3", "d4"], {
      batchSize: 1,
      signal: controller.signal,
      onProgress: (done) => {
        if (done === 2) controller.abort();
      },
    });
    await expect(promise).rejects.toBeInstanceOf(CancelledError);
    expect(embedder.calls).toBe(2);
  });

  it("rifiuta un embedder che sbaglia il numero o la dimensione dei vettori", async () => {
    const wrongCount: Embedder = { id: "x", dimensions: 2, embed: async () => [] };
    await expect(embedMany(wrongCount, ["a1"])).rejects.toThrow(/0 vettori per 1 testi/);
    const wrongDims: Embedder = { id: "x", dimensions: 3, embed: async (t) => t.map(() => new Float32Array(2)) };
    await expect(embedMany(wrongDims, ["a1"])).rejects.toThrow(/dimensione 2, attesa 3/);
  });

  it("con yieldBetweenBatches cede il controllo al browser tra un lotto e l'altro", async () => {
    const run = async (yieldBetweenBatches: boolean): Promise<string[]> => {
      const order: string[] = [];
      const embedder: Embedder = {
        id: "x",
        dimensions: 2,
        embed: async (texts) => {
          order.push("lotto");
          return texts.map(() => Float32Array.from([1, 0]));
        },
      };
      setTimeout(() => order.push("timer"), 0); // l'interfaccia che si ridisegna
      await embedMany(embedder, ["a1", "b2", "c3"], { batchSize: 1, yieldBetweenBatches });
      await new Promise((resolve) => setTimeout(resolve, 5));
      return order;
    };
    expect(await run(true)).toEqual(["lotto", "timer", "lotto", "lotto"]);
    // Senza l'opzione i lotti si susseguono senza mai lasciare spazio al timer.
    expect(await run(false)).toEqual(["lotto", "lotto", "lotto", "timer"]);
  });

  it("con nessun testo non chiama l'embedder", async () => {
    const embedder = new HashingEmbedder();
    expect((await embedMany(embedder, [])).size).toBe(0);
    expect(embedder.calls).toBe(0);
  });
});
