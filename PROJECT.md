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
  ui/setup-screen.ts     schermata: profilo, inbox, riepilogo (DOM, mai innerHTML)
  test-fixtures/         file di prova nel formato Chromium (solo test)
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

## Dipendenze di sviluppo aggiunte

- `jsdom`: solo per i test dell'interfaccia (simula il DOM). Non entra nell'app finale.

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
2. **Scritto, test passati; da provare sul computer dell'utente:** lettura profili Brave e scelta cartella inbox.
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
