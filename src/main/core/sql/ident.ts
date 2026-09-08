/**
 * Postgres identifikatorları. Bütün sxem/cədvəl/sütun adları SQL mətninə
 * YALNIZ buradan keçir.
 *
 * QAYDA: SQL mətninə yalnız introspeksiyadan gələn və sütun siyahısına qarşı
 * yoxlanmış adlar yapışdırılır. İSTİFADƏÇİ DƏYƏRLƏRİ HEÇ VAXT — onlar həmişə
 * `$n` parametridir (bax: `build.ts`).
 */

export function quoteIdent(name: string): string {
  if (name.length === 0) throw new Error('Boş identifikator')
  if (name.includes('\0')) throw new Error('Identifikatorda NUL baytı ola bilməz')
  return `"${name.replaceAll('"', '""')}"`
}

/** `public.users` → `"public"."users"` */
export function qualify(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

/**
 * SQL sətir literalı. Yalnız REMOTE nəqliyyat üçün: nə Management API-nin
 * `database/query` endpoint-i, nə də `psql` stdin `$n` parametri bağlaya bilmir
 * — ona görə orada dəyər SQL mətninə yapışdırılmalı olur.
 *
 * Lokal yolda BU İSTİFADƏ EDİLMİR: orada həmişə `$n` parametri gedir.
 *
 * `standard_conforming_strings` (PG 9.1-dən default `on`) fərz olunur — tək
 * dırnaq ikiləndirilir, tərs xətt adi simvoldur.
 */
export function quoteLiteral(value: string | null): string {
  if (value === null) return 'null'
  if (value.includes('\0')) throw new Error('Dəyərdə NUL baytı ola bilməz')
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * `$1`, `$2`… yerinə literal qoy.
 *
 * Yalnız BİZİM qurduğumuz mətnlərə tətbiq olunur (`build.ts` fraqmentləri və
 * introspeksiya sorğuları) — istifadəçinin yazdığı SQL heç vaxt buradan
 * keçmir, ona görə mətn içindəki `$1`-in təsadüfən əvəzlənməsi mümkün deyil.
 */
export function inlineParams(text: string, params: Array<string | null>): string {
  return text.replace(/\$(\d+)/g, (_m, n: string) => {
    const i = Number(n) - 1
    if (i < 0 || i >= params.length) throw new Error(`Parametr yoxdur: $${n}`)
    return quoteLiteral(params[i] ?? null)
  })
}
