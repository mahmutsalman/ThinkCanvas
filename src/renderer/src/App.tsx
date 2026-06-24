import { useCallback, useEffect, useRef, useState } from 'react'
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
  type OnNodeDrag,
  type Viewport
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import TextNode from './components/TextNode'
import CodeNode, { type CodeNodeType, type RecallStats } from './components/CodeNode'
import RecallMode from './components/RecallMode'
import FloatingEdge from './components/FloatingEdge'
import Library, { type BoardSort } from './components/Library'
import SearchPanel from './components/SearchPanel'
import ThemeEditor from './components/ThemeEditor'
import {
  BUILTIN_THEMES,
  VSCODE_THEMES,
  applyTheme,
  applyDynamicTheme,
  isHex6,
  loadCustomThemes,
  saveCustomThemes,
  newThemeId,
  readCurrentTokens,
  type CustomTheme,
  type ThemeTokens
} from './lib/themes'
import { getEditor } from './lib/codeEditors'
import {
  emptyBoard,
  newBoardId,
  sanitizeBoard,
  stripTransient,
  type Board,
  type BoardMeta
} from './lib/boards'

const LEGACY_KEY = 'thinkcanvas:board:v1'
const LAST_BOARD_KEY = 'thinkcanvas:lastBoard'
const MRU_COLLAPSED_KEY = 'thinkcanvas:mruCollapsed'
const BOARD_SORT_KEY = 'thinkcanvas:boardSort'

// Defined outside the component so the references stay stable across renders
// (React Flow warns and re-mounts nodes otherwise).
const nodeTypes = { text: TextNode, code: CodeNode }
const edgeTypes = { floating: FloatingEdge }
const defaultEdgeOptions = { type: 'floating' as const }

// Max code notes kept in the most-recently-used cycler (oldest auto-evicted).
const MAX_MRU = 8

const THEME_KEY = 'thinkcanvas:theme'

const newId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `n_${Date.now()}_${Math.round(Math.random() * 1e6)}`

const sortBoards = (list: BoardMeta[]): BoardMeta[] =>
  [...list].sort((a, b) => b.updatedAt - a.updatedAt)

// One-time migration: fold the old single localStorage board into a real board.
function loadLegacyBoard(): Board | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const b = JSON.parse(raw) as { nodes?: Node[]; edges?: Edge[] }
    if (!b.nodes?.length && !b.edges?.length) return null
    const now = Date.now()
    return {
      id: newBoardId(),
      name: 'Imported board',
      createdAt: now,
      updatedAt: now,
      nodes: b.nodes ?? [],
      edges: b.edges ?? []
    }
  } catch {
    return null
  }
}

