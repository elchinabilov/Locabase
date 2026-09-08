/**
 * Postgres identifiers. Every schema/table/column name that reaches SQL text
 * goes through here and ONLY here.
 *
 * THE RULE: only names that came from introspection and were checked against the
 * column list are pasted into SQL text. NEVER USER VALUES — those always travel
 * `$n` parametridir (bax: `build.ts`).
 */

export function quoteIdent(name: string): string {
  if (name.length === 0) throw new Error('Empty identifier')
  if (name.includes('\0')) throw new Error('An identifier cannot contain a NUL byte')
  return `"${name.replaceAll('"', '""')}"`
}

/** `public.users` → `"public"."users"` */
export function qualify(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

/**
 * A SQL string literal. For the REMOTE transports only: neither the Management
 * API's `database/query` endpoint nor `psql` over stdin can bind `$n` parameters
 * — so there the value has to be pasted into the SQL text.
 *
 * NOT USED on the local path: there a `$n` parameter is always sent instead.
 *
 * `standard_conforming_strings` (on by default since PG 9.1) is assumed — a
 * single quote is doubled and a backslash is an ordinary character.
 */
export function quoteLiteral(value: string | null): string {
  if (value === null) return 'null'
  if (value.includes('\0')) throw new Error('A value cannot contain a NUL byte')
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Substitute literals for `$1`, `$2`, …
 *
 * Applied ONLY to text we build ourselves (`build.ts` fragments and introspection
 * queries) — SQL written by the user never passes through here, so a `$1` inside
 * a string can never be replaced by accident.
 */
export function inlineParams(text: string, params: Array<string | null>): string {
  return text.replace(/\$(\d+)/g, (_m, n: string) => {
    const i = Number(n) - 1
    if (i < 0 || i >= params.length) throw new Error(`Parametr yoxdur: $${n}`)
    return quoteLiteral(params[i] ?? null)
  })
}
