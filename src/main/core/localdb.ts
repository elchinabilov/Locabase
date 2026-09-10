/**
 * A direct connection to the local Postgres — used to read the migration ledger.
 * Rather than parsing the CLI's `migration list` output we read the table
 * ourselves: the result always has a fixed shape, independent of the CLI's text
 * format.
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { parse as parseToml } from 'smol-toml'
import type { Project } from '@shared/types/index.js'
import { paths } from './projects.js'

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

/** Read the ledger rows. Returns `null` if the database is down (never throws). */
export async function readLedger(project: Project): Promise<LedgerRow[] | null> {
  const client = new Client({
    connectionString: connectionString(project),
    connectionTimeoutMillis: 4000
  })
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
