import type { Embedder } from "../classify/embedder";
import { normalize } from "../classify/vector";

/**
 * Embedder finto e deterministico per i test: rappresenta le parole (e i loro frammenti)
 * tramite hashing. NON capisce il significato: due testi sono vicini solo se condividono parole.
 * Serve a provare la logica del classificatore, non la qualità del modello vero.
 */
export class HashingEmbedder implements Embedder {
  readonly id = "hashing-test-v1";
  readonly dimensions = 512;
  calls = 0;
  readonly textsSeen: string[] = [];

  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls += 1;
    this.textsSeen.push(...texts);
    return texts.map((text) => this.vectorOf(text));
  }

  private vectorOf(text: string): Float32Array {
    const v = new Float32Array(this.dimensions);
    const add = (feature: string, weight: number): void => {
      const hash = fnv1a(feature);
      const index = hash % this.dimensions;
      const sign = (hash >>> 16) & 1 ? 1 : -1;
      v[index] = v[index]! + sign * weight;
    };
    for (const token of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (token.length < 2) continue;
      add(`w:${token}`, 1);
      if (token.length >= 5) {
        for (let i = 0; i + 3 <= token.length; i++) add(`g:${token.slice(i, i + 3)}`, 0.3);
      }
    }
    return normalize(v);
  }
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
