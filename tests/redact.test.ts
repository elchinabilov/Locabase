import { describe, expect, it } from 'vitest'
import { redact } from '../src/main/core/log.js'

describe('redact', () => {
  it('service_role JWT-ni gizlədir', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.EGIM96RAZx35lJzdJsyH'
    const out = redact(`SERVICE_ROLE_KEY: ${jwt}`)
    expect(out).not.toContain(jwt)
    expect(out).toContain('«gizlədilib»')
  })

  it('sb_secret_ və sbp_ açarlarını gizlədir', () => {
    expect(redact('key sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz here')).not.toContain('N7UND0Ug')
    expect(redact('token sbp_0123456789abcdef0123456789abcdef')).not.toContain('0123456789abcdef')
  })

  it('KEY=value formasında dəyəri gizlədir, açar adını saxlayır', () => {
    const out = redact('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=GOCSPX-real-secret-value')
    expect(out).toContain('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=')
    expect(out).not.toContain('GOCSPX-real-secret-value')
  })

  it('dırnaqlı dəyəri də tutur', () => {
    const out = redact('password: "hunter2-uzun-parol"')
    expect(out).not.toContain('hunter2')
  })

  it('postgres URL-indəki parolu gizlədir', () => {
    const out = redact('postgresql://postgres:sirr123@db.example.com:5432/postgres')
    expect(out).not.toContain('sirr123')
  })

  it('adi mətnə toxunmur', () => {
    const text = 'Started supabase local development setup on port 54321'
    expect(redact(text)).toBe(text)
  })
})
