/** Informazioni statiche dell'app, mostrate nella schermata iniziale. */
export const APP_NAME = "Smart Bookmark Organizer";
export const APP_VERSION = "0.1.0";

/** Testo della schermata iniziale (funzione pura, facile da testare). */
export function welcomeText(version: string = APP_VERSION): string {
  return `${APP_NAME} v${version}: la catena di compilazione funziona.`;
}
