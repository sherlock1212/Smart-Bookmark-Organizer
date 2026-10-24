import { invoke } from "@tauri-apps/api/core";
import type { BookmarkTree, BraveProfile } from "../bookmarks/types";
import { parseBookmarksFile } from "./parse-bookmarks";
import { parseLocalState } from "./parse-local-state";

/** Vero quando l'interfaccia gira dentro Tauri (e quindi può leggere i file di Brave). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Cartella dei dati di Brave usata dall'app. */
export function getBraveDataDir(): Promise<string> {
  return invoke<string>("brave_data_dir");
}

/** Profili di Brave, nell'ordine in cui li mostra il browser. */
export async function loadBraveProfiles(): Promise<BraveProfile[]> {
  const text = await invoke<string>("brave_read_local_state");
  return parseLocalState(text);
}

/** Preferiti di un profilo. Il nome del profilo viene validato anche lato Rust. */
export async function loadBraveBookmarks(profileDir: string): Promise<BookmarkTree> {
  // Il nome dell'argomento deve essere profileDir: Tauri lo converte nel profile_dir di Rust.
  const text = await invoke<string>("brave_read_bookmarks", { profileDir });
  return parseBookmarksFile(text);
}
