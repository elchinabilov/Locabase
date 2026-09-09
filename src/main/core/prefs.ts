/**
 * The interface preferences the **main** process also has to know about.
 *
 * The renderer keeps its own copy in `localStorage` — it must pick a palette
 * synchronously, before the first paint — and mirrors it here. Main reads this
 * to paint the window background *before* the page loads; without it a light
 * theme opens as a dark rectangle and flashes on the first frame.
 */
import Store from 'electron-store'

export type ThemePreference = 'system' | 'light' | 'dark'

interface PrefsShape {
  theme: ThemePreference
}

/** Window background per theme — the `--lb-bg` values from `index.css`. */
export const BACKGROUND: Record<'dark' | 'light', string> = {
  dark: '#0b0f14',
  light: '#f2f5f8'
}

/** Lazy for the same reason as the project registry: `app.setName()` runs first. */
let _store: Store<PrefsShape> | null = null
function store(): Store<PrefsShape> {
  _store ??= new Store<PrefsShape>({ name: 'prefs', defaults: { theme: 'system' } })
  return _store
}

export function theme(): ThemePreference {
  const v = store().get('theme')
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function setTheme(t: ThemePreference): void {
  store().set('theme', t)
}
