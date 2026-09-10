/**
 * The shell text sent to a self-hosted server, and the wire format it answers
 * in. Kept apart from the adapter because it is pure: no ssh, no filesystem,
 * nothing to mock — which is why `tests/selfhosted.test.ts` can run the
 * generated scripts through a real `bash` and check the result.
 *
 * THE RULE: everything interpolated into a script is quoted with `sq()`. A value
 * that cannot be quoted because it is a bare shell token — `find -mtime +N` — is
 * proved to be a number first.
 */
import type { RemoteFile } from '@shared/types/index.js'
import { MAX_FILE_BYTES } from '../filetree.js'

/** A string that is safe to paste into a remote shell. */
export function sq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * `-mtime +N` is a bare shell token, so it cannot be quoted like a value — the
 * only safe form is to guarantee it really is a number before it is pasted.
 * The field is typed `number`, but it arrives from the renderer through the
 * project registry, and a type is not a runtime check.
 */
export function retentionDays(value: number): number {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 14
}

/** `supabase-edge-functions-abc123` + `abc123` → `edge-functions` */
export function serviceKeyOf(container: string, suffix: string): string {
  let key = container
  if (key.endsWith(`-${suffix}`)) key = key.slice(0, -(suffix.length + 1))
  return key.replace(/^supabase[-_]/, '') || container
}

/** `Up 2 hours (healthy)` → `healthy` */
export function parseHealth(status: string): string | null {
  const m = /\((healthy|unhealthy|health: starting|starting)\)/i.exec(status)
  return m ? m[1]!.toLowerCase().replace('health: ', '') : null
}

/**
 * A bash script that merges the remote `.env` with `KEY=value` lines coming from
 * stdin: a key that already exists is replaced, everything else stays as it is,
 * and the result is moved into place atomically with 0600 permissions.
 *
 * Lines are joined with `\n` — joining with `;` would make `while … do;` a syntax error.
 */
export function envMergeScript(file: string): string {
  return [
    'set -e',
    'T="$(mktemp)"',
    'trap \'rm -f "$T" "$T.old"\' EXIT',
    'cat > "$T"',
    `TARGET=${sq(file)}`,
    'touch "$TARGET"',
    'cp "$TARGET" "$T.old"',
    'while IFS= read -r line; do',
    '  [ -z "$line" ] && continue',
    '  K="${line%%=*}"',
    '  grep -v "^${K}=" "$T.old" > "$T.new" || true',
    '  mv "$T.new" "$T.old"',
    'done < "$T"',
    'cat "$T" >> "$T.old"',
    'chmod 600 "$T.old"',
    'mv "$T.old" "$TARGET"',
    'echo updated'
  ].join('\n')
}

/**
 * A bash script that streams every file in a folder as a `<token><path>` header
 * plus base64 content. For a large file a `<token>!` marker is sent instead of the
 * content — so the file stays in the listing and isn't reported as "local only".
 */
export function dumpScript(dir: string, token: string): string {
  return [
    `cd ${sq(dir)}`,
    // dot-prefixed files are skipped — the local tree ignores them too
    `find . -type f -not -path '*/.*' | sort | while IFS= read -r f; do`,
    `  printf '%s%s\\n' ${sq(token)} "\${f#./}"`,
    `  if [ "$(wc -c < "$f")" -le ${MAX_FILE_BYTES} ]; then`,
    '    base64 < "$f"',
    '  else',
    `    printf '%s!\\n' ${sq(token)}`,
    '  fi',
    'done'
  ].join('\n')
}

/** `<token><path>` headers + base64 lines (or a `<token>!` marker) → files. */
export function decodeDump(out: string, token: string): RemoteFile[] {
  const files: RemoteFile[] = []
  let path: string | null = null
  let b64: string[] = []
  let skipped = false
  const flush = (): void => {
    if (path === null) return
    if (skipped) {
      files.push({ path, content: null, binary: true })
    } else {
      const buf = Buffer.from(b64.join(''), 'base64')
      const binary = buf.includes(0)
      files.push({ path, content: binary ? null : buf.toString('utf8'), binary })
    }
    path = null
    b64 = []
    skipped = false
  }
  for (const line of out.split('\n')) {
    if (line.startsWith(token)) {
      const rest = line.slice(token.length).trim()
      if (rest === '!') {
        skipped = true
        continue
      }
      flush()
      path = rest
      continue
    }
    if (path !== null) b64.push(line.trim())
  }
  flush()
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
