# Status — ThinkCanvas

**Last updated**: 2026-06-22 13:05
**Current phase**: Phase 1 — Core canvas MVP
**Current slice**: Slice 04 — MRU code-note cycler + dive-in editing (done)

---

## Last Completed Task
Left-side MRU cycler for code notes: click auto-adds to the top, `.` / `Shift+.` cycle (center + select, wrapping), Enter dives into the editor at the remembered cursor position, Esc exits back to canvas keys. Cursor persists per note (Monaco instance + saved to data on blur, restored on mount).

## Next Concrete Action
Awaiting next feature request. Candidate polish: chip "remove from list" / number keys to jump, save-on-cursor-move vs blur, file-based board save/open.

## Active Blockers
- none

## Open Questions
- Save cursor on every move vs only on blur (currently blur)?
- File-based save/open instead of localStorage?

## Recent Decisions (last 3)
- MRU = circular ring + cursor (non-destructive), not a stack/queue; code notes only; auto-track on click; cap 8.
- Enter-to-focus reaches the editor via a process-wide registry (lib/codeEditors.ts); Monaco keeps cursor since nodes stay mounted.
- Esc bound inside Monaco to blur (saving cursor) so canvas keys (. / Enter) resume.
