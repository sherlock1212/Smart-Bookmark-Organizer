import { describe, expect, it } from "vitest";
import { APP_NAME, welcomeText } from "./info";

describe("welcomeText", () => {
  it("contiene nome e versione", () => {
    const text = welcomeText("1.2.3");
    expect(text).toContain(APP_NAME);
    expect(text).toContain("v1.2.3");
  });
});
