import type { BoardMeta } from '../lib/boards'

export type BoardSort = 'updated' | 'created'

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

function fmtDate(ms: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

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
  // 'updated' = most recently used first; 'created' = the order you made them.
  const sorted = [...boards].sort((a, b) =>
    sortMode === 'created' ? a.createdAt - b.createdAt : b.updatedAt - a.updatedAt
  )
  return (
    <div className="tc-library">
      <div className="tc-library__bar">
        <span className="tc-library__title">Your boards</span>
        <span className="tc-library__count">{boards.length}</span>
        <button
          className="tc-library__sort"
          onClick={onToggleSort}
          title="Toggle sort order"
        >
          {sortMode === 'created' ? 'Created order' : 'Recently used'}
        </button>
        <div className="tc-library__spacer" />
        <button className="tc-library__new" onClick={onNew}>
          + New board
        </button>
        <button className="tc-library__close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="tc-library__grid">
        {boards.length === 0 && (
          <div className="tc-library__empty">No saved boards yet — click “+ New board”.</div>
        )}
        {sorted.map((b) => (
          <div
            key={b.id}
            className={`tc-card ${b.id === currentId ? 'is-current' : ''}`}
            onClick={() => onOpen(b.id)}
            title={`Open “${b.name || 'Untitled'}”`}
          >
            <div className="tc-card__top">
              <span className="tc-card__name">{b.name || 'Untitled'}</span>
              {b.id === currentId && <span className="tc-card__badge">current</span>}
            </div>
            <div className="tc-card__meta">
              {b.noteCount} {b.noteCount === 1 ? 'note' : 'notes'} ·{' '}
              {sortMode === 'created' ? 'made ' : ''}
              {fmtDate(sortMode === 'created' ? b.createdAt : b.updatedAt)}
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
        ))}
      </div>
    </div>
  )
}
