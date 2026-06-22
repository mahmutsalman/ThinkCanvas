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
  type OnNodeDrag
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import TextNode from './components/TextNode'
import CodeNode from './components/CodeNode'
import FloatingEdge from './components/FloatingEdge'
import Library from './components/Library'
import SearchPanel from './components/SearchPanel'
import { getEditor } from './lib/codeEditors'
import { CameraFeed } from './components/CameraFeed'
import { useHandTracking, type GestureEvent } from './hooks/useHandTracking'
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

// Defined outside the component so the references stay stable across renders
// (React Flow warns and re-mounts nodes otherwise).
const nodeTypes = { text: TextNode, code: CodeNode }
const edgeTypes = { floating: FloatingEdge }
const defaultEdgeOptions = { type: 'floating' as const }

// Max code notes kept in the most-recently-used cycler (oldest auto-evicted).
const MAX_MRU = 8

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
  // Board (multi-document) state.
  const [boardId, setBoardId] = useState<string | null>(null)
  const [boardName, setBoardName] = useState('Untitled')
  const [boardList, setBoardList] = useState<BoardMeta[]>([])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // When a search result lives on another board, remember which note to center
  // once that board's nodes have hydrated.
  const pendingFocus = useRef<string | null>(null)
  const hydrated = useRef(false)
  const createdAtRef = useRef<number>(Date.now())
  const boardNameRef = useRef(boardName)
  boardNameRef.current = boardName
  const boardIdRef = useRef(boardId)
  boardIdRef.current = boardId
  const { screenToFlowPosition, getIntersectingNodes, setCenter, getZoom, getViewport, setViewport } = useReactFlow()
  
  // Center of the current viewport, in flow coordinates (for toolbar buttons).
  const viewportCenter = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2
    return screenToFlowPosition({ x: cx, y: cy })
  }, [screenToFlowPosition])

  const [activeNodeIndex, setActiveNodeIndex] = useState(-1)
  const lastCreatedIdRef = useRef<string | null>(null)

  const focusNodeByIndex = useCallback((index: number) => {
    const list = nodesRef.current;
    if (list.length === 0) return;
    const i = (index + list.length) % list.length;
    setActiveNodeIndex(i);
    const node = list[i];
    setNodes(nds => nds.map(n => ({...n, selected: n.id === node.id})));
    const w = typeof node.width === 'number' ? node.width : 200;
    const h = typeof node.height === 'number' ? node.height : 100;
    setCenter(node.position.x + w/2, node.position.y + h/2, { zoom: getZoom(), duration: 300 });
  }, [setNodes, setCenter, getZoom]);

  const pinchMoveStart = useRef<{ nodePos: {x: number, y: number}, handPos: {x: number, y: number} } | null>(null)
  const panMoveStart = useRef<{ viewportPos: {x: number, y: number}, handPos: {x: number, y: number} } | null>(null)
  const [deletePromptActive, setDeletePromptActive] = useState(false)
  
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    if (SpeechRecognition) {
       recognitionRef.current = new SpeechRecognition()
       recognitionRef.current.continuous = false
       recognitionRef.current.interimResults = false
       
       recognitionRef.current.onresult = (e: any) => {
          const text = e.results[0][0].transcript;
          const targetId = lastCreatedIdRef.current;
          if (targetId) {
             setNodes(nds => nds.map(n => n.id === targetId ? { ...n, data: { ...n.data, text, editing: false } } : n));
          }
       }
    }
  }, [])

  const activeNodeIndexRef = useRef(activeNodeIndex)
  activeNodeIndexRef.current = activeNodeIndex

  const [isCanvasLocked, setIsCanvasLocked] = useState(false)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const hoveredNodeIdRef = useRef<string | null>(null)

  const sleepUntil = useRef(0)

  const handleGesture = useCallback((ev: GestureEvent) => {
    if (ev.type === 'NONE') return;

    if (Date.now() < sleepUntil.current && ev.type !== 'ZOOM') {
      return;
    }

    const { x, y, zoom } = getViewport();
    const currentSelected = nodesRef.current.find(n => n.selected);
    const current = currentSelected || nodesRef.current[0];
    
    if (ev.type === 'ZOOM') {
      const newZoom = Math.min(Math.max(zoom * Math.exp(ev.scaleDiff * 1.5), 0.2), 2.5);
      setViewport({ x, y, zoom: newZoom });
      return;
    }

    if (ev.type === 'TWO_PALMS') {
       setIsCanvasLocked(prev => {
          const next = !prev;
          if (next && currentSelected) {
             const node = currentSelected;
             setActiveNodeIndex(nodesRef.current.indexOf(node));
             setNodes(nds => nds.map(n => ({...n, selected: n.id === node.id})));
             const w = typeof node.width === 'number' ? node.width : 200;
             const h = typeof node.height === 'number' ? node.height : 100;
             setCenter(node.position.x + w/2, node.position.y + h/2, { zoom: 1.5, duration: 300 });
          }
          return next;
       });
       sleepUntil.current = Date.now() + 2000;
       return;
    }

    if (ev.type === 'PAN_START') {
      panMoveStart.current = {
        viewportPos: { x, y },
        handPos: { x: ev.x, y: ev.y }
      };
      return;
    } else if (ev.type === 'PAN_MOVE') {
      if (panMoveStart.current) {
        const { viewportPos, handPos } = panMoveStart.current;
        const dx = (ev.x - handPos.x) * window.innerWidth * 1.5;
        const dy = (ev.y - handPos.y) * window.innerHeight * 1.5;
        setViewport({ x: viewportPos.x + dx, y: viewportPos.y + dy, zoom });
      }
      return;
    } else if (ev.type === 'PAN_END') {
      panMoveStart.current = null;
      return;
    }

    if (isCanvasLocked) return;

    if (ev.type === 'THUMB_RIGHT') {
      focusNodeByIndex(activeNodeIndexRef.current + 1);
      return;
    }
    if (ev.type === 'THUMB_LEFT') {
      focusNodeByIndex(activeNodeIndexRef.current - 1);
      return;
    }

    if (ev.type === 'SHAKE') {
      setNodes(nds => nds.map(n => ({...n, selected: false})));
      setActiveNodeIndex(-1);
      return;
    }

    if (ev.type === 'PINCH_START') {
      let activeNode = nodesRef.current.find(n => n.selected);
      if (!activeNode) {
          const rect = wrapperRef.current?.getBoundingClientRect();
          const handScreenX = (rect?.left || 0) + ev.x * (rect?.width || window.innerWidth);
          const handScreenY = (rect?.top || 0) + ev.y * (rect?.height || window.innerHeight);
          const handFlowPos = screenToFlowPosition({ x: handScreenX, y: handScreenY });
          let closestNode = null;
          let minDist = Infinity;
          for (const n of nodesRef.current) {
             const cx = n.position.x + (n.width || 200)/2;
             const cy = n.position.y + (n.height || 100)/2;
             const dist = Math.hypot(cx - handFlowPos.x, cy - handFlowPos.y);
             if (dist < minDist) {
                minDist = dist;
                closestNode = n;
             }
          }
          if (closestNode) {
             activeNode = closestNode;
             setNodes(nds => nds.map(n => ({...n, selected: n.id === closestNode.id})));
             const idx = nodesRef.current.indexOf(closestNode);
             setActiveNodeIndex(idx);
          }
      }
      if (activeNode) {
         setNodes(nds => nds.map(n => ({...n, selected: n.id === activeNode.id})));
         pinchMoveStart.current = {
            nodePos: { x: activeNode.position.x, y: activeNode.position.y },
            handPos: { x: ev.x, y: ev.y }
         };
      }
    } else if (ev.type === 'PINCH_MOVE') {
      if (pinchMoveStart.current) {
         const { nodePos, handPos } = pinchMoveStart.current;
         const screenDx = (ev.x - handPos.x) * window.innerWidth * 0.2;
         const screenDy = (ev.y - handPos.y) * window.innerHeight * 0.2;
         setNodes(nds => nds.map(n => n.selected ? {
             ...n, position: { x: nodePos.x + screenDx / zoom, y: nodePos.y + screenDy / zoom }
         } : n));
      }
    } else if (ev.type === 'PINCH_END') {
      pinchMoveStart.current = null;
    }

    if (ev.type === 'HOVER_START' || ev.type === 'HOVER_MOVE') {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const handScreenX = (rect?.left || 0) + ev.x * (rect?.width || window.innerWidth);
      const handScreenY = (rect?.top || 0) + ev.y * (rect?.height || window.innerHeight);
      const handFlowPos = screenToFlowPosition({ x: handScreenX, y: handScreenY });
      let closestNode = null;
      let minDist = Infinity;
      for (const n of nodesRef.current) {
         const cx = n.position.x + (n.width || 200)/2;
         const cy = n.position.y + (n.height || 100)/2;
         const dist = Math.hypot(cx - handFlowPos.x, cy - handFlowPos.y);
         if (dist < minDist) {
            minDist = dist;
            closestNode = n;
         }
      }
      if (closestNode) {
          setHoveredNodeId(closestNode.id);
          hoveredNodeIdRef.current = closestNode.id;
      }
      return;
    } else if (ev.type === 'HOVER_END') {
      setHoveredNodeId(null);
      hoveredNodeIdRef.current = null;
      return;
    }

    if (ev.type === 'FINGER_1') {
      const id = newId();
      const newPos = current ? { x: current.position.x + 300, y: current.position.y } : viewportCenter();
      lastCreatedIdRef.current = id;
      setNodes(nds => nds.concat({
          id, type: 'text', position: newPos, data: { text: 'Listening...', editing: true }, selected: true
      }).map(n => n.id === id ? n : {...n, selected: false}));
      if (current) {
        setEdges(eds => addEdge({ id: `e-${current.id}-${id}`, source: current.id, target: id, type: 'floating' }, eds));
      }
      setTimeout(() => focusNodeByIndex(nodesRef.current.findIndex(n => n.id === id)), 50);
      
      // Start dictation
      if (recognitionRef.current) {
         try { recognitionRef.current.start(); } catch(e) {}
      }
    } else if (ev.type === 'FINGER_2') {
      if (current && current.type === 'text') {
          // Edit current node with dictation
          lastCreatedIdRef.current = current.id;
          setNodes(nds => nds.map(n => n.id === current.id ? {...n, data: {...n.data, editing: true}} : n));
          if (recognitionRef.current) {
             try { recognitionRef.current.start(); } catch(e) {}
          }
      }
    } else if (ev.type === 'FIST') {
      if (hoveredNodeIdRef.current) {
         const hId = hoveredNodeIdRef.current;
         setNodes(nds => nds.map(n => ({...n, selected: n.id === hId, data: n.id === hId ? {...n.data, editing: false} : n.data})));
         setActiveNodeIndex(nodesRef.current.findIndex(n => n.id === hId));
         setHoveredNodeId(null);
         hoveredNodeIdRef.current = null;
      } else {
          setNodes(nds => nds.map(n => n.selected ? {...n, data: {...n.data, editing: false}} : n));
      }
      if (recognitionRef.current) {
         try { recognitionRef.current.stop(); } catch(e) {}
      }
    } else if (ev.type === 'FINGER_3') {
      if (recognitionRef.current) {
         try { recognitionRef.current.stop(); } catch(e) {}
      }
      const id = newId();
      const newPos = current ? { x: current.position.x + 300, y: current.position.y + 100 } : viewportCenter();
      lastCreatedIdRef.current = id;
      setNodes(nds => nds.concat({
          id, type: 'code', position: newPos, dragHandle: '.tc-code__header', width: 240, height: 200, data: { code: '', language: 'javascript' }, selected: true
      }).map(n => n.id === id ? n : {...n, selected: false}));
      if (current) {
         setEdges(eds => addEdge({ id: `e-${current.id}-${id}`, source: current.id, target: id, type: 'floating' }, eds));
      }
      setTimeout(() => focusNodeByIndex(nodesRef.current.findIndex(n => n.id === id)), 50);
    } else if (ev.type === 'FINGER_4') {
      if (recognitionRef.current) {
         try { recognitionRef.current.stop(); } catch(e) {}
      }
      if (current) {
         setNodes(nds => nds.map(n => n.id === current.id ? {...n, data: {...n.data, editing: false}} : n));
      }
    } else if (ev.type === 'DELETE_PROMPT') {
      setDeletePromptActive(true);
    } else if (ev.type === 'DELETE_CANCEL') {
      setDeletePromptActive(false);
    } else if (ev.type === 'DELETE_CONFIRM') {
      setDeletePromptActive(false);
      if (current) {
          setNodes(nds => nds.filter(n => n.id !== current.id));
          lastCreatedIdRef.current = null;
          setTimeout(() => focusNodeByIndex((activeNodeIndexRef.current - 1 + nodesRef.current.length) % Math.max(1, nodesRef.current.length - 1)), 50);
      }
    }
  }, [getViewport, setViewport, focusNodeByIndex, setNodes, setEdges, viewportCenter, isCanvasLocked]);

  const { videoRef, canvasRef, isReady, error } = useHandTracking(handleGesture);

  // --- board load / save ---------------------------------------------------
  const openBoard = useCallback(
    (board: Board) => {
      const clean = sanitizeBoard(board)
      createdAtRef.current = clean.createdAt
      setBoardId(clean.id)
      setBoardName(clean.name)
      setNodes(clean.nodes)
      setEdges(clean.edges)
      setMru([])
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
      edges: clean.edges
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
        edges: clean.edges
      })
    }, 500)
    return () => clearTimeout(t)
  }, [nodes, edges, boardName, boardId])

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
      setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: getZoom(), duration: 450 })
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
      <style>{`
        ${hoveredNodeId ? `.react-flow__node[data-id="${hoveredNodeId}"] { outline: 4px solid #3b82f6 !important; outline-offset: 4px; border-radius: 8px; z-index: 1000; }` : ''}
      `}</style>
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
          <button onClick={() => setSearchOpen((v) => !v)} title="Search snippets (⌘F)">
            Search
          </button>
          <button onClick={() => {
            setNodes([])
            setEdges([])
            setMru([])
            setCursor(-1)
            activeCodeId.current = null
            setActiveNodeIndex(-1)
          }} title="Clear the canvas">
            Clear
          </button>
          <button onClick={openLibrary}>Boards</button>
          <button onClick={createBoard}>New</button>
          <span className="tc-topbar__sep" />
          <button onClick={() => addTextNode(viewportCenter())}>+ Note</button>
          <button onClick={() => addCodeNode(viewportCenter())}>+ Code</button>
        </div>
      </div>

      <div className="tc-flow" ref={wrapperRef} onDoubleClick={onCanvasDoubleClick}>
        <CameraFeed videoRef={videoRef} canvasRef={canvasRef} isReady={isReady} error={error} />
        {deletePromptActive && (
          <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(255,50,50,0.8)', color: 'white', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold' }}>
             Hold gesture to confirm deletion...
          </div>
        )}
        {isCanvasLocked && (
          <div style={{ position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(0,0,0,0.8)', color: '#00ffcc', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold' }}>
             CANVAS LOCKED (ZOOM TO UNLOCK)
          </div>
        )}
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
          zoomOnPinch={!isCanvasLocked}
          zoomActivationKeyCode={['Meta', 'Control']}
          panOnDrag={!isCanvasLocked}
          nodesDraggable={!isCanvasLocked}
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

      {libraryOpen && (
        <Library
          boards={boardList}
          currentId={boardId}
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
          onClose={() => setSearchOpen(false)}
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
