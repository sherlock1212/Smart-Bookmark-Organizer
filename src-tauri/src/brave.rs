//! Lettura in SOLA LETTURA dei file di Brave.
//!
//! Questo modulo usa solo la libreria standard (nessuna dipendenza da Tauri), così i suoi
//! test girano ovunque: `rustc --edition 2021 --test src/brave.rs`.
//!
//! Regole di sicurezza:
//! - si leggono solo due file: `Local State` e `<profilo>/Bookmarks`;
//! - il nome del profilo è validato ("Default" o "Profile N"): niente separatori di percorso,
//!   quindi niente uscite dalla cartella di Brave (path traversal);
//! - nessuna scrittura, nessuna cancellazione;
//! - limite di dimensione sui file letti.

use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_LOCAL_STATE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_BOOKMARKS_BYTES: u64 = 200 * 1024 * 1024;
const MAX_READ_ATTEMPTS: u32 = 3;

/// Cartella dei dati di Brave a partire da %LOCALAPPDATA%.
pub fn user_data_dir_from(local_app_data: &Path) -> PathBuf {
    local_app_data
        .join("BraveSoftware")
        .join("Brave-Browser")
        .join("User Data")
}

/// Accetta solo "Default" oppure "Profile N" (N = 1-6 cifre).
pub fn is_valid_profile_dir(name: &str) -> bool {
    if name == "Default" {
        return true;
    }
    match name.strip_prefix("Profile ") {
        Some(number) => {
            !number.is_empty() && number.len() <= 6 && number.chars().all(|c| c.is_ascii_digit())
        }
        None => false,
    }
}

/// Legge un file intero, rifiutando quelli oltre il limite.
fn read_limited(path: &Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|e| format!("Impossibile aprire il file ({e})."))?;
    let size = file
        .metadata()
        .map_err(|e| format!("Impossibile leggere le informazioni del file ({e})."))?
        .len();
    if size > max_bytes {
        return Err(format!(
            "Il file è troppo grande ({size} byte, limite {max_bytes})."
        ));
    }
    let mut bytes = Vec::with_capacity(size as usize);
    file.take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Errore durante la lettura del file ({e})."))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!("Il file è troppo grande (limite {max_bytes} byte)."));
    }
    Ok(bytes)
}

/// Legge il file due volte di seguito e accetta il risultato solo se coincide: se Brave lo sta
/// riscrivendo proprio ora, si riprova. In questo modo non si usa mai un file letto a metà.
fn read_stable(path: &Path, max_bytes: u64) -> Result<String, String> {
    for _ in 0..MAX_READ_ATTEMPTS {
        let first = read_limited(path, max_bytes)?;
        let second = read_limited(path, max_bytes)?;
        if first == second {
            return String::from_utf8(first)
                .map_err(|_| "Il file non è testo UTF-8 valido.".to_string());
        }
    }
    Err("Il file cambia di continuo (Brave lo sta riscrivendo). Riprova tra qualche secondo."
        .to_string())
}

/// Contenuto grezzo di `Local State` (elenco dei profili).
pub fn read_local_state(user_data_dir: &Path) -> Result<String, String> {
    let path = user_data_dir.join("Local State");
    if !path.is_file() {
        return Err(format!(
            "Non trovo il file 'Local State' di Brave in {}. Brave è installato su questo computer?",
            user_data_dir.display()
        ));
    }
    read_stable(&path, MAX_LOCAL_STATE_BYTES)
}

