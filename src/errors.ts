/** Messaggio leggibile da un errore qualsiasi (le chiamate Tauri falliscono con una stringa). */
export function errorMessage(error: unknown): string {
  if (typeof error === "string" && error !== "") return error;
  if (error instanceof Error && error.message !== "") return error.message;
  return "Errore sconosciuto.";
}
