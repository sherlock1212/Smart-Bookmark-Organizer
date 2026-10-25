// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { splitInbox, type InboxSplit } from "../bookmarks/inbox";
import { parseBookmarksFile } from "../brave/parse-bookmarks";
import type { Embedder } from "../classify/embedder";
import { DEFAULT_MATCHER_OPTIONS } from "../classify/matcher";
import { countTextsToEmbed } from "../classify/sort-inbox";
import { bookmarksFile, folderNode, urlNode } from "../test-fixtures/chromium";
import { buildCorpus } from "../test-fixtures/corpus";
import { HashingEmbedder } from "../test-fixtures/hashing-embedder";
import { estimateText, mountSortPanel, type SortPanel } from "./sort-panel";

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

// L'embedder finto dà punteggi più bassi del modello vero: soglie coerenti con lui (vedi sort-inbox.test.ts).
const FAKE_THRESHOLDS = { ...DEFAULT_MATCHER_OPTIONS, minScore: 0.3, minMargin: 0.05 };

let container: HTMLElement;
const q = <T extends HTMLElement>(selector: string): T => {
  const el = container.querySelector<T>(selector);
  if (!el) throw new Error(`Elemento non trovato: ${selector}`);
  return el;
};
const click = (selector: string): void => q<HTMLButtonElement>(selector).click();

function mount(overrides: Partial<Parameters<typeof mountSortPanel>[1]> = {}): {
  panel: SortPanel;
  createEmbedder: ReturnType<typeof vi.fn>;
} {
  const createEmbedder = vi.fn(async () => new HashingEmbedder() as Embedder);
  const panel = mountSortPanel(container, { createEmbedder, matcher: FAKE_THRESHOLDS, ...overrides });
  return { panel, createEmbedder };
}

const corpus = buildCorpus();

beforeEach(() => {
  document.body.innerHTML = '<section id="root"></section>';
  container = document.getElementById("root")!;
});

describe("pannello di smistamento: stato iniziale", () => {
  it("senza inbox è nascosto e il pulsante è disattivato", () => {
    mount();
    expect(container.hidden).toBe(true);
    expect(q<HTMLButtonElement>("#sort-run").disabled).toBe(true);
  });

  it("con un'inbox mostra la stima e attiva il pulsante", () => {
    const { panel } = mount();
    panel.setContext(corpus.split);
    expect(container.hidden).toBe(false);
    expect(q<HTMLButtonElement>("#sort-run").disabled).toBe(false);
    expect(q("#sort-estimate").textContent).toContain(`circa ${countTextsToEmbed(corpus.split)} testi`);
  });

  it("con inbox vuota lo dice e non permette di avviare", () => {
    const tree = parseBookmarksFile(
      bookmarksFile({ bookmark_bar: folderNode("1", "Barra", [folderNode("10", "Inbox", [])]) }),
    );
    const { panel } = mount();
    panel.setContext(splitInbox(tree, "10"));
    expect(q("#sort-estimate").textContent).toContain("vuota");
    expect(q<HTMLButtonElement>("#sort-run").disabled).toBe(true);
  });

  it("non carica il modello finché non si preme il pulsante", () => {
    const { panel, createEmbedder } = mount();
    panel.setContext(corpus.split);
    expect(createEmbedder).not.toHaveBeenCalled();
  });
});

describe("pannello di smistamento: risultati", () => {
  async function runOnce(split: InboxSplit = corpus.split): Promise<ReturnType<typeof mount>> {
    const m = mount();
    m.panel.setContext(split);
    click("#sort-run");
    await flush();
    return m;
  }

  it("mostra proposte e da rivedere, per un totale pari all'inbox", async () => {
    await runOnce();
    const assigned = container.querySelectorAll("#group-assigned tbody tr").length;
    const uncertain = container.querySelectorAll("#group-uncertain tbody tr").length;
    expect(assigned + uncertain).toBe(corpus.split.inbox.length);
    expect(assigned).toBeGreaterThan(0);
    expect(q("#sort-summary").textContent).toContain(`Proposte con buona fiducia: ${assigned}`);
    expect(q("#sort-summary").textContent).toContain(`Da rivedere: ${uncertain}`);
  });

  it("mostra titolo, dominio, cartella proposta e punteggio con la virgola", async () => {
    await runOnce();
    const row = q("#group-assigned tbody tr");
    expect(row.textContent).toContain("altro.example.org");
    expect(row.textContent).toMatch(/Bookmarks bar › (Cucina|Viaggi|Programmazione|Finanza)/);
    expect(row.textContent).toMatch(/0,\d\d/);
  });

  it("mostra la valutazione con le tre verifiche e l'avvertenza sui limiti", async () => {
    await runOnce();
    const evaluation = q("#evaluation");
    expect(evaluation.querySelectorAll("li").length).toBe(4); // 3 soglie + copertura
    expect(evaluation.textContent).toContain("Cartella giusta tra le prime 3");
    expect(evaluation.textContent).toContain("più pessimista del reale");
    expect(evaluation.textContent).not.toContain("example"); // nessun indirizzo, solo numeri
  });

  it("i titoli con HTML restano testo", async () => {
    const tree = parseBookmarksFile(
      bookmarksFile({
        bookmark_bar: folderNode("1", "Barra", [
          folderNode("10", "Inbox", [urlNode("100", "<img src=x onerror=alert(1)>", "https://example.com/x")]),
          folderNode("11", "<b>Cartella</b>", [urlNode("110", "Uno", "https://example.com/a")]),
        ]),
      }),
    );
    const { panel } = mount();
    panel.setContext(splitInbox(tree, "10"));
    click("#sort-run");
    await flush();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.textContent).toContain("<b>Cartella</b>");
  });

  it("riusa il modello già caricato nelle esecuzioni successive", async () => {
    const m = await runOnce();
    click("#sort-run");
    await flush();
    expect(m.createEmbedder).toHaveBeenCalledTimes(1);
  });

  it("alla fine il pulsante torna disponibile e l'avanzamento sparisce", async () => {
    await runOnce();
    expect(q<HTMLButtonElement>("#sort-run").disabled).toBe(false);
    expect(q<HTMLElement>("#sort-cancel").hidden).toBe(true);
    expect(q<HTMLElement>("#sort-progress").hidden).toBe(true);
  });
});

