import { normalize } from "./vector";

/**
 * Trasforma testi in vettori che ne rappresentano il significato.
 * Contratto: un vettore per testo, nello stesso ordine, tutti della stessa dimensione.
 * Eventuali prefissi richiesti dal modello (es. "query: ") li applica l'implementazione.
 */
export interface Embedder {
  /** Identificativo del modello (serve per la cache: vettori di modelli diversi non si mescolano). */
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export class CancelledError extends Error {
  constructor() {
    super("Operazione annullata.");
    this.name = "CancelledError";
  }
}

export interface EmbedOptions {
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Calcola i vettori di molti testi a lotti, senza ripetere testi uguali.
 * Restituisce una mappa testo → vettore normalizzato.
 */
export async function embedMany(
  embedder: Embedder,
  texts: string[],
  options: EmbedOptions = {},
): Promise<Map<string, Float32Array>> {
  const batchSize = Math.max(1, options.batchSize ?? 32);
  const unique = [...new Set(texts)];
  const result = new Map<string, Float32Array>();

  for (let start = 0; start < unique.length; start += batchSize) {
    if (options.signal?.aborted) throw new CancelledError();
    const batch = unique.slice(start, start + batchSize);
    const vectors = await embedder.embed(batch);
    if (vectors.length !== batch.length) {
      throw new Error(
        `L'embedder ha restituito ${vectors.length} vettori per ${batch.length} testi.`,
      );
    }
    batch.forEach((text, i) => {
      const vector = vectors[i]!;
      if (vector.length !== embedder.dimensions) {
        throw new Error(
          `Vettore di dimensione ${vector.length}, attesa ${embedder.dimensions}.`,
        );
      }
      result.set(text, normalize(vector));
    });
    options.onProgress?.(Math.min(start + batch.length, unique.length), unique.length);
  }
  if (options.signal?.aborted) throw new CancelledError();
  return result;
}
