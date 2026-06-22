# Status — ThinkCanvas

**Last updated**: 2026-06-22 13:35
**Current phase**: Phase 1 — Core canvas MVP
**Current slice**: Slice 05 — Multi-board saving + Library (done; bugfixing)

---

## Last Completed Task
Multi-board saving: each board is a JSON file in userData/boards, autosaved; top-bar board title (rename) + Boards library (open/new/delete) + legacy migration. Fixed a duplicate-board bug (non-idempotent StrictMode double-init).

## Next Concrete Action
Hunting a second user-reported bug (no hints given). Prime suspect: viewport (pan/zoom) not reset when switching boards, so a board can open off-screen/blank.

## Active Blockers
- none

## Open Questions
- Strip transient `selected` from nodes on save (boards currently reopen with a node pre-selected)?
- Should opening a board fitView/reset the camera?

## Recent Decisions (last 3)
- Boards persisted as JSON files via Electron IPC (userData/boards), not localStorage.
- Startup board-init guarded with a one-shot ref (idempotent under StrictMode).
- Switching/New always saves the current board first.
