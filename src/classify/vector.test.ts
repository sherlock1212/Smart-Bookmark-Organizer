import { describe, expect, it } from "vitest";
import { dot, meanVector, normalize, similarity, topKMean } from "./vector";

const v = (...n: number[]): Float32Array => Float32Array.from(n);

describe("vector", () => {
  it("dot calcola il prodotto scalare e rifiuta dimensioni diverse", () => {
    expect(dot(v(1, 2, 3), v(4, 5, 6))).toBe(32);
    expect(() => dot(v(1, 2), v(1, 2, 3))).toThrow(/dimensioni diverse/);
    expect(similarity).toBe(dot);
  });

  it("normalize porta a lunghezza 1 e gestisce il vettore nullo", () => {
    const n = normalize(v(3, 4));
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
    expect(Array.from(normalize(v(0, 0)))).toEqual([0, 0]);
  });

  it("meanVector media e normalizza", () => {
    const m = meanVector([v(1, 0), v(0, 1)]);
    expect(m[0]).toBeCloseTo(Math.SQRT1_2);
    expect(m[1]).toBeCloseTo(Math.SQRT1_2);
    expect(() => meanVector([])).toThrow();
    expect(() => meanVector([v(1), v(1, 2)])).toThrow(/dimensioni diverse/);
  });

  it("topKMean media i k valori più grandi", () => {
    expect(topKMean([1, 5, 3, 4], 2)).toBe(4.5);
    expect(topKMean([2, 4], 5)).toBe(3);
    expect(topKMean([7], 0)).toBe(7);
    expect(() => topKMean([], 3)).toThrow();
  });

  it("topKMean non modifica l'array di ingresso", () => {
    const values = [1, 3, 2];
    topKMean(values, 2);
    expect(values).toEqual([1, 3, 2]);
  });
});
