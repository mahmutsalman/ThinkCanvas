import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// --- Monaco offline-worker wiring (mirrors FocusWriter2) -------------------
// Without this, Monaco tries to fetch its workers over the network and the
// editor stays blank inside an Electron renderer. We feed it bundled workers.
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import type { Board, BoardMeta, SearchMode, SearchResult } from './lib/boards'

window.MonacoEnvironment = {
  getWorker(_: string, label: string): Worker {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

// --- Local Storage Polyfills for Web ---
const BOARDS_KEY = 'thinkcanvas:boards'

function getBoards(): Record<string, Board> {
  try {
    return JSON.parse(localStorage.getItem(BOARDS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveBoards(boards: Record<string, Board>) {
  localStorage.setItem(BOARDS_KEY, JSON.stringify(boards))
}

window.boards = {
  list: async (): Promise<BoardMeta[]> => {
    const boards = getBoards()
    return Object.values(boards).map(b => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      noteCount: (b.nodes || []).length
    }))
  },
  load: async (id: string): Promise<Board | null> => {
    return getBoards()[id] || null
  },
  save: async (board: Board): Promise<boolean> => {
    const boards = getBoards()
    boards[board.id] = board
    saveBoards(boards)
    return true
  },
  remove: async (id: string): Promise<boolean> => {
    const boards = getBoards()
    delete boards[id]
    saveBoards(boards)
    return true
  }
}

window.snippets = {
  search: async (query: string, mode: SearchMode): Promise<SearchResult[]> => {
    const boards = getBoards()
    const results: SearchResult[] = []
    const lowerQuery = query.toLowerCase()

    for (const board of Object.values(boards)) {
      for (const node of board.nodes || []) {
        if (node.type === 'code' && node.data) {
          const code = (node.data.code as string) || ''
          const tags = ((node.data.tags as string[]) || []).map(t => t.toLowerCase())
          
          let match = false
          if (mode === 'tag') {
            match = tags.includes(lowerQuery) || tags.some(t => t.includes(lowerQuery))
          } else {
            match = code.toLowerCase().includes(lowerQuery)
          }

          if (match) {
            results.push({
              nodeId: node.id,
              boardId: board.id,
              boardName: board.name,
              language: (node.data.language as string) || 'javascript',
              title: code.split('\n')[0].substring(0, 50),
              code,
              tags: node.data.tags as string[] || []
            })
          }
        }
      }
    }
    return results
  },
  listTags: async (): Promise<string[]> => {
    const boards = getBoards()
    const tagSet = new Set<string>()
    for (const board of Object.values(boards)) {
      for (const node of board.nodes || []) {
        if (node.type === 'code' && Array.isArray(node.data?.tags)) {
          for (const t of node.data.tags) tagSet.add(t.toLowerCase())
        }
      }
    }
    return Array.from(tagSet).sort()
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
