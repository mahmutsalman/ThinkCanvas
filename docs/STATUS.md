# Status — ThinkCanvas

**Last updated**: 2026-06-22 11:33
**Current phase**: Phase 1 — Core canvas MVP
**Current slice**: Slice 02 — Editable, removable edges (done)

---

## Last Completed Task
Edges are now selectable (orange), carry an editable label (type-to-start / double-click, Enter saves, 11px font), and have a right-click Edit/Remove context menu.

## Next Concrete Action
Implement the next batch of features the user is about to request (TBD next session).

## Active Blockers
- none

## Open Questions
- Should an emptied edge label be explicitly removable vs. just disappearing when blank?
- Move persistence from localStorage to file-based save/open (`.thinkcanvas` JSON via IPC)?

## Recent Decisions (last 3)
- ADR-001 — Electron + React Flow + Monaco stack, mirroring FocusWriter2's offline-worker setup
- Drag-note-onto-note connect gesture snaps the note back (pure connect, no overlap)
- Window drag via a dedicated top bar above the canvas (React Flow pane eats mouse input)
