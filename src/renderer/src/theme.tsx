/**
 * Theme: dark (the original look), light, or `system` — which follows the OS.
 *
 * The palette itself lives in `index.css`; this file only decides *which* of the
 * two blocks applies, by writing a concrete value onto `<html data-theme>`. CSS
 * therefore never sees `system`, so no media query has to be repeated per token,
 * and `color-scheme` follows along for the widgets the browser draws itself
 * (scrollbars, `<select>` popups, form controls).
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
import { call } from './lib/ipc'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEMES: ThemePreference[] = ['system', 'light', 'dark']

const STORAGE_KEY = 'locabase.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function detectTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'system' || saved === 'light' || saved === 'dark') return saved
  } catch {
    // when localStorage is blocked the preference just isn't remembered
  }
  return 'system'
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches === false ? 'light' : 'dark'
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref
}

function apply(theme: ResolvedTheme): void {
  document.documentElement.dataset['theme'] = theme
}

/**
 * Runs at module load — before React's first render — so the window never
 * flashes the wrong palette. The `<head>` script this is usually done with is
 * out of the question here: the CSP allows no inline script.
 */
apply(resolve(detectTheme()))

interface ThemeContextValue {
  /** What the user picked — may be `system`. */
  theme: ThemePreference
  /** What is actually on screen right now. */
  resolved: ResolvedTheme
  setTheme: (t: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [theme, setThemeState] = useState<ThemePreference>(detectTheme)
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme)

  // The OS switch (macOS auto appearance, say) has to move the app while it is
  // open, not only at the next launch.
  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY)
    if (!mq) return
    const onChange = (): void => setSystem(systemTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = theme === 'system' ? system : theme

  useEffect(() => {
    apply(resolved)
    // The main process keeps the native chrome in step and stores the choice
    // for the next launch's first frame.
    void call('system:setTheme', { theme }).catch(() => undefined)
  }, [resolved, theme])

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // unsaved is fine — the choice still holds for this session
    }
  }, [])

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme: called outside <ThemeProvider>')
  return ctx
}
