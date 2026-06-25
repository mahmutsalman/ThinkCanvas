import { useState } from 'react'
import type { BoardMeta } from '../lib/boards'

// 'viewed'  = most recently opened first (what you studied recently)
// 'updated' = most recently edited first
// 'created' = the order you made them (oldest first)
export type BoardSort = 'viewed' | 'updated' | 'created'

type Props = {
  boards: BoardMeta[]
  currentId: string | null
  sortMode: BoardSort
  onToggleSort: () => void
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onClose: () => void
}

const SORT_LABEL: Record<BoardSort, string> = {
  viewed: 'Recently viewed',
  updated: 'Recently edited',
  created: 'Created order'
}

// The timestamp a given sort mode ranks/groups by.
function tsOf(b: BoardMeta, mode: BoardSort): number {
  if (mode === 'created') return b.createdAt
  if (mode === 'updated') return b.updatedAt
  return b.lastOpenedAt || b.updatedAt
}

// Just the clock time — the calendar date already lives in the group header.
function fmtTime(ms: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// Friendly header for a day: Today / Yesterday / weekday (this week) / full date.
function groupLabel(ms: number): string {
  if (!ms) return 'Undated'
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const d = new Date(ms)
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  const sameYear = new Date().getFullYear() === d.getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}

// Compact "how long ago" badge, for the recency-oriented sort modes.
function relAgo(ms: number): string {
  if (!ms) return ''
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(mo / 12)}y ago`
}

type Group = { key: string; label: string; boards: BoardMeta[] }

export default function Library({
  boards,
  currentId,
  sortMode,
  onToggleSort,
  onOpen,
  onNew,
  onDelete,
  onClose
}: Props): JSX.Element {
  // Live name filter — type "go" / "python" to narrow to matching boards.
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q
    ? boards.filter((b) => (b.name || 'Untitled').toLowerCase().includes(q))
    : boards

  // 'created' reads oldest→newest (the order you made them); the recency modes
  // read newest→oldest (what you touched last, at the top).
  const dir = sortMode === 'created' ? 1 : -1
  const sorted = [...filtered].sort((a, b) => (tsOf(a, sortMode) - tsOf(b, sortMode)) * dir)

  // Bucket the already-ordered list into one group per calendar day. Because the
  // list is pre-sorted, both the groups and the cards inside them stay in order.
  const groups: Group[] = []
  const byKey = new Map<string, Group>()
  for (const b of sorted) {
    const ts = tsOf(b, sortMode)
    const key = String(startOfDay(ts))
    let g = byKey.get(key)
    if (!g) {
      g = { key, label: groupLabel(ts), boards: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.boards.push(b)
  }

  return (
    <div className="tc-library">
      <div className="tc-library__bar">
        <span className="tc-library__title">Your boards</span>
        <span className="tc-library__count">{q ? `${filtered.length}/${boards.length}` : boards.length}</span>
        <button
          className="tc-library__sort"
          onClick={onToggleSort}
          title="Cycle sort: recently viewed → recently edited → created order"
        >
          {SORT_LABEL[sortMode]}
        </button>
        <input
          className="tc-library__search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search boards…"
          spellCheck={false}
          autoFocus
        />
        <div className="tc-library__spacer" />
        <button className="tc-library__new" onClick={onNew}>
          + New board
        </button>
        <button className="tc-library__close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="tc-library__scroll">
        {boards.length === 0 && (
          <div className="tc-library__empty">No saved boards yet — click “+ New board”.</div>
        )}
        {boards.length > 0 && filtered.length === 0 && (
          <div className="tc-library__empty">No boards match “{query.trim()}”.</div>
        )}

        {groups.map((g) => (
          <div className="tc-library__group" key={g.key}>
            <div className="tc-library__group-head">
              <span className="tc-library__group-label">{g.label}</span>
              <span className="tc-library__group-line" />
              <span className="tc-library__group-count">
                {g.boards.length} {g.boards.length === 1 ? 'board' : 'boards'}
              </span>
            </div>

            <div className="tc-library__grid">
              {g.boards.map((b) => {
                const ts = tsOf(b, sortMode)
                return (
                  <div
                    key={b.id}
                    className={`tc-card ${b.id === currentId ? 'is-current' : ''}`}
                    onClick={() => onOpen(b.id)}
                    title={`Open “${b.name || 'Untitled'}”`}
                  >
                    <div className="tc-card__top">
                      <span className="tc-card__name">{b.name || 'Untitled'}</span>
                      {b.id === currentId ? (
                        <span className="tc-card__badge">current</span>
                      ) : (
                        sortMode !== 'created' && (
                          <span className="tc-card__ago">{relAgo(ts)}</span>
                        )
                      )}
                    </div>
                    <div className="tc-card__meta">
                      {b.noteCount} {b.noteCount === 1 ? 'note' : 'notes'} ·{' '}
                      {sortMode === 'created' ? 'made ' : ''}
                      {fmtTime(ts)}
                    </div>
                    <button
                      className="tc-card__del"
                      title="Delete board"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(b.id)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
