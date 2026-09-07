export interface DiffLine {
  kind: 'same' | 'add' | 'del' | 'gap'
  text: string
  a: number | null
  b: number | null
}

/**
 * Sadə LCS-siz sətir diff-i: yamaqlayıcı yalnız nöqtəvi dəyişikliklər etdiyinə
 * görə sətirləri sıra ilə tutuşdurmaq kifayətdir. Uzunluq fərqi olduqda
 * əlavə/silinmə blokları ayrıca göstərilir.
 */
export function diffLines(before: string, after: string, context = 2): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const raw: DiffLine[] = []

  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const av = a[i]
    const bv = b[j]
    if (av !== undefined && bv !== undefined && av === bv) {
      raw.push({ kind: 'same', text: av, a: i + 1, b: j + 1 })
      i++
      j++
      continue
    }
    // növbəti uyğunluğu axtar — kiçik pəncərə ilə
    const ahead = 40
    let matched = false
    for (let k = 1; k <= ahead && !matched; k++) {
      if (bv !== undefined && a[i + k] !== undefined && a[i + k] === bv) {
        for (let d = 0; d < k; d++) raw.push({ kind: 'del', text: a[i + d]!, a: i + d + 1, b: null })
        i += k
        matched = true
      } else if (av !== undefined && b[j + k] !== undefined && b[j + k] === av) {
        for (let d = 0; d < k; d++) raw.push({ kind: 'add', text: b[j + d]!, a: null, b: j + d + 1 })
        j += k
        matched = true
      }
    }
    if (matched) continue
    if (av !== undefined) {
      raw.push({ kind: 'del', text: av, a: i + 1, b: null })
      i++
    }
    if (bv !== undefined) {
      raw.push({ kind: 'add', text: bv, a: null, b: j + 1 })
      j++
    }
  }

  // yalnız dəyişikliklərin ətrafını saxla
  const keep = new Set<number>()
  raw.forEach((line, idx) => {
    if (line.kind === 'same') return
    for (let k = idx - context; k <= idx + context; k++) if (k >= 0 && k < raw.length) keep.add(k)
  })
  if (keep.size === 0) return []

  const out: DiffLine[] = []
  let gap = false
  raw.forEach((line, idx) => {
    if (keep.has(idx)) {
      out.push(line)
      gap = false
    } else if (!gap) {
      out.push({ kind: 'gap', text: '⋯', a: null, b: null })
      gap = true
    }
  })
  return out
}
