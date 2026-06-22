import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { SearchMode, SearchResult, TagInfo } from '../lib/boards'

type Props = {
  currentBoardId: string | null
  onOpenSnippet: (boardId: string, nodeId: string) => void
  onClose: () => void
}

// Cap how many tag chips we render at once (filter narrows it as you type).
const MAX_SUGGEST = 60

const firstLines = (code: string, n = 6): string =>
  code.split('\n').slice(0, n).join('\n').trim()

// Render an FTS5 excerpt, turning the ⟦…⟧ match markers into <mark> spans.
function Excerpt({ text }: { text: string }): JSX.Element {
  const segs = text.split(/⟦|⟧/)
  return (
    <code className="tc-search__code">
      {segs.map((s, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="tc-search__hit">
            {s}
          </mark>
        ) : (
          <span key={i}>{s}</span>
        )
      )}
    </code>
  )
}

export default function SearchPanel({
  currentBoardId,
  onOpenSnippet,
  onClose
}: Props): JSX.Element {
  const [mode, setMode] = useState<SearchMode>('text')
  const [query, setQuery] = useState('') // text mode: search term; tag mode: tag filter
  const [results, setResults] = useState<SearchResult[]>([])
  const [tagInfos, setTagInfos] = useState<TagInfo[]>([]) // ranked tags (usage+recency)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [sel, setSel] = useState(-1) // keyboard-highlighted result
  const inputRef = useRef<HTMLInputElement>(null)
  const selRef = useRef<HTMLDivElement>(null)

  // Focus the search box as soon as the panel opens.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // (Re)load the ranked tag list whenever we enter tag mode, so counts/recency
  // reflect the latest edits.
  useEffect(() => {
    if (mode === 'tag') void window.snippets.listTags().then(setTagInfos)
  }, [mode])

  // Text mode: debounced live full-text search as the query changes. (Tag mode
  // doesn't search on type — typing filters the tag list; picking a tag searches.)
  useEffect(() => {
    if (mode !== 'text') return
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearched(false)
      return
    }
    const t = setTimeout(async () => {
      const r = await window.snippets.search(q, 'text')
      setResults(r)
      setSearched(true)
      setSel(-1) // nothing selected yet; first ↓ opens the top match
    }, 220)
    return () => clearTimeout(t)
  }, [query, mode])

  // Keep the keyboard-highlighted result scrolled into view.
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  // Filter the ranked tags by what's typed (substring, case-insensitive). The
  // list is already ordered by usage then recency from SQL.
  const tagFilter = query.trim().toLowerCase()
  const suggestions =
    mode === 'tag' ? tagInfos.filter((t) => !tagFilter || t.name.includes(tagFilter)) : []
  const shownSuggestions = suggestions.slice(0, MAX_SUGGEST)

  // Navigate to a result but KEEP focus in the search box, so arrow keys keep
  // cycling results instead of the canvas/note swallowing them.
  const openResult = (r: SearchResult): void => {
    onOpenSnippet(r.boardId, r.nodeId)
    inputRef.current?.focus()
  }

  // Tag mode: pick a tag → search snippets carrying it.
  const runTagSearch = async (tag: string): Promise<void> => {
    setActiveTag(tag)
    setSel(-1)
    const r = await window.snippets.search(tag, 'tag')
    setResults(r)
    setSearched(true)
    inputRef.current?.focus()
  }

  const switchMode = (m: SearchMode): void => {
    setMode(m)
    setQuery('')
    setResults([])
    setSearched(false)
    setSel(-1)
    setActiveTag(null)
    inputRef.current?.focus()
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'ArrowDown') {
      if (!results.length) return
      e.preventDefault()
      const next = Math.min(sel + 1, results.length - 1)
      setSel(next)
      openResult(results[next]) // open as you navigate — no Enter needed
    } else if (e.key === 'ArrowUp') {
      if (!results.length) return
      e.preventDefault()
      const next = Math.max(sel - 1, 0)
      setSel(next)
      openResult(results[next])
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[sel]) {
        openResult(results[sel])
      } else if (mode === 'tag' && shownSuggestions[0]) {
        void runTagSearch(shownSuggestions[0].name) // Enter picks the top tag
      } else if (results[0]) {
        openResult(results[0])
      }
    }
  }

  return (
    <div className="tc-search">
      <div className="tc-search__head">
        <span className="tc-search__title">Search snippets</span>
        <span className="tc-search__hint">↑↓ Enter</span>
        <div className="tc-search__spacer" />
        <button className="tc-search__close" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
      </div>

      <div className="tc-search__modes">
        <button className={mode === 'text' ? 'is-active' : ''} onClick={() => switchMode('text')}>
          Text
        </button>
        <button className={mode === 'tag' ? 'is-active' : ''} onClick={() => switchMode('tag')}>
          Tag
        </button>
      </div>

      <input
        ref={inputRef}
        className="tc-search__input"
        value={query}
        spellCheck={false}
        placeholder={mode === 'text' ? 'literal text inside code…' : 'filter tags…'}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />

      {mode === 'tag' && (
        <div className="tc-search__taglist">
          {shownSuggestions.length === 0 ? (
            <span className="tc-search__tagempty">
              {tagInfos.length ? 'No tags match.' : 'No tags yet — add some on a code note.'}
            </span>
          ) : (
            <>
              {shownSuggestions.map((t) => (
                <button
                  key={t.name}
                  className={`tc-search__tagchip ${t.name === activeTag ? 'is-active' : ''}`}
                  // Keep focus in the box so typing keeps filtering.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void runTagSearch(t.name)}
                  title={`${t.count} snippet${t.count === 1 ? '' : 's'}`}
                >
                  #{t.name}
                  <span className="tc-search__tagcount">{t.count}</span>
                </button>
              ))}
              {suggestions.length > MAX_SUGGEST && (
                <span className="tc-search__tagmore">
                  +{suggestions.length - MAX_SUGGEST} more — keep typing
                </span>
              )}
            </>
          )}
        </div>
      )}

      <div className="tc-search__results">
        {searched && results.length === 0 && <div className="tc-search__empty">No matches.</div>}
        {results.map((r, i) => {
          const heading = r.title?.trim() || firstLines(r.code, 1) || '(untitled)'
          const onThisBoard = r.boardId === currentBoardId
          return (
            <div
              className={`tc-search__result ${i === sel ? 'is-selected' : ''}`}
              key={`${r.boardId}:${r.nodeId}`}
              ref={i === sel ? selRef : undefined}
              // Prevent the mousedown from moving focus off the search box; the
              // click still fires, so we navigate without losing keyboard control.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openResult(r)}
              onMouseEnter={() => setSel(i)}
              title={onThisBoard ? 'Go to this note' : `Open “${r.boardName}” at this note`}
            >
              <div className="tc-search__rtop">
                <span className="tc-search__lang">{r.language || 'code'}</span>
                <span className="tc-search__heading" title={heading}>
                  {heading}
                </span>
              </div>
              {r.excerpt ? (
                <Excerpt text={r.excerpt} />
              ) : (
                <code className="tc-search__code">{firstLines(r.code)}</code>
              )}
              {r.tags.length > 0 && (
                <div className="tc-search__rtags">
                  {r.tags.map((t) => (
                    <span key={t} className="tc-search__rtag">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
              <div className="tc-search__rfoot">
                <span className="tc-search__board" title={`Board: ${r.boardName}`}>
                  {onThisBoard ? 'this board' : r.boardName}
                </span>
                <span className="tc-search__open" aria-hidden="true">
                  {onThisBoard ? 'Go to ›' : 'Open board ›'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
