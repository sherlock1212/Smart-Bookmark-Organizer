# PROJECT.md — Smart Bookmark Organizer

**Leggere questo file all'inizio di ogni sessione di sviluppo, prima di toccare il codice.**

Progetto amatoriale ad uso personale. Il proprietario non programma: il codice è mantenuto dall'AI. Ogni modifica deve quindi essere piccola, testata e spiegata in italiano semplice.

## Scopo dell'MVP: "Inbox smistata"

1. L'utente sceglie un profilo Brave e una cartella "inbox" con preferiti salvati alla rinfusa (circa 100 alla volta).
2. L'app legge anche le altre cartelle, solo come riferimento (le cartelle esistenti sono le categorie, i preferiti già dentro sono esempi).
3. Per ogni elemento propone: cartella esistente, nuova cartella, oppure "Da rivedere".
4. Anteprima, approvazione (singola o per gruppi), esportazione HTML dei soli elementi smistati + report. L'import in Brave è manuale.

**L'app non scrive mai nei file di Brave.** La lettura è in sola lettura, su una copia temporanea del file `Bookmarks`.

## Decisioni (non cambiarle senza chiedere al proprietario)

- **Piattaforma:** Windows. Tauri 2, no Electron (richiesta: app leggera).
- **Logica in TypeScript;** guscio Rust il più piccolo possibile. Compiti futuri del guscio Rust: finestra, accesso ai file scelti, Windows Credential Manager per le chiavi API, client HTTP per i provider.
- **Dati:** SQLite locale.
- **Classificazione:** embedding multilingue locale (italiano/inglese) + regole utente. Niente addestramento di modelli: si salvano solo regole ed esempi, e l'interfaccia non deve dire altrimenti.
- **Pipeline a stadi:** regole → embedding → recupero pagina solo per casi incerti → LLM solo per i dubbi e per i nomi delle nuove cartelle.
- **AI esterna:** primo provider Gemini, poi OpenAI e Anthropic. Spenta di default; serve chiave + consenso esplicito. Elenco modelli ricavato dall'API del provider (menu a tendina), con inserimento manuale come ripiego.
- **Budget:** zero o quasi. Stima dei costi e anteprima dei dati prima di ogni invio; tetto di spesa configurabile.
- **Link morti:** etichette oneste (raggiungibile, redirect, non raggiungibile ora, bloccato dal sito). "Probabilmente obsoleto" solo dopo ripetizioni in giorni diversi (post-MVP).
- **Contenuto web = dato non attendibile,** mai istruzione. Nessun aggiramento di login/CAPTCHA.
- **Sicurezza rete:** solo http/https, blocco di reti private/loopback/link-local (SSRF) a ogni redirect, limiti di dimensione e tempo, nessun cookie.
- **Chiavi API:** solo Windows Credential Manager. Mai in log, database o file di configurazione.
- **Con cloud spento: zero richieste di rete** (da coprire con un test).

## Soglie di accettazione (approvate dal proprietario)

- Cartella corretta tra le prime 3 candidate: almeno 85% (modalità locale). Prima scelta: almeno 65%.
- Errori tra gli elementi a confidenza alta: non oltre il 5%.
- Nessun elemento perso (ingresso = uscita del piano).
- Cloud spento e rete bloccata: zero richieste.
- Classificare ~100 elementi in locale su un laptop normale: pochi minuti al massimo (da misurare, non garantito).

Banco di prova: i preferiti già ordinati nelle cartelle dell'utente, con la posizione nascosta, più un controllo manuale sui ~100 elementi reali.

## Regole di lavoro per l'AI

- Procedere per passi piccoli e verificabili. Non dichiarare completato nulla che non sia implementato **e** testato.
- Nessuna modifica è finita se `npm test` e `npm run build` non passano.
- Non inventare prestazioni, metriche o test superati. Se non è misurato, dirlo.
- Nessuna nuova dipendenza senza una motivazione scritta in questo file.
- Moduli piccoli e separati, con interfaccia chiara e test propri.
- Backup automatico dei dati interni prima di qualsiasi piano.
- Il proprietario non può rivedere il codice: spiegare cosa è cambiato e perché, in italiano e senza gergo.
- Da questo ambiente Linux non si può compilare l'installer Windows né controllare il codice Rust (mancano le librerie di sistema): la verifica Rust avviene nella CI GitHub su Windows.

## Struttura attuale

