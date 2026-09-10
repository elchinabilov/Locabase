/**
 * Typography settings: the interface font and the SQL editor's font.
 *
 * Same shape as `theme.tsx` — the values live in `index.css` as variables, and
 * this only overwrites them on `<html>`. `--lb-text-unit` is the one that
 * carries the whole text ladder (see `--text-*` in `index.css`), so a size
 * change is a single variable write rather than a hundred class changes.
 *
 * No font is bundled and the CSP blocks remote stylesheets, so every choice
 * here is a font the machine already has. That is why each option keeps the
 * original stack as its tail, and why `available()` exists: an option the
 * machine cannot render is worth saying out loud rather than silently ignoring.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

/* --------------------------------------------------------------- choices */

/** The tail every sans choice falls back to — never leaves the app font-less. */
const SANS_TAIL = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
const MONO_TAIL = 'Menlo, Consolas, monospace'

export interface FontOption {
  id: string
  label: string
  /** The full `font-family` value. */
  stack: string
  /** The family to probe for availability; `null` = always available. */
  probe: string | null
}

export const SANS_FONTS: FontOption[] = [
  { id: 'system', label: 'System', stack: SANS_TAIL, probe: null },
  { id: 'inter', label: 'Inter', stack: `'Inter', ${SANS_TAIL}`, probe: 'Inter' },
  {
    id: 'plex',
    label: 'IBM Plex Sans',
    stack: `'IBM Plex Sans', ${SANS_TAIL}`,
    probe: 'IBM Plex Sans'
  },
  {
    id: 'helvetica',
    label: 'Helvetica',
    stack: `'Helvetica Neue', Helvetica, Arial, ${SANS_TAIL}`,
    probe: 'Helvetica Neue'
  }
]

export const MONO_FONTS: FontOption[] = [
  { id: 'system', label: 'System', stack: `'SF Mono', ${MONO_TAIL}`, probe: null },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    stack: `'JetBrains Mono', ${MONO_TAIL}`,
    probe: 'JetBrains Mono'
  },
  { id: 'fira', label: 'Fira Code', stack: `'Fira Code', ${MONO_TAIL}`, probe: 'Fira Code' },
  {
    id: 'plex',
    label: 'IBM Plex Mono',
    stack: `'IBM Plex Mono', ${MONO_TAIL}`,
    probe: 'IBM Plex Mono'
  },
  { id: 'menlo', label: 'Menlo', stack: `Menlo, ${MONO_TAIL}`, probe: 'Menlo' }
]

/**
 * Interface text size. The number multiplies `--lb-text-unit`, so 1.1 makes
 * every step of the ladder 10% bigger. The range stops at 1.15: past that the
 * text starts to outgrow the row heights it sits in.
 */
export const TEXT_SCALES = [
  { id: 'small', scale: 0.92 },
  { id: 'default', scale: 1 },
  { id: 'large', scale: 1.08 },
  { id: 'larger', scale: 1.15 }
] as const

export type TextScaleId = (typeof TEXT_SCALES)[number]['id']

/** SQL editor size in px — an absolute value, not a multiplier. */
export const EDITOR_SIZES = [11, 12.5, 14, 16] as const

export interface FontSettings {
  sans: string
  mono: string
  textScale: TextScaleId
  editorSize: number
}

const DEFAULTS: FontSettings = {
  sans: 'inter',
  mono: 'system',
  textScale: 'default',
  editorSize: 12.5
}

const STORAGE_KEY = 'locabase.fonts'

/* ------------------------------------------------------------ persistence */

function detectFonts(): FontSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<FontSettings>
    return {
      // An id that no longer exists (a renamed option, a hand-edited value)
      // falls back rather than leaving the app with no font at all.
      sans: SANS_FONTS.some((f) => f.id === saved.sans) ? saved.sans! : DEFAULTS.sans,
      mono: MONO_FONTS.some((f) => f.id === saved.mono) ? saved.mono! : DEFAULTS.mono,
      textScale: TEXT_SCALES.some((s) => s.id === saved.textScale)
        ? saved.textScale!
        : DEFAULTS.textScale,
      editorSize: EDITOR_SIZES.includes(saved.editorSize as (typeof EDITOR_SIZES)[number])
        ? saved.editorSize!
        : DEFAULTS.editorSize
    }
  } catch {
    // unreadable or blocked storage — the defaults are always a valid answer
    return DEFAULTS
  }
}

function apply(s: FontSettings): void {
  const root = document.documentElement.style
  root.setProperty('--lb-font-sans', SANS_FONTS.find((f) => f.id === s.sans)!.stack)
  root.setProperty('--lb-font-mono', MONO_FONTS.find((f) => f.id === s.mono)!.stack)
  root.setProperty('--lb-text-unit', `${TEXT_SCALES.find((t) => t.id === s.textScale)!.scale}px`)
  root.setProperty('--lb-editor-size', `${s.editorSize}px`)
}

/** Applied at module load, for the same reason as the theme: no first-paint flash. */
apply(detectFonts())

/**
 * Is this family actually installed? `document.fonts.check` compares against the
 * fallback, so a missing family reports `false` — which is exactly the signal
 * the picker wants. Options with no `probe` are the built-in stacks.
 */
export function available(option: FontOption): boolean {
  if (!option.probe) return true
  try {
    return document.fonts.check(`12px "${option.probe}"`)
  } catch {
    return true // no Font Loading API — better to offer it than to hide it
  }
}

/* ---------------------------------------------------------------- context */

interface FontContextValue extends FontSettings {
  set: (patch: Partial<FontSettings>) => void
  reset: () => void
}

const FontContext = createContext<FontContextValue | null>(null)

export function FontProvider({ children }: { children: ReactNode }): ReactNode {
  const [settings, setSettings] = useState<FontSettings>(detectFonts)

  useEffect(() => {
    apply(settings)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // unsaved is fine — the choice still holds for this session
    }
  }, [settings])

  const set = useCallback((patch: Partial<FontSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const reset = useCallback(() => setSettings(DEFAULTS), [])

  const value = useMemo(() => ({ ...settings, set, reset }), [settings, set, reset])
  return <FontContext.Provider value={value}>{children}</FontContext.Provider>
}

export function useFonts(): FontContextValue {
  const ctx = useContext(FontContext)
  if (!ctx) throw new Error('useFonts: called outside <FontProvider>')
  return ctx
}
