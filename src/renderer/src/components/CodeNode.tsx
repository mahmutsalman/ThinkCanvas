import { useEffect, useRef } from 'react'
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

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5

export type CursorPos = { lineNumber: number; column: number }

export type CodeNodeData = {
  code: string
  language: string
  cursor?: CursorPos
}

export type CodeNodeType = Node<CodeNodeData, 'code'>

// Java first, Python second (the rest in a sensible order after that).
const LANGUAGES = ['java', 'python', 'javascript', 'c', 'typescript', 'rust', 'cpp', 'go', 'sql', 'json']

export default function CodeNode({ id, data, selected }: NodeProps<CodeNodeType>) {
  const { updateNodeData, setNodes, setEdges, getViewport, setViewport } = useReactFlow()
  const bodyRef = useRef<HTMLDivElement>(null)

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
        <div className="tc-code__spacer" />
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
            lineNumbers: 'off',
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

      <Handle type="source" position={Position.Top} className="tc-handle" />
      <Handle type="target" position={Position.Top} className="tc-handle" />
    </div>
  )
}
