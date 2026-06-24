import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import {
  Handle,
  Position,
  NodeResizer,
  useReactFlow,
  type NodeProps,
  type Node
} from '@xyflow/react'
import { registerEditor, unregisterEditor } from '../lib/codeEditors'
import { RUNNABLE, clearRun, runCode, stopRun, useRunState } from '../lib/runStore'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5

export type CursorPos = { lineNumber: number; column: number }

// Per-note memorization progress for Recall Mode (Space to enter). Rides along
// in the node's data, so it persists in the board JSON with no migration.
export type RecallStats = {
  attempt: string // last typed-from-memory attempt (resume across restarts)
  bestAccuracy: number // 0..1, best round so far
  timesPracticed: number
  streak: number // consecutive rounds at/above the streak accuracy threshold
}

export type CodeNodeData = {
  code: string
  language: string
  cursor?: CursorPos
  title?: string
  tags?: string[]
  recall?: RecallStats
}

// Normalize a tag: trim, drop a leading '#', lowercase (matches db.ts).
const normTag = (raw: string): string => raw.trim().replace(/^#+/, '').toLowerCase()

export type CodeNodeType = Node<CodeNodeData, 'code'>

// Java first, Python second (the rest in a sensible order after that).
const LANGUAGES = ['java', 'python', 'javascript', 'c', 'typescript', 'rust', 'cpp', 'go', 'sql', 'json']

export default function CodeNode({ id, data, selected }: NodeProps<CodeNodeType>) {
  const { updateNodeData, setNodes, setEdges, getViewport, setViewport } = useReactFlow()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [tagDraft, setTagDraft] = useState('')

  const tags = data.tags ?? []

  // Compile & run state for this note (ephemeral — never saved to the board).
  const run = useRunState(id)
  const canRun = RUNNABLE.has(data.language)
  const isBusy = run.status === 'queued' || run.status === 'running'

  const onRunClick = (): void => {
    if (isBusy) stopRun(id)
    else runCode(id, data.language, data.code)
  }

  const addTag = (raw: string): void => {
    const name = normTag(raw)
    setTagDraft('')
    if (!name || tags.includes(name)) return
    updateNodeData(id, { tags: [...tags, name] })
  }

  const removeTag = (name: string): void => {
    updateNodeData(id, { tags: tags.filter((t) => t !== name) })
  }

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      e.stopPropagation()
      addTag(tagDraft)
    } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
      removeTag(tags[tags.length - 1])
    }
  }

  // Cmd/Ctrl + wheel should zoom the canvas even while the cursor is inside the
  // editor. Monaco binds native wheel listeners, so a React handler can't stop
  // it — we attach a native capture-phase listener that fires BEFORE Monaco,
  // blocks it, and zooms the canvas anchored on the cursor. Plain wheel falls
  // through so it still scrolls the code.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      e.stopPropagation()
      const container = el.closest('.react-flow') as HTMLElement | null
      if (!container) return
      const rect = container.getBoundingClientRect()
      const { x, y, zoom } = getViewport()
      const factor = Math.exp(-e.deltaY * 0.0015)
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setViewport({
        x: px - (px - x) * (newZoom / zoom),
        y: py - (py - y) * (newZoom / zoom),
        zoom: newZoom
      })
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [getViewport, setViewport])

  // Register this editor so Enter-to-focus can reach it; restore the saved
  // cursor position on mount (survives reloads); save it again whenever the
  // editor loses focus.
  const handleMount: OnMount = (ed, monaco) => {
    registerEditor(id, ed)
    const saved = data.cursor
    if (saved) {
      ed.setPosition(saved)
      ed.revealPositionInCenterIfOutsideViewport(saved)
    }
    ed.onDidBlurEditorText(() => {
      const p = ed.getPosition()
      if (p) updateNodeData(id, { cursor: { lineNumber: p.lineNumber, column: p.column } })
    })
    // Esc exits focus mode: blur the editor (which saves the cursor via the
    // blur handler above) so the canvas keys (. to cycle, Enter to dive back
    // in) take over again.
    ed.addCommand(monaco.KeyCode.Escape, () => {
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
  }

  useEffect(() => () => unregisterEditor(id), [id])

  const remove = (): void => {
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setNodes((nds) => nds.filter((n) => n.id !== id))
  }

  const toText = (): void => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, type: 'text', dragHandle: undefined, data: { text: data.code, editing: false } }
          : n
      )
    )
  }

  return (
    <div className={`tc-node tc-code ${selected ? 'is-selected' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={220} minHeight={120} color="#e9883a" />

      {/* Header is the drag handle (node.dragHandle === '.tc-code__header'). */}
      <div className="tc-code__header">
        <span className="tc-code__dot" />
        <select
          className="nodrag tc-code__lang"
          value={data.language}
          onChange={(e) => updateNodeData(id, { language: e.target.value })}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="nodrag tc-code__title"
          value={data.title ?? ''}
          spellCheck={false}
          placeholder="title / problem name…"
          onChange={(e) => updateNodeData(id, { title: e.target.value })}
          title="Title (searchable, shown in results)"
        />
        {canRun && (
          <button
            className={`nodrag tc-code__run ${isBusy ? 'is-busy' : ''}`}
            onClick={onRunClick}
            title={isBusy ? 'Stop' : 'Run'}
          >
            {run.status === 'running' ? '■' : run.status === 'queued' ? '…' : '▶'}
          </button>
        )}
        <button className="nodrag tc-code__btn" onClick={toText} title="Convert to text note">
          T
        </button>
        <button className="nodrag tc-code__btn danger" onClick={remove} title="Delete">
          ✕
        </button>
      </div>

      {/* Only capture the wheel (for Monaco scroll) while this note is selected.
          When it isn't, a transparent shield sits over the editor so Monaco's
          own wheel listeners never fire — the wheel bubbles to the canvas and
          two-finger panning glides right over the note. Clicking the shield
          selects the note (which removes it) so editing stays one click away. */}
      <div ref={bodyRef} className={`nodrag tc-code__body ${selected ? 'nowheel' : ''}`}>
        <Editor
          language={data.language}
          value={data.code}
          theme="vs-dark"
          onMount={handleMount}
          onChange={(value) => updateNodeData(id, { code: value ?? '' })}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'on',
            lineNumbersMinChars: 2,
            folding: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
          }}
        />
        {!selected && <div className="tc-code__shield" />}
      </div>

      {/* Inline tag chips: searchable across all boards. Lowercased + deduped. */}
      <div className="nodrag tc-code__tags">
        {tags.map((t) => (
          <span key={t} className="tc-code__tag">
            #{t}
            <button
              className="tc-code__tagx"
              onClick={() => removeTag(t)}
              title={`Remove #${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="tc-code__tagadd"
          value={tagDraft}
          spellCheck={false}
          placeholder={tags.length ? '+ tag' : '+ tag (e.g. greedy)'}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={onTagKey}
          onBlur={() => addTag(tagDraft)}
        />
      </div>

      {/* Ephemeral run output. Streams stdout (default) / stderr (red); meta
          lines like "Compiling…" arrive on stdout. Not persisted to the board. */}
      {canRun && run.status !== 'idle' && (
        <div className="nodrag nowheel tc-code__output">
          <div className="tc-code__output-head">
            {run.status === 'queued' && <span>queued #{run.queuePosition}</span>}
            {run.status === 'running' && <span className="tc-code__running">running…</span>}
            {run.status === 'done' && (
              <span className={run.exitCode === 0 ? 'ok' : 'bad'}>
                {run.canceled
                  ? 'stopped'
                  : run.timedOut
                    ? 'timed out (10s)'
                    : `exit ${run.exitCode} · ${run.durationMs}ms`}
              </span>
            )}
            <button
              className="tc-code__output-x"
              onClick={() => clearRun(id)}
              title="Clear output"
            >
              ×
            </button>
          </div>
          <pre className="tc-code__output-body">
            {run.output.map((seg, i) => (
              <span key={i} className={seg.isError ? 'err' : ''}>
                {seg.text}
              </span>
            ))}
          </pre>
        </div>
      )}

      <Handle type="source" position={Position.Top} className="tc-handle" />
      <Handle type="target" position={Position.Top} className="tc-handle" />
    </div>
  )
}
