import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleBookmarks, sampleLocalState } from "../test-fixtures/chromium";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { getBraveDataDir, isTauri, loadBraveBookmarks, loadBraveProfiles } from "./bridge";

describe("bridge Tauri", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("legge i profili dal comando brave_read_local_state", async () => {
    invokeMock.mockResolvedValue(sampleLocalState());
    const profiles = await loadBraveProfiles();
    expect(invokeMock).toHaveBeenCalledWith("brave_read_local_state");
    expect(profiles.map((p) => p.dirName)).toEqual(["Default", "Profile 2", "Profile 10"]);
  });

  it("passa il profilo con il nome di argomento profileDir (camelCase)", async () => {
    invokeMock.mockResolvedValue(sampleBookmarks());
    const tree = await loadBraveBookmarks("Profile 2");
    expect(invokeMock).toHaveBeenCalledWith("brave_read_bookmarks", { profileDir: "Profile 2" });
    expect(tree.bookmarks).toHaveLength(9);
  });

  it("chiede la cartella dei dati con il comando brave_data_dir", async () => {
    invokeMock.mockResolvedValue("C:\\x");
    await expect(getBraveDataDir()).resolves.toBe("C:\\x");
    expect(invokeMock).toHaveBeenCalledWith("brave_data_dir");
  });

  it("propaga gli errori dei comandi così come sono", async () => {
    invokeMock.mockRejectedValue("Il profilo 'Default' non ha ancora un file dei preferiti.");
    await expect(loadBraveBookmarks("Default")).rejects.toBe(
      "Il profilo 'Default' non ha ancora un file dei preferiti.",
    );
  });

  it("segnala contenuto non valido restituito dal guscio", async () => {
    invokeMock.mockResolvedValue("non json");
    await expect(loadBraveBookmarks("Default")).rejects.toThrow(/non è leggibile/);
  });

  it("isTauri è falso fuori da Tauri", () => {
    expect(isTauri()).toBe(false);
  });
});
