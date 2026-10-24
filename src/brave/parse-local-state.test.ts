import { describe, expect, it } from "vitest";
import { SourceParseError } from "../bookmarks/types";
import { sampleLocalState } from "../test-fixtures/chromium";
import { parseLocalState } from "./parse-local-state";

describe("parseLocalState", () => {
  it("legge i profili nell'ordine di Brave", () => {
    const profiles = parseLocalState(sampleLocalState());
    expect(profiles.map((p) => p.dirName)).toEqual(["Default", "Profile 2", "Profile 10"]);
  });

  it("legge nome ed email, con email vuota = null", () => {
    const profiles = parseLocalState(sampleLocalState());
    expect(profiles[0]).toEqual({ dirName: "Default", displayName: "Persona 1", email: null });
    expect(profiles[1]?.email).toBeNull();
    expect(profiles[2]).toEqual({
      dirName: "Profile 10",
      displayName: "Lavoro",
      email: "me@example.com",
    });
  });

  it("senza profiles_order usa l'ordine naturale (Profile 2 prima di Profile 10)", () => {
    const text = JSON.stringify({
      profile: {
        info_cache: { "Profile 10": { name: "B" }, "Profile 2": { name: "A" } },
      },
    });
    expect(parseLocalState(text).map((p) => p.dirName)).toEqual(["Profile 2", "Profile 10"]);
  });

  it("usa il nome della cartella se il nome visualizzato manca o è vuoto", () => {
    const text = JSON.stringify({
      profile: { info_cache: { Default: { name: "  " }, "Profile 1": {} } },
    });
    const names = parseLocalState(text).map((p) => p.displayName);
    expect(names).toEqual(["Default", "Profile 1"]);
  });

  it("ignora le voci che non sono oggetti", () => {
    const text = JSON.stringify({
      profile: { info_cache: { Default: { name: "A" }, Rotto: "x", Nullo: null } },
    });
    expect(parseLocalState(text).map((p) => p.dirName)).toEqual(["Default"]);
  });

  it("segnala JSON non valido", () => {
    expect(() => parseLocalState("{non json")).toThrow(SourceParseError);
  });

  it("segnala struttura senza profili", () => {
    expect(() => parseLocalState("{}")).toThrow(/elenco dei profili/);
    expect(() => parseLocalState(JSON.stringify({ profile: { info_cache: {} } }))).toThrow(
      /nessun profilo/,
    );
  });
});
