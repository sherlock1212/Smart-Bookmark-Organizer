# Smart Bookmark Organizer

App desktop per Windows che smista i preferiti salvati alla rinfusa nelle cartelle giuste (o in nuove cartelle), con anteprima e approvazione prima di qualsiasi esportazione. Progetto personale.

Stato: **scheletro iniziale** (finestra vuota + compilazione automatica dell'installer). Le funzioni vere arrivano nei passi successivi; vedi [PROJECT.md](PROJECT.md).

## Scaricare l'installer

1. Su GitHub apri la scheda **Actions** del repository.
2. Scegli l'ultima esecuzione di *Build Windows installer* (deve avere la spunta verde).
3. In fondo alla pagina, sezione **Artifacts**, scarica `windows-installer` e installa il file `.exe`.

L'installer non è firmato: Windows SmartScreen può mostrare un avviso ("Maggiori informazioni" → "Esegui comunque").

## Sviluppo

Richiede Node.js 22 e Rust. Su Windows:

```
npm install
npm test
npm run tauri dev
```