function Flow(): JSX.Element {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
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
  // The code note the user is currently "on" (last cycled-to OR clicked). Used
  // to route Enter, independently of React Flow selection or focus, so a stale
  // editor focus can't misdirect it.
  const activeCodeId = useRef<string | null>(null)
  // Zoom level pinned for the current `.`-cycling run. Sampled once when cycling
  // starts and reused for every subsequent focus, so the camera doesn't drift
  // out as fast presses interrupt the in-flight setCenter animation. Cleared
  // (→ null) on any user-initiated zoom/pan so a deliberate zoom is honored next.
  const navZoomRef = useRef<number | null>(null)
  // Board (multi-document) state.
  const [boardId, setBoardId] = useState<string | null>(null)
  const [boardName, setBoardName] = useState('Untitled')
  const [boardList, setBoardList] = useState<BoardMeta[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // The code note currently open in Recall Mode (Space on a focused code note).
  const [recallId, setRecallId] = useState<string | null>(null)
  // Mirror so the global canvas key handlers can stay inert while Recall Mode
  // (a modal) owns the keyboard — otherwise Enter/`.`/Space leak into the canvas.
  const recallActiveRef = useRef(false)
  recallActiveRef.current = recallId !== null
  // Collapse state of the left-side code-note cycler (global UI pref).
  const [mruCollapsed, setMruCollapsed] = useState<boolean>(
    () => localStorage.getItem(MRU_COLLAPSED_KEY) === '1'
  )
  const toggleMruCollapsed = useCallback(() => {
    setMruCollapsed((v) => {
      const next = !v
      localStorage.setItem(MRU_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }, [])
  // Library sort order (global UI pref): 'updated' (recent first) or 'created'.
  const [boardSort, setBoardSort] = useState<BoardSort>(
    () => (localStorage.getItem(BOARD_SORT_KEY) === 'created' ? 'created' : 'updated')
  )
  const toggleBoardSort = useCallback(() => {
    setBoardSort((m) => {
      const next: BoardSort = m === 'created' ? 'updated' : 'created'
      localStorage.setItem(BOARD_SORT_KEY, next)
      return next
    })
  }, [])
  // Color theme + user-made custom themes.
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() => loadCustomThemes())
  const [theme, setTheme] = useState<string>(() => localStorage.getItem(THEME_KEY) || 'default')
  // Stream override — a Twitch viewer recolored via the !color chat command (the
  // daemon writes stream-color.json; the Electron main process watches it and
  // pushes here). TEMPORARY: it wins over `theme` for display but is NEVER
  // persisted, so a reset / manual pick / app restart returns to the real theme.
  const [streamOverride, setStreamOverride] = useState<string | null>(null)
  const [themeEditor, setThemeEditor] = useState<{
    mode: 'create' | 'edit'
    editingId: string | null
  } | null>(null)

  // Apply the active theme to <html>. A viewer override (any hex) derives a full
  // theme dynamically as inline vars; otherwise built-in → data-theme / custom →
  // inline vars. The override wins for display; only the real pick is persisted.
  useEffect(() => {
    if (streamOverride) applyDynamicTheme(streamOverride)
    else applyTheme(theme, customThemes)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme, customThemes, streamOverride])

  // Listen for viewer !color theme switches from the Electron main process.
  useEffect(() => {
    const sc = window.streamColor
    if (!sc?.onChange) return
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    const off = sc.onChange((data) => {
      if (idleTimer) clearTimeout(idleTimer)
      if (!data || data.reset || typeof data.hex !== 'string') {
        setStreamOverride(null)
        return
      }
      const hex = data.hex.toLowerCase()
      if (!isHex6(hex)) return // not a valid #rrggbb — leave the theme as-is
      setStreamOverride(hex) // derive a full 8-layer theme from ANY hex
      // Honor the per-command time limit: a positive durationMs (capped 1h) auto-
      // reverts; blank / absent = no limit (until reset / manual pick / restart).
      const durationMs =
        typeof data.durationMs === 'number' && data.durationMs > 0
          ? Math.min(data.durationMs, 60 * 60_000)
          : null
      if (durationMs) idleTimer = setTimeout(() => setStreamOverride(null), durationMs)
    })
    return () => {
      if (idleTimer) clearTimeout(idleTimer)
      off?.()
    }
  }, [])

  const currentIsCustom = customThemes.some((t) => t.id === theme)

  const onThemePick = useCallback((value: string) => {
    if (value === '__new__') {
      setThemeEditor({ mode: 'create', editingId: null })
      return
    }
    setStreamOverride(null) // a manual pick takes over from any viewer override
    setTheme(value)
  }, [])

  const saveTheme = useCallback(
    (name: string, tokens: ThemeTokens) => {
      const editId =
        themeEditor?.mode === 'edit' && themeEditor.editingId ? themeEditor.editingId : null
      const id = editId ?? newThemeId()
      setCustomThemes((prev) => {
        const next = editId
          ? prev.map((t) => (t.id === editId ? { ...t, label: name, tokens } : t))
          : [...prev, { id, label: name, tokens }]
        saveCustomThemes(next)
        return next
      })
      setTheme(id)
      setThemeEditor(null)
    },
    [themeEditor]
  )

  const deleteTheme = useCallback(() => {
    const id = themeEditor?.editingId
    if (!id) return
    setCustomThemes((prev) => {
      const next = prev.filter((t) => t.id !== id)
      saveCustomThemes(next)
      return next
    })
    setTheme('default')
    setThemeEditor(null)
  }, [themeEditor])

  const cancelThemeEdit = useCallback(() => {
    setThemeEditor(null)
    applyTheme(theme, customThemes) // revert any live-preview edits
  }, [theme, customThemes])
  // When a search result lives on another board, remember which note to center
  // once that board's nodes have hydrated.
  const pendingFocus = useRef<string | null>(null)
  // Where the camera was when search opened — so "Back" can return there.
  const searchOrigin = useRef<{ boardId: string | null; viewport: Viewport } | null>(null)
  // Viewport to restore once a board switch (triggered by Back) finishes.
  const pendingViewport = useRef<Viewport | null>(null)
  const hydrated = useRef(false)
  const createdAtRef = useRef<number>(Date.now())
  const boardNameRef = useRef(boardName)
  boardNameRef.current = boardName
  const boardIdRef = useRef(boardId)
  boardIdRef.current = boardId
  const { screenToFlowPosition, getIntersectingNodes, setCenter, getZoom, getViewport, setViewport } =
    useReactFlow()

  // --- board load / save ---------------------------------------------------
  const openBoard = useCallback(
    (board: Board) => {
      const clean = sanitizeBoard(board)
      createdAtRef.current = clean.createdAt
      setBoardId(clean.id)
      setBoardName(clean.name)
      setNodes(clean.nodes)
      setEdges(clean.edges)
      // Restore the saved cycler list, dropping any ids whose code note is gone.
      const savedMru = (clean.mru ?? []).filter((id) =>
        clean.nodes.some((n) => n.id === id && n.type === 'code')
      )
      setMru(savedMru)
      setCursor(-1)
      localStorage.setItem(LAST_BOARD_KEY, clean.id)
      hydrated.current = true
    },
    [setNodes, setEdges]
  )

  const saveCurrentNow = useCallback(async (): Promise<void> => {
    const id = boardIdRef.current
    if (!id) return
    const clean = stripTransient(nodesRef.current, edgesRef.current)
    await window.boards.save({
      id,
      name: boardNameRef.current,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
      nodes: clean.nodes,
      edges: clean.edges,
      mru: mruRef.current
    })
  }, [])

  // Load the last-opened (or most recent) board on startup; migrate legacy.
  // Guarded so it runs exactly once — React StrictMode double-invokes effects
  // in dev, and without this guard the "create first board" branch ran twice
  // and produced duplicate boards.
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    ;(async () => {
      const list = sortBoards(await window.boards.list())
      let board: Board | null = null
      const lastId = localStorage.getItem(LAST_BOARD_KEY)
      if (lastId) board = await window.boards.load(lastId)
      if (!board && list.length) board = await window.boards.load(list[0].id)
      if (!board) {
        board = loadLegacyBoard() ?? emptyBoard()
        await window.boards.save(board)
      }
      openBoard(board)
      setBoardList(sortBoards(await window.boards.list()))
    })()
  }, [openBoard])

  // Debounced autosave of the current board to its file.
  useEffect(() => {
    if (!hydrated.current || !boardId) return
    const t = setTimeout(() => {
      const clean = stripTransient(nodes, edges)
      void window.boards.save({
        id: boardId,
        name: boardName,
        createdAt: createdAtRef.current,
        updatedAt: Date.now(),
        nodes: clean.nodes,
        edges: clean.edges,
        mru
      })
    }, 500)
    return () => clearTimeout(t)
  }, [nodes, edges, boardName, boardId, mru])

  // --- board actions (library) ---------------------------------------------
  const openLibrary = useCallback(async () => {
    setBoardList(sortBoards(await window.boards.list()))
    setLibraryOpen(true)
  }, [])

  const switchBoard = useCallback(
    async (id: string) => {
      if (id === boardIdRef.current) {
        setLibraryOpen(false)
        return
      }
      await saveCurrentNow()
      const board = await window.boards.load(id)
      if (board) openBoard(board)
      setLibraryOpen(false)
    },
    [saveCurrentNow, openBoard]
  )

  const createBoard = useCallback(async () => {
    await saveCurrentNow()
    const board = emptyBoard()
    await window.boards.save(board)
    openBoard(board)
    setLibraryOpen(false)
  }, [saveCurrentNow, openBoard])

  const deleteBoard = useCallback(
    async (id: string) => {
      await window.boards.remove(id)
      const list = sortBoards(await window.boards.list())
      setBoardList(list)
      if (id === boardIdRef.current) {
        if (list.length) {
          const b = await window.boards.load(list[0].id)
          if (b) openBoard(b)
        } else {
          const b = emptyBoard()
          await window.boards.save(b)
          openBoard(b)
        }
      }
    },
    [openBoard]
  )

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
      if (recallActiveRef.current) return
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
      activeCodeId.current = nodeId
      setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })))
      const w = node.measured?.width ?? (typeof node.width === 'number' ? node.width : 240)
      const h = node.measured?.height ?? (typeof node.height === 'number' ? node.height : 200)
      // Pin the zoom for the cycling run (sample once, then reuse) so repeated
      // `.` presses don't drift the camera outward via interrupted animations.
      const z = navZoomRef.current ?? getZoom()
      navZoomRef.current = z
      setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: z, duration: 450 })
    },
    [setNodes, setCenter, getZoom]
  )

  // After a board switch from search, center the requested note once it exists.
  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    if (nodes.some((n) => n.id === target && n.type === 'code')) {
      pendingFocus.current = null
      focusCodeNote(target)
    }
  }, [nodes, focusCodeNote])

  // Open a snippet from the search panel: center it (same board) or switch to
  // its board first and center once hydrated.
  const openSnippet = useCallback(
    async (targetBoardId: string, nodeId: string) => {
      if (targetBoardId === boardIdRef.current) {
        focusCodeNote(nodeId)
        return
      }
      pendingFocus.current = nodeId
      await switchBoard(targetBoardId)
    },
    [focusCodeNote, switchBoard]
  )

  // Snapshot where the camera was the moment search opens, so "Back" returns
  // there after browsing results may have flown us across boards.
  useEffect(() => {
    if (searchOpen) {
      searchOrigin.current = { boardId: boardIdRef.current, viewport: getViewport() }
    }
  }, [searchOpen, getViewport])

  // Restore the saved viewport once a Back-triggered board switch has hydrated.
  useEffect(() => {
    if (pendingViewport.current) {
      const vp = pendingViewport.current
      pendingViewport.current = null
      setViewport(vp, { duration: 400 })
    }
  }, [boardId, setViewport])

  // Fly back to where we were when search opened (board + exact camera).
  const goBackToOrigin = useCallback(async () => {
    const origin = searchOrigin.current
    if (!origin) return
    if (origin.boardId && origin.boardId !== boardIdRef.current) {
      pendingViewport.current = origin.viewport
      await switchBoard(origin.boardId)
    } else {
      setViewport(origin.viewport, { duration: 400 })
    }
  }, [switchBoard, setViewport])

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
      // Recall Mode is a modal — it owns the keyboard while open.
      if (recallActiveRef.current) return
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
      } else if (e.key === ',') {
        // `,` tours EVERY code note on the board in reading order (top→bottom,
        // then left→right) — no prior click needed, unlike `.` which only walks
        // notes you've clicked. It steps relative to the note you're currently
        // on, so it also continues a `.` run or a click. Shift+, walks back;
        // both wrap around.
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return
        if (edgesRef.current.some((ed) => ed.selected)) return
        const list = nodesRef.current
          .filter((n) => n.type === 'code')
          .sort((a, b) => {
            // Band y into ~100px rows so notes roughly on a row read left→right.
            const ra = Math.floor(a.position.y / 100)
            const rb = Math.floor(b.position.y / 100)
            return ra !== rb ? ra - rb : a.position.x - b.position.x
          })
        if (list.length === 0) return
        e.preventDefault()
        const len = list.length
        const curIdx = list.findIndex((n) => n.id === activeCodeId.current)
        const next =
          curIdx === -1
            ? e.shiftKey
              ? len - 1
              : 0
            : e.shiftKey
              ? (curIdx - 1 + len) % len
              : (curIdx + 1) % len
        const targetId = list[next].id
        focusCodeNote(targetId)
        // Keep the left cycler's highlight coherent when the tour lands on a
        // note that also happens to live in the clicked-MRU list.
        const inMru = mruRef.current.indexOf(targetId)
        if (inMru !== -1) setCursor(inMru)
      } else if (e.key === ' ') {
        // Space dives into Recall Mode for the focused code note.
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return
        if (edgesRef.current.some((ed) => ed.selected)) return
        const id = activeCodeId.current
        if (!id) return
        if (!nodesRef.current.some((n) => n.id === id && n.type === 'code')) return
        e.preventDefault()
        setRecallId(id)
      } else if (e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
        const tag = active?.tagName
        if (tag === 'INPUT') return // board-title / edge-label inputs own Enter
        const inMonaco = !!active?.closest('.monaco-editor')
        if (tag === 'TEXTAREA' && !inMonaco) return // a text note's editor owns Enter
        const id = activeCodeId.current
        if (!id) return
        const node = nodesRef.current.find((n) => n.id === id && n.type === 'code')
        if (!node) return
        const ed = getEditor(id)
        if (!ed) return
        // If THIS note's editor already has focus, let Monaco handle Enter
        // (newline). Otherwise dive in — even if a *different* (stale) editor
        // currently holds focus. This is the bug fix.
        if (ed.hasTextFocus()) return
        e.preventDefault()
        ed.focus() // blurs any stale editor; Monaco restores this note's cursor
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusCodeNote])

  // Cmd/Ctrl+F toggles the search panel (works even from inside a code editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (recallActiveRef.current) return
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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
        activeCodeId.current = node.id
        setMru((prev) => [node.id, ...prev.filter((i) => i !== node.id)].slice(0, MAX_MRU))
        setCursor(0)
      } else {
        // Clicking a non-code note means Enter shouldn't dive into a stale one.
        activeCodeId.current = null
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

  const onPaneClick = useCallback(() => {
    setMenu(null)
    activeCodeId.current = null // clicking empty canvas clears the current note
  }, [])

  const textCount = nodes.length

  return (
    <div className="tc-app">
      {/* Draggable OS title bar — sits ABOVE the canvas so it isn't swallowed
          by React Flow's pan handling. Buttons opt back out with no-drag. */}
      <div className="tc-topbar">
        <div className="tc-topbar__left">
          <span className="tc-topbar__name">ThinkCanvas</span>
          <input
            className="tc-topbar__title"
            value={boardName}
            spellCheck={false}
            placeholder="Untitled"
            onChange={(e) => setBoardName(e.target.value)}
            title="Rename this board"
          />
        </div>
        <div className="tc-topbar__right">
          <select
            className="tc-topbar__theme"
            value={theme}
            onChange={(e) => onThemePick(e.target.value)}
            title="Color theme"
          >
            {BUILTIN_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
            <optgroup label="VS Code (viewer colors)">
              {VSCODE_THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            {customThemes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
            <option value="__new__">✎ New theme…</option>
          </select>
          {currentIsCustom && (
            <button
              className="tc-topbar__themeedit"
              onClick={() => setThemeEditor({ mode: 'edit', editingId: theme })}
              title="Edit this theme"
            >
              ✎
            </button>
          )}
          <button onClick={() => setSearchOpen((v) => !v)} title="Search snippets (⌘F)">
            Search
          </button>
          <button onClick={openLibrary}>Boards</button>
          <button onClick={createBoard}>New</button>
          <span className="tc-topbar__sep" />
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
          onMoveEnd={(e) => {
            // Only user gestures pass a non-null event (programmatic setCenter
            // passes null). Re-sample the cycling zoom on the next `.` press.
            if (e) navZoomRef.current = null
          }}
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
              <div className={`tc-mru ${mruCollapsed ? 'is-collapsed' : ''}`}>
                <div className="tc-mru__head">
                  <button
                    className="tc-mru__toggle"
                    onClick={toggleMruCollapsed}
                    title={mruCollapsed ? 'Expand code notes' : 'Collapse'}
                  >
                    {mruCollapsed ? '▸' : '▾'}
                  </button>
                  <span className="tc-mru__headlabel">code notes</span>
                  {mruCollapsed ? (
                    <span className="tc-mru__count">{mru.length}</span>
                  ) : (
                    <kbd>.</kbd>
                  )}
                </div>
                {!mruCollapsed &&
                  mru.map((id, i) => {
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

      {libraryOpen && (
        <Library
          boards={boardList}
          currentId={boardId}
          sortMode={boardSort}
          onToggleSort={toggleBoardSort}
          onOpen={switchBoard}
          onNew={createBoard}
          onDelete={deleteBoard}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      {searchOpen && (
        <SearchPanel
          currentBoardId={boardId}
          onOpenSnippet={openSnippet}
          onBack={goBackToOrigin}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {recallId &&
        (() => {
          const n = nodes.find((x) => x.id === recallId && x.type === 'code') as
            | CodeNodeType
            | undefined
          return n ? (
            <RecallMode
              node={n}
              onClose={() => setRecallId(null)}
              onSaveStats={(id: string, stats: RecallStats) =>
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === id && node.type === 'code'
                      ? { ...node, data: { ...node.data, recall: stats } }
                      : node
                  )
                )
              }
            />
          ) : null
        })()}

      {themeEditor && (
        <ThemeEditor
          mode={themeEditor.mode}
          initialName={
            themeEditor.mode === 'edit'
              ? customThemes.find((t) => t.id === themeEditor.editingId)?.label ?? 'My theme'
              : 'My theme'
          }
          initialTokens={
            (themeEditor.mode === 'edit'
              ? customThemes.find((t) => t.id === themeEditor.editingId)?.tokens
              : undefined) ?? readCurrentTokens()
          }
          onSave={saveTheme}
          onDelete={themeEditor.mode === 'edit' ? deleteTheme : undefined}
          onCancel={cancelThemeEdit}
        />
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
