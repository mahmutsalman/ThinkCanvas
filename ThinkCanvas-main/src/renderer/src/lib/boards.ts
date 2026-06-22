import type { Node, Edge } from '@xyflow/react'

export type Board = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  nodes: Node[]
  edges: Edge[]
}

export type BoardMeta = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  noteCount: number
}

// One match from the cross-board snippet search (mirrors main/db.ts).
export type SearchResult = {
  nodeId: string
  boardId: string
  boardName: string
  language: string
  title: string
  code: string
  tags: string[]
  excerpt?: string
}

export type SearchMode = 'tag' | 'text'

declare global {
  interface Window {
    boards: {
      list: () => Promise<BoardMeta[]>
      load: (id: string) => Promise<Board | null>
      save: (board: Board) => Promise<boolean>
      remove: (id: string) => Promise<boolean>
    }
    snippets: {
      search: (query: string, mode: SearchMode) => Promise<SearchResult[]>
      listTags: () => Promise<string[]>
    }
  }
}

export const newBoardId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `b_${Date.now()}_${Math.round(Math.random() * 1e6)}`

export function emptyBoard(name = 'Untitled'): Board {
  const now = Date.now()
  return { id: newBoardId(), name, createdAt: now, updatedAt: now, nodes: [], edges: [] }
}

// Strip transient interaction state that must never persist between sessions:
// `selected`/`dragging` on nodes and `selected` on edges. Leaving `selected`
// in a saved board makes a note re-open pre-selected — which, for code notes,
// suppresses the pan-through shield and makes two-finger panning stall over it.
export function stripTransient(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const cleanNodes = nodes.map((n) => {
    const { selected: _s, dragging: _d, ...rest } = n
    return rest as Node
  })
  const cleanEdges = edges.map((e) => {
    const { selected: _s, ...rest } = e
    return rest as Edge
  })
  return { nodes: cleanNodes, edges: cleanEdges }
}

// Clean a board loaded from disk: drop transient interaction state and reset
// the text-note editing flag.
export function sanitizeBoard(board: Board): Board {
  const stripped = stripTransient(board.nodes ?? [], board.edges ?? [])
  const nodes = stripped.nodes.map((n) =>
    n.type === 'text' ? { ...n, data: { ...n.data, editing: false } } : n
  )
  return { ...board, nodes, edges: stripped.edges }
}
