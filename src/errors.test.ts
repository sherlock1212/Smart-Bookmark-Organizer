import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("accetta stringhe ed Error", () => {
    expect(errorMessage("ciao")).toBe("ciao");
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("ha un messaggio di ripiego per tutto il resto", () => {
    for (const value of [undefined, null, 42, {}, "", new Error("")]) {
      expect(errorMessage(value)).toBe("Errore sconosciuto.");
    }
  });
});
