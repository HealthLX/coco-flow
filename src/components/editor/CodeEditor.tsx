import { useEffect, useRef } from 'react'
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  type DecorationSet,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { xml } from '@codemirror/lang-xml'
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { useTheme } from '../../context/ThemeContext'

export interface EditorIssue {
  message: string
  /** 1-based, as lxml reports it. Null pins the marker to line 1. */
  line?: number | null
  path?: string | null
  severity?: 'error' | 'warning' | 'info'
}

/** Built from the CSS tokens, so the editor changes with the app theme rather than fighting it. */
function cocoTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        fontSize: '12px',
        backgroundColor: 'rgb(var(--surface))',
        color: 'rgb(var(--fg-body))',
        height: '100%',
      },
      '.cm-content': {
        fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
        padding: '8px 0',
      },
      '.cm-gutters': {
        backgroundColor: 'rgb(var(--surface-2))',
        color: 'rgb(var(--fg-subtle))',
        border: 'none',
        borderRight: '1px solid rgb(var(--border))',
      },
      '.cm-activeLine': { backgroundColor: 'rgb(var(--accent) / 0.05)' },
      '.cm-activeLineGutter': { backgroundColor: 'rgb(var(--surface-3))' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgb(var(--accent) / 0.18)',
      },
      '.cm-cursor': { borderLeftColor: 'rgb(var(--accent))' },
      '&.cm-focused': { outline: 'none' },
      '.cm-lintRange-error': {
        backgroundImage: 'none',
        backgroundColor: 'rgb(var(--err) / 0.16)',
        borderBottom: '2px solid rgb(var(--err))',
      },
      '.cm-scroller': { overflow: 'auto' },
    },
    { dark },
  )
}

export interface Highlight {
  from: number
  to: number
  /** Styled by the caller via .cm-link-* classes in index.css. */
  className: string
}

const setHighlights = StateEffect.define<Highlight[]>()

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlights)) {
        return Decoration.set(
          effect.value
            .filter((h) => h.to > h.from)
            .map((h) => Decoration.mark({ class: h.className }).range(h.from, h.to)),
          true,
        )
      }
    }
    return tr.docChanged ? deco.map(tr.changes) : deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

function toDiagnostics(state: EditorState, issues: EditorIssue[]): Diagnostic[] {
  return issues.map((issue) => {
    const lineNo = Math.min(Math.max(issue.line ?? 1, 1), state.doc.lines)
    const line = state.doc.line(lineNo)
    return {
      from: line.from,
      to: line.to,
      severity: issue.severity ?? 'error',
      message: issue.path ? `${issue.path}\n${issue.message}` : issue.message,
    }
  })
}

export default function CodeEditor({
  value,
  onChange,
  issues = [],
  highlights,
  scrollTo,
  onHoverOffset,
  onClickOffset,
  readOnly = false,
  dark,
  className,
}: {
  value: string
  onChange?: (value: string) => void
  issues?: EditorIssue[]
  highlights?: Highlight[]
  /**
   * Force the editor's base theme. The colours come from CSS custom properties and so follow
   * whatever `.dark` subtree the editor sits in, but CodeMirror needs the flag told to it —
   * on /flow that's always dark, regardless of the app theme.
   */
  dark?: boolean
  /** Character offset to bring into view — used to follow a link across the split. */
  scrollTo?: number | null
  /** Fires with the offset under the cursor, or null when it leaves the text. */
  onHoverOffset?: (offset: number | null) => void
  onClickOffset?: (offset: number | null) => void
  readOnly?: boolean
  className?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const { theme } = useTheme()
  const isDark = dark ?? theme === 'dark'

  // Callbacks are read through refs so a new closure each render doesn't rebuild the editor
  // (which would drop the cursor and scroll position on every keystroke).
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onHoverRef = useRef(onHoverOffset)
  onHoverRef.current = onHoverOffset
  const onClickRef = useRef(onClickOffset)
  onClickRef.current = onClickOffset

  useEffect(() => {
    if (!host.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        foldGutter(),
        history(),
        bracketMatching(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
        xml(),
        lintGutter(),
        highlightField,
        cocoTheme(isDark),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          mousemove: (event, v) => {
            if (!onHoverRef.current) return false
            onHoverRef.current(v.posAtCoords({ x: event.clientX, y: event.clientY }) ?? null)
            return false
          },
          mouseleave: () => {
            onHoverRef.current?.(null)
            return false
          },
          mousedown: (event, v) => {
            if (!onClickRef.current) return false
            onClickRef.current(v.posAtCoords({ x: event.clientX, y: event.clientY }) ?? null)
            return false
          },
        }),
      ],
    })

    const v = new EditorView({ state, parent: host.current })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // Rebuilt only when the theme or read-only flag changes — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, readOnly])

  // Push external changes in (e.g. a regenerate) without clobbering in-progress typing.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const current = v.state.doc.toString()
    if (current === value) return
    v.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  useEffect(() => {
    const v = view.current
    if (!v) return
    v.dispatch(setDiagnostics(v.state, toDiagnostics(v.state, issues)))
  }, [issues])

  useEffect(() => {
    const v = view.current
    if (!v || !highlights) return
    const len = v.state.doc.length
    v.dispatch({
      effects: setHighlights.of(
        highlights.filter((h) => h.from >= 0 && h.to <= len).sort((a, b) => a.from - b.from),
      ),
    })
  }, [highlights])

  useEffect(() => {
    const v = view.current
    if (!v || scrollTo == null) return
    const pos = Math.min(Math.max(scrollTo, 0), v.state.doc.length)
    v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
  }, [scrollTo])

  return <div ref={host} className={className} />
}
