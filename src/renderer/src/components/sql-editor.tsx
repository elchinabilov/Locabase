/**
 * CodeMirror 6 sarğısı — wrapper kitabxanası olmadan.
 *
 * View YALNIZ bir dəfə qurulur; dəyişən şeylər (⌘↵ callback-i, sxem ipucları,
 * xəta işarəsi) ref və `Compartment` vasitəsilə yenilənir — belədə kursor
 * yerində qalır və mətn atmır.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, highlightSpecialChars, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { tags as t } from '@lezer/highlight'
import type { DbCompletion } from '@shared/types'

/**
 * Tema `@codemirror/theme-one-dark`-dan DEYİL: o, öz sabit palitrasını gətirir
 * və `index.css`-dəki `@theme` tokenləri ilə toqquşur. CSS dəyişənləri birbaşa
 * oxunur ki, tema avtomatik sinxron qalsın.
 */
const theme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: '12.5px', height: '100%' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-content': { padding: '10px 0' },
    '.cm-gutters': {
      backgroundColor: 'var(--color-panel)',
      color: '#4a5b6c',
      border: 'none',
      borderRight: '1px solid var(--color-line)'
    },
    '.cm-activeLine': { backgroundColor: 'var(--color-panel-2)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--color-panel-2)', color: 'var(--color-muted)' },
    '.cm-cursor': { borderLeftColor: 'var(--color-accent)' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: '#1c6b4c66'
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--color-panel-2)',
      border: '1px solid var(--color-line)',
      borderRadius: '6px'
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--color-accent-dim)',
      color: 'var(--color-text)'
    },
    '.lb-sql-error': {
      textDecoration: 'underline wavy var(--color-danger)',
      textUnderlineOffset: '3px'
    }
  },
  { dark: true }
)

const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.keyword, color: 'var(--color-accent)' },
    { tag: [t.string, t.special(t.string)], color: 'var(--color-warn)' },
    { tag: [t.number, t.bool, t.null], color: 'var(--color-info)' },
    { tag: t.comment, color: 'var(--color-muted)', fontStyle: 'italic' },
    { tag: [t.typeName, t.function(t.variableName)], color: 'var(--color-info)' },
    { tag: t.operator, color: 'var(--color-muted)' },
    { tag: t.punctuation, color: 'var(--color-muted)' }
  ])
)

/* -------------------------------------------------------------- xəta işarəsi */

const setError = StateEffect.define<number | null>()

const errorMark = Decoration.mark({ class: 'lb-sql-error' })

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    // Mətn dəyişən kimi köhnə işarə silinir
    if (tr.docChanged) deco = Decoration.none
    for (const e of tr.effects) {
      if (!e.is(setError)) continue
      const pos = e.value
      if (pos === null || pos < 0 || pos > tr.state.doc.length) {
        deco = Decoration.none
        continue
      }
      // İşarə cari sözün sonuna qədər uzanır
      const line = tr.state.doc.lineAt(pos)
      const text = line.text.slice(pos - line.from)
      const wordLen = /^[\w".$]+/.exec(text)?.[0].length ?? 1
      deco = Decoration.set([errorMark.range(pos, Math.min(pos + wordLen, line.to))])
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f)
})

/* -------------------------------------------------------------- komponent */

export interface SqlEditorHandle {
  /** Cari mətn — React state-i yox, redaktorun özü həqiqi mənbədir. */
  read: () => string
  focusPosition: (pos: number) => void
}

export function SqlEditor({
  initialDoc,
  onRun,
  onChange,
  completion,
  errorPosition,
  handleRef
}: {
  initialDoc: string
  onRun: () => void
  onChange?: (doc: string) => void
  completion?: DbCompletion | null
  /** 0-əsaslı ofset; `null` = işarə yoxdur */
  errorPosition?: number | null
  handleRef?: (h: SqlEditorHandle | null) => void
}): ReactNode {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const schemaComp = useRef(new Compartment()).current

  // Callback-lər ref-dədir ki, view yenidən qurulmasın
  const runRef = useRef(onRun)
  runRef.current = onRun
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const handleRefRef = useRef(handleRef)
  handleRefRef.current = handleRef

  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          lineNumbers(),
          history(),
          highlightSpecialChars(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightSelectionMatches(),
          errorField,
          keymap.of([
            { key: 'Mod-Enter', preventDefault: true, run: () => (runRef.current(), true) },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...completionKeymap
          ]),
          schemaComp.of(sql({ dialect: PostgreSQL })),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changeRef.current?.(u.state.doc.toString())
          }),
          theme,
          highlight
        ]
      })
    })
    view.current = v
    handleRefRef.current?.({
      read: () => v.state.doc.toString(),
      focusPosition: (pos) => {
        const clamped = Math.max(0, Math.min(pos, v.state.doc.length))
        v.dispatch({ selection: { anchor: clamped }, scrollIntoView: true })
        v.focus()
      }
    })
    return () => {
      handleRefRef.current?.(null)
      v.destroy()
      view.current = null
    }
    // Qəsdən bir dəfəlik: sonrakı dəyişikliklər compartment/ref ilə gedir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sxem ipucları sonra gəlir — yenidən qurmaq yox, rekonfiqurasiya
  useEffect(() => {
    if (!view.current || !completion) return
    const schema: Record<string, string[]> = {}
    for (const t of completion.tables) {
      schema[`${t.schema}.${t.table}`] = t.columns
      // `public` üçün qısa ad da tamamlansın
      if (t.schema === 'public') schema[t.table] = t.columns
    }
    view.current.dispatch({
      effects: schemaComp.reconfigure(
        sql({ dialect: PostgreSQL, schema, defaultSchema: 'public' })
      )
    })
  }, [completion, schemaComp])

  useEffect(() => {
    view.current?.dispatch({ effects: setError.of(errorPosition ?? null) })
  }, [errorPosition])

  return <div ref={host} className="h-full overflow-hidden" />
}
