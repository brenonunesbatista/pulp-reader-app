/** User text → FTS5 query: every token is a prefix phrase ("wells tim" → `"wells"* "tim"*`, implicit AND).
 *  FTS syntax characters are stripped so user input can never produce a query error. */
export function ftsQuery(input: string, columns?: string[]): string | null {
  const toks = input.toLowerCase().replace(/["*^:(){}+-]/g, ' ').split(/\s+/).filter(Boolean)
  if (!toks.length) return null
  const expr = toks.map((t) => `"${t}"*`).join(' ')
  return columns?.length ? `{${columns.join(' ')}} : (${expr})` : expr
}
