import { formatFolderPath, type InboxSplit } from "../bookmarks/inbox";
import { CancelledError, type Embedder } from "../classify/embedder";
import { DEFAULT_MATCHER_OPTIONS, type MatcherOptions } from "../classify/matcher";
import {
  countTextsToEmbed,
  sortInbox,
  type ProposalRow,
  type SortProgress,
  type SortResult,
} from "../classify/sort-inbox";
import { domainOf } from "../classify/text";
import { errorMessage } from "../errors";
import { h, percent, plural } from "./dom";

export interface SortPanelDeps {
  /** Crea l'embedder (carica il modello). Si chiama una volta e il risultato si riusa. */
  createEmbedder: () => Promise<Embedder>;
  /** Soglie del confronto. Predefinite: valori iniziali non calibrati. */
  matcher?: MatcherOptions;
}

export interface SortPanel {
  /** Imposta l'inbox da smistare (o nessuna). Annulla un lavoro in corso e cancella i risultati. */
  setContext(split: InboxSplit | null): void;
}

/**
 * Tempo per testo misurato in CI su Chrome (corpus sintetico). Serve solo a dare un ordine di
 * grandezza: sul computer dell'utente, dentro la finestra dell'app, può essere diverso.
 */
const MS_PER_TEXT_ESTIMATE = 37;
const MODEL_LOAD_SECONDS_ESTIMATE = 3;

export function estimateText(texts: number): string {
  const seconds = Math.ceil((texts * MS_PER_TEXT_ESTIMATE) / 1000 + MODEL_LOAD_SECONDS_ESTIMATE);
  const duration =
    seconds < 60 ? "meno di un minuto" : `circa ${plural(Math.round(seconds / 60), "minuto", "minuti")}`;
  return (
    `Da elaborare: circa ${plural(texts, "testo", "testi")} (stima ${duration}, ricavata da una misura su ` +
    "un altro browser: sul tuo computer può cambiare)."
  );
}

function progressLabel(progress: SortProgress): string {
  const what =
    progress.phase === "folders"
      ? "Preparo le cartelle di destinazione"
      : "Confronto i preferiti dell'inbox";
  return `${what}: ${progress.done} di ${progress.total}`;
}

