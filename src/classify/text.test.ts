import { describe, expect, it } from "vitest";
import { bookmarkText, domainOf, folderText, urlWords } from "./text";

describe("domainOf", () => {
  it("toglie www e porta in minuscolo", () => {
    expect(domainOf("https://WWW.Example.COM/a")).toBe("example.com");
    expect(domainOf("http://sub.example.org:8080/x")).toBe("sub.example.org");
  });

  it("restituisce null per URL non validi", () => {
    expect(domainOf("non un url")).toBeNull();
    expect(domainOf("")).toBeNull();
  });
});

describe("urlWords", () => {
  it("estrae parole dal percorso, decodificando e separando i trattini", () => {
    expect(urlWords("https://example.com/guide/ricette-di-pasta_fresca")).toEqual([
      "guide",
      "ricette",
      "di",
      "pasta",
      "fresca",
    ]);
    expect(urlWords("https://example.com/caff%C3%A8-%C3%A8-buono")).toEqual(["caffè", "buono"]);
  });

  it("scarta query, frammento, numeri puri, hash e parole troppo lunghe", () => {
    const words = urlWords(
      "https://example.com/a1/2024/deadbeef12345678/x/" + "z".repeat(40) + "?id=99&q=segreto#sezione",
    );
    expect(words).toEqual(["a1"]);
  });

  it("limita il numero di parole e tollera codifiche rotte", () => {
    const many = "https://e.com/" + Array.from({ length: 30 }, (_, i) => `parola${String.fromCharCode(97 + (i % 26))}`).join("/");
    expect(urlWords(many)).toHaveLength(8);
    expect(urlWords("https://e.com/%E0%A4%A-ciao")).toContain("ciao");
    expect(urlWords("non url")).toEqual([]);
  });
});

describe("bookmarkText", () => {
  it("unisce titolo, dominio e parole dell'URL", () => {
    expect(
      bookmarkText({ title: "  Ricetta   carbonara ", url: "https://www.cucina.it/ricette/carbonara-classica" }),
    ).toBe("Ricetta carbonara · cucina.it · ricette carbonara classica");
  });

  it("funziona senza titolo", () => {
    expect(bookmarkText({ title: "", url: "https://cucina.it/pasta" })).toBe("cucina.it · pasta");
  });

  it("restituisce testo vuoto se non c'è nulla di utile", () => {
    expect(bookmarkText({ title: " ", url: "boh" })).toBe("");
  });

  it("limita la lunghezza", () => {
    expect(bookmarkText({ title: "a".repeat(1000), url: "https://e.com" }).length).toBeLessThanOrEqual(240);
  });
});

describe("folderText", () => {
  it("ignora la radice e tiene gli ultimi tre livelli", () => {
    expect(folderText({ path: ["Bookmarks bar", "Viaggi", "Italia"] })).toBe("Viaggi · Italia");
    expect(folderText({ path: ["Bookmarks bar", "A", "B", "C", "D"] })).toBe("B · C · D");
  });

  it("per una radice usa il suo nome", () => {
    expect(folderText({ path: ["Other bookmarks"] })).toBe("Other bookmarks");
  });
});
