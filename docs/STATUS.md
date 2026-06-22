# Status — ThinkCanvas

**Last updated**: 2026-06-22 16:30
**Current phase**: Phase 2 — Knowledge base (tag + cross-board snippet search)
**Current slice**: Slice 07 — SQLite/FTS5 search + tags + title (implemented; in dev testing)

---

## Last Completed Task
Added a tag + search knowledge base: a derived SQLite/FTS5 index that mirrors every code note on save, inline tag chips + an optional title on code notes, and a pinnable cross-board search panel (tag + literal text, ⌘F). Slices 1–3 committed; DB logic verified by a standalone test.

## Next Concrete Action
User to test in dev (tagging, text/tag search, Open-board centering). Then Slice 4: `npm run build:mac`, reinstall to /Applications, and checkpoint. Code is published to a public GitHub repo for sharing.

## Active Blockers
- none

## Open Questions
- A pre-existing code note only enters the index after its board is saved once (any edit triggers autosave). Backfill all boards on first launch?
- Tag search is OR semantics today — add AND filtering / saved tag filters?
- Reset/fitView the camera when opening a board (notes can be off-screen on switch)?

## Recent Decisions (last 3)
- SQLite/FTS5 is a DERIVED search index; boards JSON stays the source of truth (rebuilt per board on save).
- All writes flow through `boards:save` (tags live in node.data); only two new read-only IPC channels (`snippets:search`, `tags:list`).
- `better-sqlite3` rebuilt for Electron's Node ABI via `electron-builder install-app-deps` (postinstall) + `asarUnpack` for packaging.
