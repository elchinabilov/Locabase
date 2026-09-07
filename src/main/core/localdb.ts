/**
 * Lokal Postgres-ə birbaşa bağlantı — miqrasiya ledger-ini oxumaq üçün.
 * CLI-nin `migration list` çıxışını parse etməkdənsə cədvəli özümüz oxuyuruq:
 * nəticə həmişə eyni formadadır və CLI-nin mətn formatından asılı deyil.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { parse as parseToml } from 'smol-toml'
import { paths } from './projects.js'
import type { Project } from '@shared/types.js'

export interface LedgerRow {
  version: string
  name: string | null
}

export function connectionString(project: Project): string {
  const parsed = parseToml(readFileSync(paths.configToml(project), 'utf8')) as {
    db?: { port?: number }
  }
  const port = parsed.db?.port ?? 54322
  return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`
}

const LEDGER_SQL = `
  select version, name
  from supabase_migrations.schema_migrations
  order by version
`

/** Ledger sətirlərini oxu. Baza qalxmayıbsa `null` qaytarır (xəta atmır). */
export async function readLedger(project: Project): Promise<LedgerRow[] | null> {
  const client = new Client({ connectionString: connectionString(project), connectionTimeoutMillis: 4000 })
  try {
    await client.connect()
    const res = await client.query<LedgerRow>(LEDGER_SQL)
    return res.rows
  } catch {
    return null
  } finally {
    await client.end().catch(() => undefined)
  }
}