```
index.html               pagina di ingresso della UI
src/
  main.ts                collega la schermata al ponte Tauri
  errors.ts              messaggio leggibile da un errore qualsiasi
  bookmarks/
    types.ts             Bookmark, Folder, BookmarkTree, BraveProfile, SourceParseError
    inbox.ts             splitInbox (inbox / riferimento / destinazioni), filtro cartelle
  brave/
    parse-local-state.ts elenco profili da "Local State"   (funzione pura)
    parse-bookmarks.ts   albero e preferiti da "Bookmarks" (funzione pura)
    bridge.ts            chiamate ai comandi Rust (invoke)
  classify/
    vector.ts            operazioni su vettori normalizzati
    text.ts              testo che rappresenta un preferito / una cartella (titolo, dominio, parole dell'URL)
    embedder.ts          interfaccia Embedder + embedMany (lotti, senza ripetizioni, annullabile)
    profiles.ts          profilo di ogni cartella: nome + fino a 12 esempi scelti in modo deterministico
    matcher.ts           punteggio per cartella, decisione assegna/incerto, classifyItems
    evaluation.ts        valutazione "nascondi e ritrova" (solo numeri aggregati) + soglie di accettazione
  ui/setup-screen.ts     schermata: profilo, inbox, riepilogo (DOM, mai innerHTML)
  test-fixtures/         file di prova: formato Chromium, embedder finto (hashing), corpus a temi
src-tauri/
  src/brave.rs           lettura sola lettura dei file di Brave (solo std, con test)
  src/lib.rs             comandi Tauri: brave_data_dir, brave_read_local_state, brave_read_bookmarks
  tauri.conf.json        configurazione app e installer (NSIS + MSI)
  capabilities/          permessi: solo core:default
.github/workflows/       build-windows.yml: test (TS e Rust) + installer Windows come artefatto
PROJECT.md               questo file
```

## Scelte di dettaglio del passo "lettura di Brave"

