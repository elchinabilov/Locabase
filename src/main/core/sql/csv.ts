/**
 * Parser for `psql --csv` output (RFC 4180).
 *
 * In a self-hosted environment results come back from `psql` over SSH — there is
 * no `pg` driver and no type metadata there. CSV is chosen because its quoting
 * rules carry commas, line breaks and quotes inside a value without losing them.
 *
 * To tell NULL apart from an empty string, psql is given `-P null=<sentinel>`:
 * in CSV both would otherwise look like an empty field.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let started = false

  const endField = (): void => {
    row.push(field)
    field = ''
    started = false
  }
  const endRow = (): void => {
    endField()
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"' && !started) {
      quoted = true
      started = true
      continue
    }
    if (ch === ',') {
      endField()
      continue
    }
    if (ch === '\r') continue
    if (ch === '\n') {
      endRow()
      continue
    }
    field += ch
    started = true
  }

  // if there is no trailing newline, close the remaining field
  if (field.length > 0 || row.length > 0 || quoted) endRow()
  // psql output ends with `\n` — drop the last empty row
  if (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last && last.length === 1 && last[0] === '') rows.pop()
  }
  return rows
}

/**
 * Turns `psql -q --csv -P null=<token>` output into a columns/rows pair.
 * A statement that returns nothing (DDL) produces empty output → no columns.
 */
export function parsePsqlCsv(
  output: string,
  nullToken: string
): { columns: string[]; rows: Array<Array<string | null>> } {
  const table = parseCsv(output)
  const head = table[0]
  if (!head) return { columns: [], rows: [] }
  return {
    columns: head,
    rows: table.slice(1).map((r) => r.map((v) => (v === nullToken ? null : v)))
  }
}

/**
 * Extracts the `ERROR:` / `DETAIL:` / `HINT:` lines from psql's stderr message.
 * There is no `position` on a remote environment — psql doesn't provide it, so
 * the squiggly marker in the editor only appears locally.
 */
export function parsePsqlError(output: string): {
  message: string
  detail: string | null
  hint: string | null
} {
  const lines = output.split('\n')
  const pick = (label: string): string | null => {
    const hit = lines.find((l) => l.includes(`${label}:`))
    if (!hit) return null
    return hit.slice(hit.indexOf(`${label}:`) + label.length + 1).trim() || null
  }
  const message = pick('ERROR') ?? pick('FATAL') ?? output.trim().split('\n')[0] ?? 'psql error'
  // the `LINE n: …` and caret lines are useful context
  const lineIdx = lines.findIndex((l) => /^LINE \d+:/.test(l.trim()))
  const context =
    lineIdx >= 0 ? lines.slice(lineIdx, lineIdx + 2).join('\n').trimEnd() : null
  return { message, detail: pick('DETAIL') ?? context, hint: pick('HINT') }
}
