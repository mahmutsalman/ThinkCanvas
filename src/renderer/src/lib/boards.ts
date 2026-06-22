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

declare global {
  interface Window {
    boards: {
      list: () => Promise<BoardMeta[]>
      load: (id: string) => Promise<Board | null>
      save: (board: Board) => Promise<boolean>
      remove: (id: string) => Promise<boolean>
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

// Reset transient per-node UI state (editing flag) when loading from disk.
export function sanitizeBoard(board: Board): Board {
  const nodes = (board.nodes ?? []).map((n) =>
    n.type === 'text' ? { ...n, data: { ...n.data, editing: false } } : n
  )
  return { ...board, nodes, edges: board.edges ?? [] }
}
