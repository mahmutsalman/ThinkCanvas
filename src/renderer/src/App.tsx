import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  type OnNodeDrag
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import TextNode from './components/TextNode'
import CodeNode from './components/CodeNode'
import FloatingEdge from './components/FloatingEdge'
import { getEditor } from './lib/codeEditors'

const STORAGE_KEY = 'thinkcanvas:board:v1'

// Defined outside the component so the references stay stable across renders
// (React Flow warns and re-mounts nodes otherwise).
const nodeTypes = { text: TextNode, code: CodeNode }
const edgeTypes = { floating: FloatingEdge }
const defaultEdgeOptions = { type: 'floating' as const }

// Max code notes kept in the most-recently-used cycler (oldest auto-evicted).
const MAX_MRU = 8

type Board = { nodes: Node[]; edges: Edge[] }

function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const b = JSON.parse(raw) as Board
      const nodes = (b.nodes ?? []).map((n) =>
        n.type === 'text' ? { ...n, data: { ...n.data, editing: false } } : n
      )
      return { nodes, edges: b.edges ?? [] }
    }
  } catch {
    /* corrupt or empty — start blank */
  }
  return { nodes: [], edges: [] }
}

const newId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `n_${Date.now()}_${Math.round(Math.random() * 1e6)}`

function Flow(): JSX.Element {
  const initial = useMemo(loadBoard, [])
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const edgesRef = useRef(edges)
  edgesRef.current = edges
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const [menu, setMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null)
  // MRU cycler state: code-note ids (most-recent first) + a wrapping cursor.
  const [mru, setMru] = useState<string[]>([])
  const [cursor, setCursor] = useState(-1)
  const mruRef = useRef(mru)
  mruRef.current = mru
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const { screenToFlowPosition, getIntersectingNodes, setCenter, getZoom } = useReactFlow()

  // --- persistence: debounced autosave -------------------------------------
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }))
    }, 400)
    return () => clearTimeout(t)
  }, [nodes, edges])

  // --- edge label editing --------------------------------------------------
  const startEditEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? { ...e, selected: true, data: { ...e.data, editing: true } }
            : { ...e, selected: false }
        )
      )
    },
    [setEdges]
  )

  const removeEdge = useCallback(
    (edgeId: string) => setEdges((eds) => eds.filter((e) => e.id !== edgeId)),
    [setEdges]
  )

  // Type while exactly one edge is selected → start labelling it with that key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return

      const selected = edgesRef.current.filter((ed) => ed.selected)
      if (selected.length !== 1) return
      const edge = selected[0]
      if ((edge.data as { editing?: boolean } | undefined)?.editing) return

      e.preventDefault()
      const prev = (edge.data as { label?: string } | undefined)?.label ?? ''
      setEdges((eds) =>
        eds.map((ed) =>
          ed.id === edge.id ? { ...ed, data: { ...ed.data, editing: true, label: prev + e.key } } : ed
        )
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setEdges])

  // Close the context menu on any outside click.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  // --- MRU code-note cycler ------------------------------------------------
  // Select a code note and glide the camera so it's centered.
  const focusCodeNote = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId)
      if (!node) return
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })))
      const w = node.measured?.width ?? (typeof node.width === 'number' ? node.width : 240)
      const h = node.measured?.height ?? (typeof node.height === 'number' ? node.height : 200)
      setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: getZoom(), duration: 450 })
    },
    [setNodes, setCenter, getZoom]
  )

  // Drop ids from the cycler once their notes are deleted or converted to text.
  useEffect(() => {
    setMru((prev) => {
      const filtered = prev.filter((id) => nodes.some((n) => n.id === id && n.type === 'code'))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [nodes])

  // `.` cycles to the next (older) code note; Shift+. cycles back. Wraps around.
  // Enter dives into the currently selected code note's editor, landing on the
  // cursor position it had last (Monaco keeps it; restored from data on reload).
  // Both are skipped while typing (Monaco focuses a <textarea>, so editing `.`
  // and newlines are safe) or while an edge is selected.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const active = document.activeElement
      const typing = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')

      if (e.key === '.') {
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return
        if (edgesRef.current.some((ed) => ed.selected)) return
        const list = mruRef.current
        if (list.length === 0) return
        e.preventDefault()
        const len = list.length
        const next = e.shiftKey
          ? (cursorRef.current - 1 + len) % len
          : (cursorRef.current + 1) % len
        setCursor(next)
        focusCodeNote(list[next])
      } else if (e.key === 'Enter') {
        if (typing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
        const sel = nodesRef.current.find((n) => n.selected && n.type === 'code')
        if (!sel) return
        const ed = getEditor(sel.id)
        if (!ed) return
        e.preventDefault()
        ed.focus() // Monaco restores the last cursor position on focus
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusCodeNote])

  // Click a cycler chip → jump straight to that note.
  const jumpToChip = useCallback(
    (nodeId: string, index: number) => {
      setCursor(index)
      focusCodeNote(nodeId)
    },
    [focusCodeNote]
  )

  // --- create notes --------------------------------------------------------
  const addTextNode = useCallback(
    (flowPos: { x: number; y: number }, editing = true) => {
      const id = newId()
      setNodes((nds) =>
        nds.concat({
          id,
          type: 'text',
          position: { x: flowPos.x - 70, y: flowPos.y - 16 },
          data: { text: '', editing }
        })
      )
    },
    [setNodes]
  )

  const addCodeNode = useCallback(
    (flowPos: { x: number; y: number }) => {
      const id = newId()
      setNodes((nds) =>
        nds.concat({
          id,
          type: 'code',
          position: { x: flowPos.x - 120, y: flowPos.y - 100 },
          dragHandle: '.tc-code__header',
          width: 240,
          height: 200,
          data: { code: '', language: 'java' }
        })
      )
    },
    [setNodes]
  )

  // Double-click empty canvas → drop a note right there, ready to type.
  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.classList.contains('react-flow__pane')) return
      addTextNode(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    },
    [addTextNode, screenToFlowPosition]
  )

  // Center of the current viewport, in flow coordinates (for toolbar buttons).
  const viewportCenter = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
    return screenToFlowPosition({ x: cx, y: cy })
  }, [screenToFlowPosition])

  // --- drag-to-connect -----------------------------------------------------
  const onNodeDragStart: OnNodeDrag = useCallback((_, node) => {
    dragStart.current = { ...node.position }
  }, [])

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      const hits = getIntersectingNodes(node).filter((n) => n.id !== node.id)
      if (hits.length > 0) {
        const targetId = hits[0].id
        setEdges((eds) => {
          const exists = eds.some(
            (e) =>
              (e.source === node.id && e.target === targetId) ||
              (e.source === targetId && e.target === node.id)
          )
          if (exists) return eds
          return addEdge(
            { id: `e-${node.id}-${targetId}`, source: node.id, target: targetId, type: 'floating' },
            eds
          )
        })
        // Pure "connect" gesture: snap the note back to where the drag began,
        // exactly like dropping one Scapple note onto another.
        const start = dragStart.current
        if (start) {
          setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: start } : n)))
        }
      }
      dragStart.current = null
    },
    [getIntersectingNodes, setEdges, setNodes]
  )

  // Also allow the standard handle-drag connection (harmless to support).
  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, type: 'floating' }, eds)),
    [setEdges]
  )

  // Double-clicking a note never zooms (zoomOnDoubleClick is off); make sure a
  // double-click on a text node enters edit mode is handled inside the node.
  const onNodeDoubleClick: NodeMouseHandler = useCallback(() => {}, [])

  // Click a note → smoothly glide the camera so it sits in the middle of the
  // screen. Skip when the note is already selected, so clicking into a note you
  // just focused (e.g. to edit it) doesn't keep jerking the camera.
  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      // Auto-track code notes in the MRU cycler: move this one to the top.
      if (node.type === 'code') {
        setMru((prev) => [node.id, ...prev.filter((i) => i !== node.id)].slice(0, MAX_MRU))
        setCursor(0)
      }
      const current = nodesRef.current.find((n) => n.id === node.id)
      if (current?.selected) return
      const w = node.measured?.width ?? (typeof node.width === 'number' ? node.width : 160)
      const h = node.measured?.height ?? (typeof node.height === 'number' ? node.height : 44)
      setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: getZoom(), duration: 450 })
    },
    [setCenter, getZoom]
  )

  // Double-click an edge → start labelling it immediately.
  const onEdgeDoubleClick = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.stopPropagation()
      startEditEdge(edge.id)
    },
    [startEditEdge]
  )

  // Right-click an edge → Edit / Remove menu at the cursor.
  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id })
  }, [])

  const onPaneClick = useCallback(() => setMenu(null), [])

  const textCount = nodes.length

  return (
    <div className="tc-app">
      {/* Draggable OS title bar — sits ABOVE the canvas so it isn't swallowed
          by React Flow's pan handling. Buttons opt back out with no-drag. */}
      <div className="tc-topbar">
        <div className="tc-topbar__left">
          <span className="tc-topbar__name">ThinkCanvas</span>
          <span className="tc-topbar__hint">double-click to add a note · drag a note onto another to connect</span>
        </div>
        <div className="tc-topbar__right">
          <button onClick={() => addTextNode(viewportCenter())}>+ Note</button>
          <button onClick={() => addCodeNode(viewportCenter())}>+ Code</button>
        </div>
      </div>

      <div className="tc-flow" ref={wrapperRef} onDoubleClick={onCanvasDoubleClick}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          deleteKeyCode={['Backspace', 'Delete']}
          minZoom={0.2}
          maxZoom={2.5}
          zoomOnDoubleClick={false}
          zoomOnScroll={false}
          panOnScroll
          zoomOnPinch
          zoomActivationKeyCode={['Meta', 'Control']}
          panOnDrag
          selectionOnDrag={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="#2a2e37" />
          <Controls showInteractive={false} />

          {mru.length > 0 && (
            <Panel position="top-left">
              <div className="tc-mru">
                <div className="tc-mru__head">
                  code notes <kbd>.</kbd>
                </div>
                {mru.map((id, i) => {
                  const node = nodes.find((n) => n.id === id)
                  const cd = (node?.data ?? {}) as { code?: string; language?: string }
                  const firstLine =
                    (cd.code ?? '')
                      .split('\n')
                      .map((s) => s.trim())
                      .find(Boolean) || '(empty)'
                  return (
                    <button
                      key={id}
                      className={`tc-mru__chip ${i === cursor ? 'is-current' : ''}`}
                      onClick={() => jumpToChip(id, i)}
                      title={firstLine}
                    >
                      <span className="tc-mru__lang">{cd.language ?? 'code'}</span>
                      <span className="tc-mru__text">{firstLine}</span>
                    </button>
                  )
                })}
              </div>
            </Panel>
          )}

          <Panel position="bottom-center">
            <div className="tc-status">{textCount} {textCount === 1 ? 'note' : 'notes'}</div>
          </Panel>
        </ReactFlow>
      </div>

      {menu && (
        <div
          className="tc-ctx"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              startEditEdge(menu.edgeId)
              setMenu(null)
            }}
          >
            Edit
          </button>
          <button
            className="danger"
            onClick={() => {
              removeEdge(menu.edgeId)
              setMenu(null)
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  )
}
