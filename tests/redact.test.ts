import { describe, expect, it } from 'vitest'
import { redact } from '../src/main/core/log.js'

describe('redact', () => {
  it('hides a service_role JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.EGIM96RAZx35lJzdJsyH'
    const out = redact(`SERVICE_ROLE_KEY: ${jwt}`)
    expect(out).not.toContain(jwt)
    expect(out).toContain('«redacted»')
  })

  it('hides sb_secret_ and sbp_ keys', () => {
    expect(redact('key sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz here')).not.toContain('N7UND0Ug')
    expect(redact('token sbp_0123456789abcdef0123456789abcdef')).not.toContain('0123456789abcdef')
  })

  it('hides the value in KEY=value form and keeps the key name', () => {
    const out = redact('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=GOCSPX-real-secret-value')
    expect(out).toContain('SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=')
    expect(out).not.toContain('GOCSPX-real-secret-value')
  })

  it('catches a quoted value too', () => {
    const out = redact('password: "hunter2-uzun-parol"')
    expect(out).not.toContain('hunter2')
  })

  it('hides the password in a postgres URL', () => {
    const out = redact('postgresql://postgres:sirr123@db.example.com:5432/postgres')
    expect(out).not.toContain('sirr123')
  })

  it('leaves ordinary text alone', () => {
    const text = 'Started supabase local development setup on port 54321'
    expect(redact(text)).toBe(text)
  })
})
