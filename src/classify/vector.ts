/** Operazioni su vettori. Tutti i vettori di embedding sono normalizzati (lunghezza 1). */

export function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vettori di dimensioni diverse (${a.length} e ${b.length}).`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/** Per vettori normalizzati il prodotto scalare coincide con la similarità del coseno. */
export const similarity = dot;

export function normalize(v: Float32Array): Float32Array {
  const norm = Math.sqrt(dot(v, v));
  const out = new Float32Array(v.length);
  if (norm === 0) return out;
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / norm;
  return out;
}

/** Media di più vettori, poi normalizzata. */
export function meanVector(vectors: Float32Array[]): Float32Array {
  const first = vectors[0];
  if (!first) throw new Error("Nessun vettore da mediare.");
  const sum = new Float32Array(first.length);
  for (const v of vectors) {
    if (v.length !== sum.length) throw new Error("Vettori di dimensioni diverse.");
    for (let i = 0; i < v.length; i++) sum[i] = sum[i]! + v[i]!;
  }
  return normalize(sum);
}

/** Media dei k valori più grandi (o di tutti, se sono meno di k). */
export function topKMean(values: number[], k: number): number {
  if (values.length === 0) throw new Error("Nessun valore.");
  const sorted = [...values].sort((a, b) => b - a).slice(0, Math.max(1, k));
  return sorted.reduce((acc, v) => acc + v, 0) / sorted.length;
}
