import { splitInbox } from "../bookmarks/inbox";
import { parseBookmarksFile } from "../brave/parse-bookmarks";
import { bookmarksFile, folderNode, urlNode, type FixtureNode } from "./chromium";
import type { Corpus } from "./corpus";

/**
 * Corpus SINTETICO scritto a mano, in italiano e inglese. I titoli dell'inbox non ripetono le
 * parole delle cartelle: serve a verificare che il modello capisca il significato.
 * NON rappresenta i preferiti reali dell'utente: i numeri ottenuti qui non dicono quanto
 * funzionerà sulla sua raccolta (per quello c'è la valutazione dentro l'app).
 */
const FOLDERS: Array<{ id: string; name: string; examples: Array<[string, string]>; inbox: Array<[string, string]> }> = [
  {
    id: "cucina",
    name: "Cucina e ricette",
    examples: [
      ["Ricetta originale della carbonara romana", "https://cucina-facile.example.it/primi/carbonara-romana"],
      ["Come fare il pane in casa con il lievito madre", "https://blog-pane.example.it/pane-lievito-madre"],
      ["Tiramisù classico: ingredienti e procedimento", "https://dolci.example.it/tiramisu-classico"],
      ["Risotto alla milanese con zafferano", "https://cucina-facile.example.it/primi/risotto-milanese"],
      ["Pizza napoletana fatta in casa", "https://pizza.example.it/impasto-napoletano"],
      ["Torta di mele soffice", "https://dolci.example.it/torta-mele"],
    ],
    inbox: [
      ["Gnocchi di patate fatti in casa", "https://nonna.example.it/gnocchi"],
      ["Best sourdough starter tips", "https://bread.example.com/starter-tips"],
      ["Sugo al pomodoro della nonna", "https://nonna.example.it/sugo-pomodoro"],
    ],
  },
  {
    id: "viaggi",
    name: "Viaggi",
    examples: [
      ["Voli economici per Lisbona a ottobre", "https://voli.example.it/lisbona-ottobre"],
      ["Cosa vedere a Firenze in due giorni", "https://guida.example.it/firenze-2-giorni"],
      ["Treni Italo e Trenitalia: orari e prezzi", "https://treni.example.it/orari"],
      ["Best hostels in Barcelona", "https://hostels.example.com/barcelona"],
      ["Itinerario di 10 giorni in Giappone", "https://giappone.example.it/itinerario-10-giorni"],
      ["Prenota hotel a Roma centro", "https://hotel.example.it/roma-centro"],
    ],
    inbox: [
      ["Weekend a Praga: cosa fare", "https://citybreak.example.it/praga"],
      ["Traghetti per la Sardegna: prezzi e orari", "https://traghetti.example.it/sardegna"],
      ["Cheap flights to New York", "https://flights.example.com/new-york"],
    ],
  },
  {
    id: "prog",
    name: "Programmazione",
    examples: [
      ["TypeScript handbook: generics", "https://docs.example.dev/typescript/generics"],
      ["Rust ownership explained", "https://rust-guide.example.dev/ownership"],
      ["Come funziona async await in JavaScript", "https://js.example.it/async-await"],
      ["Git rebase vs merge", "https://git-tips.example.dev/rebase-vs-merge"],
      ["Docker compose tutorial", "https://containers.example.dev/compose-tutorial"],
      ["Regex cheat sheet", "https://regex.example.dev/cheatsheet"],
    ],
    inbox: [
      ["Impara Python da zero", "https://corsi.example.it/python-base"],
      ["Differenza tra let e const", "https://js.example.it/let-const"],
      ["CSS grid: guida completa", "https://css.example.dev/grid-guide"],
    ],
  },
  {
    id: "finanza",
    name: "Finanza personale",
    examples: [
      ["Come funziona il mutuo a tasso fisso", "https://banca.example.it/mutuo-tasso-fisso"],
      ["Dichiarazione dei redditi 730: guida", "https://tasse.example.it/730-guida"],
      ["Best index funds for long term investing", "https://invest.example.com/index-funds"],
      ["ETF vs fondi comuni di investimento", "https://risparmio.example.it/etf-vs-fondi"],
      ["Conto deposito: confronto dei tassi", "https://risparmio.example.it/conto-deposito"],
      ["Budgeting: la regola 50/30/20", "https://soldi.example.it/regola-50-30-20"],
    ],
    inbox: [
      ["Cos'è l'inflazione e come proteggersi", "https://economia.example.it/inflazione"],
      ["How to start investing with little money", "https://invest.example.com/start-small"],
      ["Calcolatore degli interessi composti", "https://soldi.example.it/interessi-composti"],
    ],
  },
  {
    id: "salute",
    name: "Salute e fitness",
    examples: [
      ["Allenamento a corpo libero per principianti", "https://fit.example.it/corpo-libero"],
      ["Dieta mediterranea: cosa mangiare", "https://benessere.example.it/dieta-mediterranea"],
      ["How to improve sleep quality", "https://sleep.example.com/improve-quality"],
      ["Stretching per il mal di schiena", "https://fisio.example.it/stretching-schiena"],
      ["Calcolo delle calorie giornaliere", "https://fit.example.it/calcolo-calorie"],
      ["Marathon training plan, 16 weeks", "https://run.example.com/marathon-16-weeks"],
    ],
    inbox: [
      ["Esercizi contro il mal di testa", "https://fisio.example.it/mal-di-testa"],
      ["Healthy breakfast ideas", "https://food.example.com/healthy-breakfast"],
      ["Corsa: come iniziare senza infortuni", "https://run.example.it/iniziare"],
    ],
  },
  {
    id: "musica",
    name: "Musica",
    examples: [
      ["Migliori album rock del 2023", "https://musica.example.it/album-rock-2023"],
      ["Learn guitar chords for beginners", "https://guitar.example.com/chords-beginners"],
      ["Spartiti gratis per pianoforte", "https://piano.example.it/spartiti-gratis"],
      ["Playlist per studiare con concentrazione", "https://playlist.example.it/studio"],
      ["Storia del jazz in 10 dischi", "https://jazz.example.it/storia-10-dischi"],
      ["Come scegliere una chitarra elettrica", "https://chitarre.example.it/scegliere-elettrica"],
    ],
    inbox: [
      ["Concerti in programma a Milano", "https://live.example.it/milano"],
      ["Best vinyl turntables", "https://hifi.example.com/turntables"],
      ["Come leggere uno spartito", "https://teoria.example.it/leggere-spartito"],
    ],
  },
  {
    id: "casa",
    name: "Casa e fai da te",
    examples: [
      ["Come montare una mensola a muro", "https://faidate.example.it/mensola-muro"],
      ["Guida all'isolamento termico della casa", "https://casa.example.it/isolamento-termico"],
      ["Best cordless drill review", "https://tools.example.com/cordless-drill"],
      ["Tinteggiare le pareti: errori da evitare", "https://faidate.example.it/tinteggiare-errori"],
      ["Riparare un rubinetto che perde", "https://idraulica.example.it/rubinetto-perde"],
      ["Idee per arredare un piccolo soggiorno", "https://arredo.example.it/piccolo-soggiorno"],
    ],
    inbox: [
      ["Come installare un termostato smart", "https://domotica.example.it/termostato"],
      ["Pittura lavabile per pareti", "https://faidate.example.it/pittura-lavabile"],
      ["Best vacuum cleaners 2024", "https://home.example.com/vacuum-cleaners"],
    ],
  },
  {
    id: "lavoro",
    name: "Lavoro e carriera",
    examples: [
      ["Come scrivere un curriculum efficace", "https://carriera.example.it/curriculum"],
      ["Interview questions and answers", "https://jobs.example.com/interview-questions"],
      ["Negoziare lo stipendio: consigli", "https://carriera.example.it/negoziare-stipendio"],
      ["Remote work productivity tips", "https://remote.example.com/productivity"],
      ["LinkedIn profile optimization", "https://jobs.example.com/linkedin-profile"],
      ["Contratto a tempo indeterminato: diritti", "https://lavoro.example.it/tempo-indeterminato"],
    ],
    inbox: [
      ["Lettera di presentazione: esempio", "https://carriera.example.it/lettera-presentazione"],
      ["Come chiedere un aumento", "https://carriera.example.it/chiedere-aumento"],
      ["Tips for working from home", "https://remote.example.com/wfh-tips"],
    ],
  },
];

/** Raccolta realistica sintetica: 8 cartelle con 6 esempi ciascuna e 24 preferiti in inbox. */
export function buildRealisticCorpus(): Corpus {
  const expected: Record<string, string> = {};
  const inbox: FixtureNode[] = [];
  const folders: FixtureNode[] = FOLDERS.map((folder) => {
    folder.inbox.forEach(([title, url], i) => {
      const id = `in-${folder.id}-${i}`;
      inbox.push(urlNode(id, title, url));
      expected[id] = folder.id;
    });
    return folderNode(
      folder.id,
      folder.name,
      folder.examples.map(([title, url], i) => urlNode(`${folder.id}-b${i}`, title, url)),
    );
  });

  const tree = parseBookmarksFile(
    bookmarksFile({
      bookmark_bar: folderNode("1", "Bookmarks bar", [folderNode("inbox", "Inbox", inbox), ...folders]),
      other: folderNode("2", "Other bookmarks", []),
    }),
  );
  return { tree, split: splitInbox(tree, "inbox"), expected };
}
