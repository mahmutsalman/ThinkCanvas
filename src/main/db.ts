import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

// --- SQLite search index -------------------------------------------------
// Boards are the source of truth (JSON files on disk). This database is a
// DERIVED search index: every code note is mirrored here on save so we can
// search across ALL boards by tag or by literal text inside the code (FTS5).
// If a sync ever fails, the board file is still safe — we just rebuild the
// index next save. Never import this module from the renderer.

// Structural shapes (we don't import the renderer's @xyflow types here).
type CodeData = {
  code?: string
  language?: string
  title?: string
  tags?: string[]
}
type BoardNode = {
  id: string
  type?: string
  position?: { x: number; y: number }
  data?: CodeData
}
export type SyncBoard = {
  id: string
  name?: string
  nodes?: BoardNode[]
}

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

export type TagInfo = { name: string; count: number; lastUsed: number }

let db: Database.Database | null = null

const dbPath = (): string => join(app.getPath('userData'), 'thinkcanvas.db')

export function openDatabase(): void {
  if (db) return
  db = new Database(dbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  migrate(db)
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not opened — call openDatabase() first')
  return db
}

export function closeDatabase(): void {
  if (!db) return
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* ignore */
  }
  db.close()
  db = null
}

// --- Schema (v1) ---------------------------------------------------------
function migrate(d: Database.Database): void {
  const version = (d.pragma('user_version', { simple: true }) as number) ?? 0
  if (version >= 1) return

  d.exec(`
    CREATE TABLE IF NOT EXISTS snippets (
      node_id     TEXT PRIMARY KEY,
      board_id    TEXT NOT NULL,
      board_name  TEXT NOT NULL DEFAULT '',
      language    TEXT NOT NULL DEFAULT '',
      title       TEXT NOT NULL DEFAULT '',
      code        TEXT NOT NULL DEFAULT '',
      pos_x       REAL NOT NULL DEFAULT 0,
      pos_y       REAL NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_snippets_board ON snippets(board_id);

    CREATE TABLE IF NOT EXISTS tags (
      id    INTEGER PRIMARY KEY,
      name  TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE IF NOT EXISTS snippet_tags (
      node_id  TEXT NOT NULL REFERENCES snippets(node_id) ON DELETE CASCADE,
      tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (node_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_snippet_tags_tag ON snippet_tags(tag_id);

    -- External-content FTS5 over title+code: stores only the index, keyed by
    -- snippets.rowid. The triggers below keep it exactly in sync — JS never
    -- writes snippets_fts directly (the delete protocol is fiddly).
    CREATE VIRTUAL TABLE IF NOT EXISTS snippets_fts USING fts5(
      title,
      code,
      content='snippets',
      content_rowid='rowid',
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS snippets_ai AFTER INSERT ON snippets BEGIN
      INSERT INTO snippets_fts(rowid, title, code)
      VALUES (new.rowid, new.title, new.code);
    END;

    CREATE TRIGGER IF NOT EXISTS snippets_ad AFTER DELETE ON snippets BEGIN
      INSERT INTO snippets_fts(snippets_fts, rowid, title, code)
      VALUES ('delete', old.rowid, old.title, old.code);
    END;

    CREATE TRIGGER IF NOT EXISTS snippets_au AFTER UPDATE ON snippets BEGIN
      INSERT INTO snippets_fts(snippets_fts, rowid, title, code)
      VALUES ('delete', old.rowid, old.title, old.code);
      INSERT INTO snippets_fts(rowid, title, code)
      VALUES (new.rowid, new.title, new.code);
    END;
  `)
  d.pragma('user_version = 1')
}

// --- Sync: mirror a board's code notes into the index --------------------
// Delete-then-insert per board: a save carries the whole board, so this is
// the simplest correct approach. The snippet_tags cascade + the FTS triggers
// keep tags and the full-text index exact with no extra bookkeeping.
export function syncBoardSnippets(board: SyncBoard): void {
  const d = getDb()
  const now = Date.now()
  const boardName = board.name ?? 'Untitled'

  const delSnips = d.prepare('DELETE FROM snippets WHERE board_id = ?')
  const insSnip = d.prepare(
    `INSERT INTO snippets (node_id, board_id, board_name, language, title, code, pos_x, pos_y, updated_at)
     VALUES (@node_id, @board_id, @board_name, @language, @title, @code, @pos_x, @pos_y, @updated_at)`
  )
  const insTag = d.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
  const tagId = d.prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE')
  const linkTag = d.prepare(
    'INSERT OR IGNORE INTO snippet_tags (node_id, tag_id) VALUES (?, ?)'
  )

  const run = d.transaction((b: SyncBoard) => {
    delSnips.run(b.id)
    for (const node of b.nodes ?? []) {
      if (node.type !== 'code') continue
      const data = node.data ?? {}
      insSnip.run({
        node_id: node.id,
        board_id: b.id,
        board_name: boardName,
        language: data.language ?? '',
        title: data.title ?? '',
        code: data.code ?? '',
        pos_x: node.position?.x ?? 0,
        pos_y: node.position?.y ?? 0,
        updated_at: now
      })
      for (const raw of data.tags ?? []) {
        const name = String(raw).trim().toLowerCase()
        if (!name) continue
        insTag.run(name)
        const row = tagId.get(name) as { id: number } | undefined
        if (row) linkTag.run(node.id, row.id)
      }
    }
  })
  run(board)
}

