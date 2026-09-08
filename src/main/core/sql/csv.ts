/**
 * `psql --csv` çıxışının parseri (RFC 4180).
 *
 * Self-hosted mühitdə nəticələr SSH üzərindən `psql` ilə gəlir — orada nə `pg`
 * sürücüsü, nə də tip metadata-sı var. CSV seçilib, çünki dırnaqlama qaydası
 * dəyərin içindəki vergül, sətir keçidi və dırnağı itirmədən daşıyır.
 *
 * NULL ilə boş sətri ayırmaq üçün psql-ə `-P null=<sentinel>` verilir: CSV-də
 * ikisi də boş sahə kimi görünərdi.
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

  // Sonda sətir keçidi yoxdursa qalan sahəni bağla
  if (field.length > 0 || row.length > 0 || quoted) endRow()
  // psql çıxışı `\n` ilə bitir — sonuncu boş sətri at
  if (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last && last.length === 1 && last[0] === '') rows.pop()
  }
  return rows
}

/**
 * `psql -q --csv -P null=<token>` çıxışını sütun/sətir cütünə çevirir.
 * Nəticə qaytarmayan ifadə (DDL) boş çıxış verir → sütun yoxdur.
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
 * psql-in stderr mesajından `ERROR:` / `DETAIL:` / `HINT:` sətirlərini çıxarır.
 * Uzaq mühitdə `position` yoxdur — psql onu vermir, ona görə redaktorda
 * dalğalı işarə yalnız lokalda görünür.
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
  const message = pick('ERROR') ?? pick('FATAL') ?? output.trim().split('\n')[0] ?? 'psql xətası'
  // `LINE n: …` və caret sətri kontekst üçün faydalıdır
  const lineIdx = lines.findIndex((l) => /^LINE \d+:/.test(l.trim()))
  const context =
    lineIdx >= 0 ? lines.slice(lineIdx, lineIdx + 2).join('\n').trimEnd() : null
  return { message, detail: pick('DETAIL') ?? context, hint: pick('HINT') }
}
