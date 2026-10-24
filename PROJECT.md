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
index.html            pagina di ingresso della UI
src/                  frontend TypeScript (logica + interfaccia) e test (*.test.ts)
src-tauri/            guscio Rust (finestra, in futuro file/chiavi/HTTP)
  tauri.conf.json     configurazione app e installer (NSIS + MSI)
  capabilities/       permessi: solo core:default per ora
.github/workflows/    build-windows.yml: test + installer Windows come artefatto
PROJECT.md            questo file
```

## Moduli previsti (MVP)

`brave-reader`, `bookmark-model`, `store`, `embedder`, `matcher`, `proposer`, `ai-gateway`, `providers/*`, `page-fetcher`, `link-checker`, `plan`, `exporter`, `backup`, `ui`.

## Ordine di lavoro

1. **Fatto in locale, da verificare in CI:** scheletro Tauri + build automatica dell'installer.
2. Lettura profili Brave e scelta cartella inbox (primo controllo sul computer dell'utente).
3. Embedding e smistamento locale (test su cartelle già ordinate e sui ~100 elementi reali).
4. Recupero pagine e controllo link.
5. Gemini: chiave, elenco modelli, consenso, budget, anteprima dati inviati.
6. Anteprima del piano, approvazione, esportazione HTML, backup.
7. Documentazione utente.

## Fuori dall'MVP

Estensione browser, scrittura diretta nei file di Brave, duplicati avanzati, manutenzione pianificata, Ollama, volumi da 100.000+ elementi.

## Limiti noti

- Il percorso dei profili Brave (`%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\`) e la struttura del file `Bookmarks` sono da conferma sul computer dell'utente.
- Le condizioni dei piani gratuiti dei provider AI (limiti, uso dei dati per addestramento) vanno verificate sulla documentazione ufficiale prima di integrarli.