describe("pannello di smistamento: annullamento, errori, cambio di contesto", () => {
  it("annullando non mostra risultati e rimette a posto i pulsanti", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = new HashingEmbedder();
    const original = slow.embed.bind(slow);
    slow.embed = async (texts) => {
      await gate;
      return original(texts);
    };
    const { panel } = mount({ createEmbedder: async () => slow });
    panel.setContext(corpus.split);
    click("#sort-run");
    await flush();
    expect(q<HTMLElement>("#sort-cancel").hidden).toBe(false);
    expect(q<HTMLButtonElement>("#sort-run").disabled).toBe(true);

    click("#sort-cancel");
    release();
    await flush();

    expect(q("#sort-status").textContent).toContain("annullata");
    expect(q("#sort-results").children.length).toBe(0);
    expect(q<HTMLButtonElement>("#sort-run").disabled).toBe(false);
    expect(q<HTMLElement>("#sort-cancel").hidden).toBe(true);
  });

  it("se il modello non si carica mostra l'errore e permette di riprovare", async () => {
    let attempts = 0;
    const { panel } = mount({
      createEmbedder: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("modello non trovato");
        return new HashingEmbedder();
      },
    });
    panel.setContext(corpus.split);
    click("#sort-run");
    await flush();
    expect(q("#sort-error").textContent).toContain("modello non trovato");
    expect(q<HTMLButtonElement>("#sort-run").disabled).toBe(false);

    click("#sort-run");
    await flush();
    expect(attempts).toBe(2);
    expect(q("#sort-error").textContent).toBe("");
    expect(container.querySelector("#sort-summary")).not.toBeNull();
  });

  it("annullare mentre il modello si sta caricando non produce risultati", async () => {
    let finishLoading!: (e: Embedder) => void;
    const loading = new Promise<Embedder>((resolve) => {
      finishLoading = resolve;
    });
    const { panel } = mount({ createEmbedder: () => loading });
    panel.setContext(corpus.split);
    click("#sort-run");
    await flush();
    click("#sort-cancel");
    finishLoading(new HashingEmbedder());
    await flush();
    expect(q("#sort-status").textContent).toContain("annullata");
    expect(container.querySelector("#sort-summary")).toBeNull();
  });

  it("cambiando inbox durante il lavoro il vecchio risultato non compare", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = new HashingEmbedder();
    const original = slow.embed.bind(slow);
    slow.embed = async (texts) => {
      await gate;
      return original(texts);
    };
    const { panel } = mount({ createEmbedder: async () => slow });
    panel.setContext(corpus.split);
    click("#sort-run");
    await flush();

    panel.setContext(null);
    release();
    await flush();

    expect(container.hidden).toBe(true);
    expect(container.querySelector("#sort-summary")).toBeNull();
    expect(q("#sort-error").textContent).toBe("");
  });

  it("un nuovo contesto cancella i risultati precedenti", async () => {
    const { panel } = mount();
    panel.setContext(corpus.split);
    click("#sort-run");
    await flush();
    expect(container.querySelector("#sort-summary")).not.toBeNull();
    panel.setContext(corpus.split);
    expect(container.querySelector("#sort-summary")).toBeNull();
  });
});

describe("estimateText", () => {
  it("dà un ordine di grandezza, dichiarandolo una stima", () => {
    expect(estimateText(100)).toContain("meno di un minuto");
    expect(estimateText(4000)).toContain("circa 3 minuti");
    expect(estimateText(1)).toContain("1 testo");
    expect(estimateText(100)).toContain("stima");
  });
});