/// Contenuto grezzo del file `Bookmarks` di un profilo.
pub fn read_bookmarks(user_data_dir: &Path, profile_dir: &str) -> Result<String, String> {
    if !is_valid_profile_dir(profile_dir) {
        return Err("Nome del profilo non valido.".to_string());
    }
    let path = user_data_dir.join(profile_dir).join("Bookmarks");
    if !path.is_file() {
        return Err(format!(
            "Il profilo '{profile_dir}' non ha ancora un file dei preferiti."
        ));
    }
    read_stable(&path, MAX_BOOKMARKS_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    /// Cartella temporanea unica, rimossa alla fine del test.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let n = COUNTER.fetch_add(1, Ordering::SeqCst);
            let dir = std::env::temp_dir().join(format!(
                "sbo-brave-test-{}-{}",
                std::process::id(),
                n
            ));
            fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn user_data_dir_has_expected_shape() {
        let p = user_data_dir_from(Path::new("C:\\Users\\x\\AppData\\Local"));
        let s = p.to_string_lossy().replace('\\', "/");
        assert!(s.ends_with("BraveSoftware/Brave-Browser/User Data"));
    }

    #[test]
    fn accepts_valid_profile_names() {
        assert!(is_valid_profile_dir("Default"));
        assert!(is_valid_profile_dir("Profile 1"));
        assert!(is_valid_profile_dir("Profile 12"));
        assert!(is_valid_profile_dir("Profile 123456"));
    }

    #[test]
    fn rejects_invalid_or_dangerous_profile_names() {
        for bad in [
            "",
            "default",
            "Profile",
            "Profile ",
            "Profile x",
            "Profile 1234567",
            "Profile 1/..",
            "..",
            "../Default",
            "..\\Default",
            "Default/",
            "Default\\..\\x",
            "Profile -1",
            "Profile 1 ",
            "C:\\Windows",
            "/etc/passwd",
            "Default\0",
        ] {
            assert!(!is_valid_profile_dir(bad), "doveva essere rifiutato: {bad:?}");
        }
    }

    #[test]
    fn reads_local_state_and_bookmarks() {
        let tmp = TempDir::new();
        fs::write(tmp.0.join("Local State"), "{\"a\":1}").unwrap();
        fs::create_dir_all(tmp.0.join("Profile 1")).unwrap();
        fs::write(tmp.0.join("Profile 1").join("Bookmarks"), "{\"roots\":{}}").unwrap();

        assert_eq!(read_local_state(&tmp.0).unwrap(), "{\"a\":1}");
        assert_eq!(read_bookmarks(&tmp.0, "Profile 1").unwrap(), "{\"roots\":{}}");
    }

    #[test]
    fn reads_utf8_content_intact() {
        let tmp = TempDir::new();
        fs::create_dir_all(tmp.0.join("Default")).unwrap();
        let content = "{\"name\":\"Città — «prova» 日本\"}";
        fs::write(tmp.0.join("Default").join("Bookmarks"), content).unwrap();
        assert_eq!(read_bookmarks(&tmp.0, "Default").unwrap(), content);
    }

    #[test]
    fn missing_files_give_clear_errors() {
        let tmp = TempDir::new();
        let err = read_local_state(&tmp.0).unwrap_err();
        assert!(err.contains("Local State"));
        let err = read_bookmarks(&tmp.0, "Default").unwrap_err();
        assert!(err.contains("Default"));
    }

    #[test]
    fn invalid_profile_never_touches_the_filesystem() {
        let tmp = TempDir::new();
        // Un file "Bookmarks" fuori dal profilo non deve poter essere raggiunto.
        fs::write(tmp.0.join("Bookmarks"), "segreto").unwrap();
        let err = read_bookmarks(&tmp.0, "..").unwrap_err();
        assert!(err.contains("non valido"));
        assert!(read_bookmarks(&tmp.0, "../").is_err());
    }

    #[test]
    fn rejects_non_utf8_files() {
        let tmp = TempDir::new();
        fs::write(tmp.0.join("Local State"), [0xff, 0xfe, 0xfd]).unwrap();
        let err = read_local_state(&tmp.0).unwrap_err();
        assert!(err.contains("UTF-8"));
    }

    #[test]
    fn rejects_files_over_the_limit() {
        let tmp = TempDir::new();
        let path = tmp.0.join("grande.json");
        fs::write(&path, vec![b'a'; 100]).unwrap();
        let err = read_limited(&path, 50).unwrap_err();
        assert!(err.contains("troppo grande"));
        assert!(read_limited(&path, 100).is_ok());
    }

    #[test]
    fn does_not_modify_the_source_file() {
        let tmp = TempDir::new();
        fs::create_dir_all(tmp.0.join("Default")).unwrap();
        let path = tmp.0.join("Default").join("Bookmarks");
        fs::write(&path, "{\"roots\":{}}").unwrap();
        let before = fs::metadata(&path).unwrap().modified().unwrap();
        read_bookmarks(&tmp.0, "Default").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"roots\":{}}");
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), before);
    }
}