export function mountSortPanel(container: HTMLElement, deps: SortPanelDeps): SortPanel {
  let current: InboxSplit | null = null;
  let embedder: Embedder | null = null;
  let controller: AbortController | null = null;
  let runTicket = 0;

  const estimateLine = h("p", { id: "sort-estimate", class: "hint" });
  const runButton = h("button", { id: "sort-run", type: "button" }, "Classifica l'inbox");
  const cancelButton = h("button", { id: "sort-cancel", type: "button" }, "Annulla");
  cancelButton.hidden = true;
  const progressBar = h("progress", { id: "sort-progress" });
  progressBar.hidden = true;
  const statusLine = h("p", { id: "sort-status", role: "status" });
  const errorLine = h("p", { id: "sort-error", role: "alert" });
  const results = h("div", { id: "sort-results" });

  container.replaceChildren(
    h("h2", {}, "3. Smistamento proposto"),
    h(
      "p",
      { class: "hint" },
      "Il confronto avviene sul tuo computer: nessun dato viene inviato in rete. " +
        "La prima volta va caricato il modello (qualche secondo). " +
        "Punteggi e soglie sono valori iniziali, non ancora calibrati sui tuoi preferiti.",
    ),
    estimateLine,
    h("p", {}, runButton, " ", cancelButton),
    progressBar,
    statusLine,
    errorLine,
    results,
  );

  const setStatus = (message: string | null): void => {
    statusLine.textContent = message ?? "";
  };
  const setError = (message: string | null): void => {
    errorLine.textContent = message ?? "";
  };
  const setBusy = (busy: boolean): void => {
    runButton.disabled = busy || current === null || current.inbox.length === 0;
    cancelButton.hidden = !busy;
    progressBar.hidden = !busy;
    if (!busy) progressBar.removeAttribute("value");
  };

  const folderCell = (row: ProposalRow): HTMLElement => {
    const cell = h("td", {});
    cell.append(row.best ? formatFolderPath(row.best) : "—");
    return cell;
  };

  const renderRow = (row: ProposalRow): HTMLElement => {
    const domain = domainOf(row.bookmark.url);
    const title = row.bookmark.title.trim() === "" ? "(senza titolo)" : row.bookmark.title;
    return h(
      "tr",
      {},
      h(
        "td",
        {},
        title,
        ...(domain ? [h("br"), h("small", { class: "hint" }, domain)] : []),
      ),
      folderCell(row),
      h("td", {}, row.score.toFixed(2).replace(".", ",")),
      h("td", {}, row.alternatives.map((f) => formatFolderPath(f)).join(" | ") || "—"),
    );
  };

  const renderGroup = (
    id: string,
    heading: string,
    note: string,
    folderHeader: string,
    rows: ProposalRow[],
  ): HTMLElement => {
    const group = h("section", { id }, h("h3", {}, `${heading} (${rows.length})`), h("p", { class: "hint" }, note));
    if (rows.length === 0) return group;
    group.append(
      h(
        "table",
        {},
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", {}, "Preferito"),
            h("th", {}, folderHeader),
            h("th", {}, "Punteggio"),
            h("th", {}, "Altre candidate"),
          ),
        ),
        h("tbody", {}, ...rows.map(renderRow)),
      ),
    );
    return group;
  };

  const renderEvaluation = (result: SortResult): HTMLElement => {
    const e = result.evaluation;
    const box = h("details", { id: "evaluation" }, h("summary", {}, "Quanto è affidabile? Valutazione sui tuoi preferiti già ordinati"));
    if (e.evaluated === 0) {
      box.append(
        h(
          "p",
          {},
          "Valutazione non possibile: nessuna cartella di destinazione ha almeno 2 preferiti da usare come prova.",
        ),
      );
      return box;
    }
    box.append(
      h(
        "p",
        {},
        `Ho nascosto uno alla volta ${plural(e.evaluated, "preferito", "preferiti")} già presenti in ` +
          `${plural(e.foldersCovered, "cartella", "cartelle")} e verificato se il programma li rimette al loro posto. ` +
          "Sono solo numeri aggregati: nessun titolo o indirizzo.",
      ),
      h(
        "ul",
        {},
        ...result.acceptance.map((check) =>
          h(
            "li",
            { class: check.passed ? "ok" : "warn" },
            `${check.name}: ${check.actual} (richiesto: ${check.required}) — ${check.passed ? "superata" : "NON superata"}`,
          ),
        ),
        h(
          "li",
          {},
          `Proposte con buona fiducia: ${percent(e.coverage)} degli elementi` +
            (e.assignedPrecision === null ? "" : `, corrette il ${percent(e.assignedPrecision)}`) +
            ".",
        ),
      ),
      h(
        "p",
        { class: "hint" },
        "Attenzione: se alcune tue cartelle sono disordinate il risultato è più pessimista del reale; " +
          "i preferiti già ordinati sono più 'puliti' di quelli salvati alla rinfusa, quindi può essere più ottimista " +
          "di quanto accadrà con l'inbox. Controlla a mano le proposte qui sopra.",
      ),
    );
    return box;
  };

  const renderResults = (result: SortResult): void => {
    const seconds = (result.elapsedMs / 1000).toFixed(1).replace(".", ",");
    results.replaceChildren(
      h(
        "p",
        { id: "sort-summary" },
        h("strong", {}, `Proposte con buona fiducia: ${result.assigned.length}`),
        ` · Da rivedere: ${result.uncertain.length} · ${plural(result.textsEmbedded, "testo elaborato", "testi elaborati")} in ${seconds} s.`,
      ),
      renderGroup(
        "group-assigned",
        "Proposte con buona fiducia",
        "Il programma ritiene queste cartelle abbastanza vicine e distinte dalle altre. Verificale comunque.",
        "Cartella proposta",
        result.assigned,
      ),
      renderGroup(
        "group-uncertain",
        "Da rivedere",
        "Nessuna cartella è risultata abbastanza vicina o distinta dalle altre. Qui sotto la più vicina, solo come indizio.",
        "Cartella più vicina (incerta)",
        result.uncertain,
      ),
      renderEvaluation(result),
    );
  };

  const clearAll = (): void => {
    results.replaceChildren();
    setStatus(null);
    setError(null);
  };

  const run = async (): Promise<void> => {
    const split = current;
    if (!split || split.inbox.length === 0) return;
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    const ticket = ++runTicket;
    clearAll();
    setBusy(true);
    try {
      if (!embedder) {
        setStatus("Carico il modello di embedding…");
        embedder = await deps.createEmbedder();
      }
      if (mine.signal.aborted) throw new CancelledError();
      const result = await sortInbox(split, embedder, {
        signal: mine.signal,
        matcher: deps.matcher ?? DEFAULT_MATCHER_OPTIONS,
        onProgress: (progress) => {
          if (ticket !== runTicket) return;
          progressBar.max = Math.max(1, progress.total);
          progressBar.value = progress.done;
          setStatus(progressLabel(progress));
        },
      });
      if (ticket !== runTicket) return;
      setStatus(null);
      renderResults(result);
    } catch (error) {
      if (ticket !== runTicket) return;
      if (error instanceof CancelledError) {
        setStatus("Operazione annullata.");
      } else {
        setStatus(null);
        setError(`Non sono riuscito a classificare l'inbox: ${errorMessage(error)}`);
      }
    } finally {
      if (ticket === runTicket) setBusy(false);
    }
  };

  runButton.addEventListener("click", () => {
    void run();
  });
  cancelButton.addEventListener("click", () => {
    controller?.abort();
  });

  const setContext = (split: InboxSplit | null): void => {
    controller?.abort();
    runTicket += 1; // l'eventuale lavoro in corso non scriverà più nulla
    current = split;
    clearAll();
    setBusy(false);
    if (!split) {
      estimateLine.textContent = "";
      container.hidden = true;
      return;
    }
    container.hidden = false;
    estimateLine.textContent =
      split.inbox.length === 0
        ? "La cartella inbox è vuota: non c'è nulla da smistare."
        : estimateText(countTextsToEmbed(split));
  };

  setContext(null);
  return { setContext };
}
