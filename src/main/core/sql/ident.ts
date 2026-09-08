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