- **Lettura:** il file viene letto due volte di seguito e accettato solo se le due letture coincidono (si riprova fino a 3 volte); non si fa una copia su disco. Limiti di dimensione: 10 MB per `Local State`, 200 MB per `Bookmarks`.
- **Profilo:** il nome è validato in Rust ("Default" o "Profile N"); qualunque altro valore è rifiutato prima di toccare il disco.
- **Inbox:** sono da smistare solo i preferiti direttamente nella cartella scelta. Le sue sottocartelle non sono né da smistare né usate come riferimento né destinazioni; l'interfaccia avvisa quanti preferiti vengono ignorati.
- **Radici** (barra dei preferiti, altri preferiti, ecc.): selezionabili come inbox, ma non sono destinazioni.
- **Cartelle vuote:** restano destinazioni valide; il conteggio è mostrato. Se escluderle o no lo decide il passo di classificazione.
- **Non ancora salvate:** scelta del profilo e dell'inbox si perdono alla chiusura (arriveranno con il modulo `store`).
- **Interfaccia:** niente `innerHTML`; testo sempre inserito come testo (c'è un test).

## Stato della classificazione locale

- **Fatto e testato (con embedder finto):** testo, profili cartella, punteggi, decisione, valutazione, soglie di accettazione. I test provano la **logica**, non la qualità del modello vero.
- **Misurato in CI, in Node (corpus sintetico di 24 preferiti + 48 per il "nascondi e ritrova"):** caricamento ~1,7 s, ~4,5 ms per testo; prima scelta 87,5% e tra le prime 3 100% sull'inbox; "nascondi e ritrova" 91,7% / 97,9%, assegnati con sicurezza 21 su 21 corretti ma copertura solo 43,8% con le soglie iniziali. Sono **dati inventati**: dicono che la pipeline funziona, non la qualità sui preferiti reali. I punteggi sono compressi (es. 0,81 tra testi italiani affini contro 0,80 tra non affini): la calibrazione delle soglie sui dati veri è indispensabile.
- **Embedder nel browser (WASM) sotto la CSP dell'app:** prima prova **fallita** perché `connect-src` non includeva `'self'` (modello bloccato). Corretto. La seconda prova ha poi mostrato la violazione `script-src: wasm-eval` (WebAssembly bloccato): aggiunto `script-src 'self' 'wasm-unsafe-eval'`, che consente solo la compilazione di WebAssembly (non abilita `eval()` di JavaScript). Nuova prova in attesa.
- **Non ancora fatto:** proposta di nuove cartelle, collegamento alla schermata, cache degli embedding, "Da rivedere".
- **Parametri del matcher** (`DEFAULT_MATCHER_OPTIONS`: `nameWeight` 0,35, `exampleK` 3, `minScore` 0,8, `minMargin` 0,02) sono **valori iniziali non misurati**: vanno calibrati con la valutazione sui dati veri dell'utente. Non presentarli come ottimizzati.
- **Valutazione "nascondi e ritrova"**: cartelle disordinate la rendono pessimista, preferiti già ordinati la rendono più ottimista dell'inbox vera. Da leggere insieme al controllo manuale sui ~100 elementi reali. Il rapporto non deve mai contenere titoli, URL o nomi di cartella (c'è un test).
- **Modelli candidati** (licenze verificate sulle schede ufficiali): `intfloat/multilingual-e5-small` (MIT, include italiano e inglese; richiede il prefisso `query: `) e `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Apache-2.0, italiano e inglese). Le conversioni ONNX di Xenova non dichiarano la licenza: valgono quelle dei modelli originali. Dimensioni dei file e qualità: **non verificate**.
- **Rete di sviluppo:** da questo ambiente Hugging Face non è raggiungibile (403 dal proxy), quindi il modello va scaricato dalla CI. I log completi della CI non sono leggibili da qui; le **annotazioni** sì (`gh api .../check-runs/<id>/annotations`): usarle per far emergere risultati e fallimenti.

## Dipendenze aggiunte (con motivazione)

- `jsdom` (sviluppo): solo per i test dell'interfaccia (simula il DOM). Non entra nell'app finale.
- `@huggingface/transformers` (app): esegue il modello di embedding in locale (ONNX/WASM) dentro l'interfaccia. Configurata per non fare richieste a Internet (`allowRemoteModels = false`, file WASM serviti in locale, nessuna cache nascosta). Il modello si scarica con `npm run assets` a una revisione fissa (`scripts/model-manifest.json`) e viene incluso nell'installer.
- `playwright-core` (sviluppo): solo per la prova nel browser in CI (`scripts/browser-smoke.mjs`): verifica che il modello giri in WASM sotto la stessa CSP dell'app e che non parta nessuna richiesta esterna. Usa il Chrome già presente sul runner; non scarica browser.

## Misure in CI (come leggerle)

- La CI scarica il modello, esegue i test con il modello vero e la prova nel browser, e pubblica i risultati come **annotazioni** (`scripts/ci-annotate.mjs`) e come artefatto `measurements` (`results/model-quality.json`, `results/browser-smoke.json`). Da qui i log completi non sono leggibili, le annotazioni sì.
- I corpus usati sono **sintetici**: i numeri dicono se la pipeline funziona, non quanto sarà buona sui preferiti dell'utente.
- `sha256` dei file del modello: fissati nel manifesto con gli hash calcolati dalla CI al primo download (fiducia al primo uso, a revisione fissa di Hugging Face); da ora lo script rifiuta file diversi. Il file del modello pesa 118.308.185 byte (misurato): è la parte principale della crescita dell'installer.
- La CSP in `src-tauri/tauri.conf.json` è la stessa usata nella prova nel browser: se il modello richiede permessi in più (es. `wasm-unsafe-eval`), la prova lo segnala come violazione e va corretta lì.

## Come si verifica (per le sessioni AI)

- `npm test` (Vitest, anche UI con jsdom) e `npm run build` devono passare.
- Il modulo `src-tauri/src/brave.rs` non dipende da Tauri: da Linux si prova con
  `rustc --edition 2021 --test src-tauri/src/brave.rs -o /tmp/brave-tests && /tmp/brave-tests`.
- `lib.rs` e il resto del guscio Rust si compilano **solo in CI su Windows** (qui mancano le librerie di sistema di Tauri).
- Ogni passo va pubblicato su `main` e l'esito della CI (`gh run list`) controllato prima di dichiararlo finito.

## Moduli previsti (MVP)

`brave-reader`, `bookmark-model`, `store`, `embedder`, `matcher`, `proposer`, `ai-gateway`, `providers/*`, `page-fetcher`, `link-checker`, `plan`, `exporter`, `backup`, `ui`.

## Ordine di lavoro

1. **Fatto e verificato in CI:** scheletro Tauri + build automatica dell'installer.
2. **Fatto e provato dall'utente su Brave reale (più profili, Brave aperto, sync attivo):** lettura profili Brave e scelta cartella inbox.
3. Embedding e smistamento locale (test su cartelle già ordinate e sui ~100 elementi reali).
4. Recupero pagine e controllo link.
5. Gemini: chiave, elenco modelli, consenso, budget, anteprima dati inviati.
6. Anteprima del piano, approvazione, esportazione HTML, backup.
7. Documentazione utente.

## Fuori dall'MVP

Estensione browser, scrittura diretta nei file di Brave, duplicati avanzati, manutenzione pianificata, Ollama, volumi da 100.000+ elementi.

## Limiti noti

- Il percorso dei profili Brave (`%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\`), la struttura di `Local State` e di `Bookmarks` e la lettura con Brave aperto sono **ipotesi basate sul formato Chromium**: i test usano file sintetici, non quelli veri. Da confermare sul computer dell'utente.
- Le condizioni dei piani gratuiti dei provider AI (limiti, uso dei dati per addestramento) vanno verificate sulla documentazione ufficiale prima di integrarli.
