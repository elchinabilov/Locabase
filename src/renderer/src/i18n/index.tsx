/**
 * Lightweight i18n: no external library, two static dictionaries (AZ/EN) and a
 * `t()` that reads them by dotted key. AZ is the source language — TypeScript
 * complains when a key is missing from `az.ts`, and when one is missing from
 * `en.ts` the AZ string is used so no gap goes unnoticed.
 */
import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import az from './locales/az.js'
import en from './locales/en.js'
import type { Dict, Keys } from './types.js'

export type Locale = 'az' | 'en'
export const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: 'az', label: 'Azərbaycan' },
  { id: 'en', label: 'English' }
]

const DICTS: Record<Locale, Dict> = { az, en: en }
const STORAGE_KEY = 'locabase.locale'

export type TranslationKey = Keys<typeof az>

function lookup(dict: Dict, key: string): string | undefined {
  let cur: Dict | string = dict
  for (const seg of key.split('.')) {
    if (typeof cur === 'string' || cur === undefined) return undefined
    cur = cur[seg] as Dict | string
  }
  return typeof cur === 'string' ? cur : undefined
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name]
    return v === undefined ? m : String(v)
  })
}

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'az' || saved === 'en') return saved
  } catch {
    // when localStorage is blocked (a private window and so on) we fall back to the default
  }
  return 'en'
}

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  /**
   * For dotted paths that come **from data** rather than from a static literal —
   * like the `config.toml` field keys, which cannot satisfy `t()`'s literal
   * `TranslationKey` requirement. `undefined` — the key exists in no language.
   */
  tDynamic: (key: string) => string | undefined
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // even unsaved, the language changes for this session — it just won't be remembered
    }
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const text = lookup(DICTS[locale], key) ?? lookup(DICTS.az, key) ?? key
      return interpolate(text, vars)
    },
    [locale]
  )

  const tDynamic = useCallback(
    (key: string): string | undefined => lookup(DICTS[locale], key) ?? lookup(DICTS.az, key),
    [locale]
  )

  // `lang` drives CSS `text-transform` casing, among other things: uppercasing
  // "title" under `lang="az"` yields "TİTLE", not "TITLE".
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(
    () => ({ locale, setLocale, t, tDynamic }),
    [locale, setLocale, t, tDynamic]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n: called outside <I18nProvider>')
  return ctx
}

/** The part used most often — just `t()`. */
export function useT(): I18nContextValue['t'] {
  return useI18n().t
}
