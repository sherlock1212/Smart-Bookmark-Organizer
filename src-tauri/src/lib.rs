mod brave;

use std::path::PathBuf;

/// Cartella dei dati di Brave dell'utente corrente (Windows: %LOCALAPPDATA%).
fn brave_user_data_dir() -> Result<PathBuf, String> {
    let base = std::env::var_os("LOCALAPPDATA").ok_or_else(|| {
        "Variabile LOCALAPPDATA non trovata: la lettura automatica di Brave funziona solo su Windows."
            .to_string()
    })?;
    Ok(brave::user_data_dir_from(std::path::Path::new(&base)))
}

/// Percorso della cartella dei dati di Brave, per mostrarlo all'utente.
#[tauri::command]
async fn brave_data_dir() -> Result<String, String> {
    Ok(brave_user_data_dir()?.display().to_string())
}

/// Contenuto grezzo di `Local State` (elenco dei profili). Sola lettura.
#[tauri::command]
async fn brave_read_local_state() -> Result<String, String> {
    brave::read_local_state(&brave_user_data_dir()?)
}

/// Contenuto grezzo del file `Bookmarks` di un profilo. Sola lettura.
/// Il nome del profilo è validato dentro `brave::read_bookmarks`.
#[tauri::command]
async fn brave_read_bookmarks(profile_dir: String) -> Result<String, String> {
    brave::read_bookmarks(&brave_user_data_dir()?, &profile_dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            brave_data_dir,
            brave_read_local_state,
            brave_read_bookmarks
        ])
        .run(tauri::generate_context!())
        .expect("errore durante l'avvio di Smart Bookmark Organizer");
}
