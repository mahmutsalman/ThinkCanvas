import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { CodeNodeType, RecallStats } from './CodeNode'

type MonacoEditor = Parameters<OnMount>[0]
type Monaco = Parameters<OnMount>[1]
type DecorationsCollection = ReturnType<MonacoEditor['createDecorationsCollection']>

// Accuracy at/above which a finished round extends the streak.
const STREAK_THRESHOLD = 0.9

// Shared Monaco options for both the attempt editor and the read-only peek
// layer — mirrors CodeNode's editor so the snippet looks the same.
const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  lineNumbers: 'on' as const,
  lineNumbersMinChars: 2,
  folding: false,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'none' as const,
  overviewRulerLanes: 0,
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }
}

// Levenshtein edit distance — used to score a recall attempt against the
// original. Snippets are small, so the O(n·m) table is fine.
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

function accuracyOf(attempt: string, target: string): number {
  const max = Math.max(attempt.length, target.length, 1)
  return Math.max(0, Math.min(1, 1 - levenshtein(attempt, target) / max))
}

function starsFor(acc: number): number {
  if (acc >= 0.98) return 5
  if (acc >= 0.9) return 4
  if (acc >= 0.75) return 3
  if (acc >= 0.5) return 2
  return 1
}

function fmtTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

// Strip comments so Recall Mode tests ONLY the code: block comments, full-line
// comments, and trailing line comments are removed, and resulting blank lines
// are dropped. Naive (doesn't parse strings), which is fine for study snippets —
// the `://` guard keeps URLs in strings from being mangled in the common case.
function lineCommentToken(language: string): string {
  if (language === 'python') return '#'
  if (language === 'sql') return '--'
  return '//' // java, c, cpp, javascript, typescript, rust, go, json, …
}

