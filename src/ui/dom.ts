/** Crea un elemento. Il testo è sempre inserito come testo, mai come HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/** Percentuale con la virgola, es. 0.917 → "91,7%". */
export function percent(value: number): string {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}