export function deleteBoardSnippets(boardId: string): void {
  getDb().prepare('DELETE FROM snippets WHERE board_id = ?').run(boardId)
}

// --- Queries -------------------------------------------------------------
const tagsForSnippet = `(
  SELECT group_concat(t2.name, ',')
  FROM snippet_tags st2 JOIN tags t2 ON t2.id = st2.tag_id
  WHERE st2.node_id = s.node_id
)`

function parseTags(csv: string | null): string[] {
  return csv ? csv.split(',').filter(Boolean) : []
}

// Tag search: snippets having ANY of the requested tags (friendlier default).
export function searchByTags(query: string): SearchResult[] {
  const names = query
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').trim().toLowerCase())
    .filter(Boolean)
  if (!names.length) return []

  const placeholders = names.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT s.node_id, s.board_id, s.board_name, s.language, s.title, s.code,
              ${tagsForSnippet} AS tags
       FROM snippets s
       JOIN snippet_tags st ON st.node_id = s.node_id
       JOIN tags t ON t.id = st.tag_id
       WHERE t.name IN (${placeholders})
       GROUP BY s.node_id
       ORDER BY s.updated_at DESC
       LIMIT 200`
    )
    .all(...names) as Array<Record<string, unknown>>

  return rows.map(rowToResult)
}

// Full-text search: literal phrase over title+code, ranked by bm25.
export function searchByText(query: string): SearchResult[] {
  const cleaned = query.trim()
  if (!cleaned) return []
  // Wrap as a quoted FTS5 phrase so code symbols ((, -, :, *) are treated
  // literally, not as query operators. Double internal quotes to escape.
  const match = `"${cleaned.replace(/"/g, '""')}"`

  let rows: Array<Record<string, unknown>>
  try {
    rows = getDb()
      .prepare(
        `SELECT s.node_id, s.board_id, s.board_name, s.language, s.title, s.code,
                ${tagsForSnippet} AS tags,
                snippet(snippets_fts, 1, '⟦', '⟧', '…', 12) AS excerpt
         FROM snippets_fts
         JOIN snippets s ON s.rowid = snippets_fts.rowid
         WHERE snippets_fts MATCH ?
         ORDER BY bm25(snippets_fts)
         LIMIT 200`
      )
      .all(match) as Array<Record<string, unknown>>
  } catch {
    // A malformed MATCH (rare, given the quoting) yields no results rather
    // than crashing the search.
    return []
  }

  return rows.map((r) => ({ ...rowToResult(r), excerpt: (r.excerpt as string) ?? undefined }))
}

// Tags currently in use, ranked for autocomplete: most-used first, ties broken
// by most-recently-used. `count` = how many snippets carry the tag (frequency,
// from the snippet_tags junction). `lastUsed` = newest save of any snippet with
// it (recency, from snippets.updated_at). Both derived — no extra table needed.
export function listTags(): TagInfo[] {
  return getDb()
    .prepare(
      `SELECT t.name AS name,
              COUNT(st.node_id) AS count,
              COALESCE(MAX(s.updated_at), 0) AS lastUsed
       FROM tags t
       JOIN snippet_tags st ON st.tag_id = t.id
       JOIN snippets s ON s.node_id = st.node_id
       GROUP BY t.id
       ORDER BY count DESC, lastUsed DESC, t.name COLLATE NOCASE ASC`
    )
    .all() as TagInfo[]
}

function rowToResult(r: Record<string, unknown>): SearchResult {
  return {
    nodeId: r.node_id as string,
    boardId: r.board_id as string,
    boardName: r.board_name as string,
    language: r.language as string,
    title: r.title as string,
    code: r.code as string,
    tags: parseTags((r.tags as string) ?? null)
  }
}