function stripComments(code: string, language: string): string {
  // Block comments /* … */ (C-family).
  let src = code
  if (language !== 'python' && language !== 'sql') {
    src = src.replace(/\/\*[\s\S]*?\*\//g, '')
  }
  const token = lineCommentToken(language)
  const trailing =
    token === '//' ? /(?<!:)\/\/.*$/ : token === '#' ? /#.*$/ : /--.*$/
  return src
    .split('\n')
    .map((line) => line.replace(trailing, '').replace(/\s+$/, ''))
    .filter((line) => line.trim().length > 0)
    .join('\n')
}

type Score = { acc: number; ms: number; stars: number; streak: number }

type Props = {
  node: CodeNodeType
  onClose: () => void
  onSaveStats: (id: string, stats: RecallStats) => void
}

export default function RecallMode({ node, onClose, onSaveStats }: Props): JSX.Element {
  const language = node.data.language ?? 'plaintext'
  // The recall target is the code WITHOUT comments — you memorize code, not prose.
  const original = stripComments(node.data.code ?? '', language)
  const title = node.data.title?.trim() || node.data.language || 'snippet'
  const prev = node.data.recall

  const [peeking, setPeeking] = useState(false)
  const [score, setScore] = useState<Score | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const editorRef = useRef<MonacoEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const decoRef = useRef<DecorationsCollection | null>(null)
  const startRef = useRef<number>(Date.now())
  // Latest attempt text, mirrored so close/finish can read it without a render.
  const attemptRef = useRef<string>(prev?.attempt ?? '')

  // Recompute per-character correctness against the original (typing-test style:
  // line i, column j of the attempt vs the same position in the original) and
  // paint matched/mismatched runs via Monaco inline decorations.
  const applyDiff = useCallback(
    (text: string) => {
      const ed = editorRef.current
      const monaco = monacoRef.current
      const deco = decoRef.current
      if (!ed || !monaco || !deco) return
      const aLines = text.split('\n')
      const tLines = original.split('\n')
      const decos: Array<Parameters<DecorationsCollection['set']>[0][number]> = []
      for (let i = 0; i < aLines.length; i++) {
        const aL = aLines[i]
        const tL = tLines[i] ?? ''
        let j = 0
        while (j < aL.length) {
          const match = j < tL.length && aL[j] === tL[j]
          let k = j + 1
          while (k < aL.length && (k < tL.length && aL[k] === tL[k]) === match) k++
          decos.push({
            range: new monaco.Range(i + 1, j + 1, i + 1, k + 1),
            options: { inlineClassName: match ? 'tc-recall-ok' : 'tc-recall-bad' }
          })
          j = k
        }
      }
      deco.set(decos)
    },
    [original]
  )

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed
    monacoRef.current = monaco
    // Monaco keeps models alive globally by path; on a remount the model may
    // still hold stale text, so seed it from the persisted attempt explicitly.
    const seed = prev?.attempt ?? ''
    if (ed.getValue() !== seed) ed.setValue(seed)
    decoRef.current = ed.createDecorationsCollection([])
    ed.focus()
    applyDiff(ed.getValue())
  }

  const handleChange = (value: string | undefined): void => {
    const text = value ?? ''
    attemptRef.current = text
    applyDiff(text)
  }

  // Running timer (display only); the authoritative time is computed at finish.
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 250)
    return () => clearInterval(t)
  }, [])

  const finishRound = useCallback(() => {
    if (score) return // already graded this round
    const text = editorRef.current?.getValue() ?? attemptRef.current
    const acc = accuracyOf(text, original)
    const ms = Date.now() - startRef.current
    const streak = acc >= STREAK_THRESHOLD ? (prev?.streak ?? 0) + 1 : 0
    setScore({ acc, ms, stars: starsFor(acc), streak })
    onSaveStats(node.id, {
      attempt: text,
      bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, acc),
      timesPracticed: (prev?.timesPracticed ?? 0) + 1,
      streak
    })
  }, [score, original, prev, node.id, onSaveStats])

  const retry = useCallback(() => {
    setScore(null)
    startRef.current = Date.now()
    setElapsed(0)
    attemptRef.current = ''
    const ed = editorRef.current
    if (ed) {
      ed.setValue('')
      applyDiff('')
      ed.focus()
    }
  }, [applyDiff])

  // Persist the in-progress attempt on exit (without counting a round), so the
  // next Recall session resumes exactly where this one left off.
  const handleClose = useCallback(() => {
    const text = editorRef.current?.getValue()
    if (text !== undefined && text !== (prev?.attempt ?? '')) {
      onSaveStats(node.id, {
        attempt: text,
        bestAccuracy: prev?.bestAccuracy ?? 0,
        timesPracticed: prev?.timesPracticed ?? 0,
        streak: prev?.streak ?? 0
      })
    }
    onClose()
  }, [prev, node.id, onSaveStats, onClose])

  // Global key handling (capture phase, so it beats Monaco's own bindings):
  //   • Hold Tab → peek at the original; release → back to the attempt.
  //   • Esc → exit (saving the attempt).
  //   • Cmd/Ctrl+Enter → grade the round.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        setPeeking(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        handleClose()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.stopPropagation()
        finishRound()
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        setPeeking(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [handleClose, finishRound])

  return (
    <div className="tc-recall" role="dialog" aria-modal="true">
      <div className={`tc-recall__card ${peeking ? 'is-peeking' : ''}`}>
        <div className="tc-recall__head">
          <span className="tc-recall__badge">RECALL</span>
          <span className="tc-recall__title">{title}</span>
          <span className="tc-recall__spacer" />
          {(prev?.streak ?? 0) > 0 && !score && (
            <span className="tc-recall__streak" title="Current streak">
              🔥 ×{prev?.streak}
            </span>
          )}
          <span className="tc-recall__timer">{fmtTime(elapsed)}</span>
          <button className="tc-recall__btn" onClick={finishRound} title="Grade this round (⌘↵)">
            Done ✓
          </button>
          <button className="tc-recall__btn ghost" onClick={handleClose} title="Exit (Esc)">
            ✕
          </button>
        </div>

        <div className="tc-recall__editors">
          {/* Type-from-memory editor (the only thing you interact with). */}
          <div className="tc-recall__attempt">
            <Editor
              path={`recall-attempt-${node.id}`}
              language={language}
              defaultValue={prev?.attempt ?? ''}
              theme="vs-dark"
              onMount={handleMount}
              onChange={handleChange}
              options={EDITOR_OPTIONS}
            />
          </div>
          {/* Spotlit original — fades in only while Tab is held. */}
          <div className="tc-recall__peek" aria-hidden={!peeking}>
            <Editor
              path={`recall-original-${node.id}`}
              language={language}
              value={original}
              theme="vs-dark"
              options={{ ...EDITOR_OPTIONS, readOnly: true, domReadOnly: true }}
            />
          </div>
        </div>

        <div className="tc-recall__hint">
          Hold <kbd>Tab</kbd> to peek · <kbd>⌘</kbd>+<kbd>↵</kbd> to grade · <kbd>Esc</kbd> to exit
        </div>

        {score && (
          <div className="tc-recall__scorecard">
            <div className="tc-recall__scoretitle">ROUND COMPLETE</div>
            <div className="tc-recall__stars" aria-label={`${score.stars} of 5 stars`}>
              {'★'.repeat(score.stars)}
              <span className="tc-recall__stars-dim">{'★'.repeat(5 - score.stars)}</span>
            </div>
            <div className="tc-recall__stats">
              <div>
                <span className="tc-recall__stat-num">{Math.round(score.acc * 100)}%</span>
                <span className="tc-recall__stat-lbl">accuracy</span>
              </div>
              <div>
                <span className="tc-recall__stat-num">{fmtTime(score.ms)}</span>
                <span className="tc-recall__stat-lbl">time</span>
              </div>
              <div>
                <span className="tc-recall__stat-num">×{score.streak}</span>
                <span className="tc-recall__stat-lbl">streak</span>
              </div>
            </div>
            <div className="tc-recall__scoreactions">
              <button className="tc-recall__btn" onClick={retry}>
                Retry ↻
              </button>
              <button className="tc-recall__btn ghost" onClick={handleClose}>
                Exit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
