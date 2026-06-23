# Status — ThinkCanvas

**Last updated**: 2026-06-23 11:33
**Current phase**: Phase 3 — Theming & collaboration
**Current slice**: Slice 12 — Search-result arrow nav (← back / → go) + "at origin" indicator (done; in dev)

---

## Last Completed Task
Search panel keyboard navigation: **→** jumps to the picked result, **←** returns to where search opened (replaces clicking Back). Added an "at origin" indicator after ← — a glowing banner ("Back at your starting point — press → to return"), the Back button lights up (filled accent), and the selected result drops its highlight. State clears on →, on clicking a result, or on a new query. (Prior slice 11: Recall Mode + dot-cycle zoom-drift fix.)

## Next Concrete Action
Open — awaiting next feature request. Candidate polish: optionally make ←/→ caret-boundary-aware so the query is still editable mid-string; revisit whether the origin banner should be subtler.

## Active Blockers
- none

## Open Questions
- Recall: should the peek view still show comments as context-hints (currently stripped everywhere)?
- Comment-stripping is naive (doesn't parse strings) — revisit if a `//`/`#` inside a string gets over-trimmed.
- Cross-board search arrow-land switches boards each time — keep instant or gate behind Enter?

## Recent Decisions (last 5)
- Search panel treats arrows as navigation (like the existing ↑↓): ←/→ drive back/go unconditionally rather than moving the input caret. `atOrigin` state drives the indicator; cleared on →, click, or new query.
- Recall Mode is a modal overlay (mirrors the `.tc-library` pattern); while open, the global canvas key handlers (`.`/Space/Enter, edge-label, ⌘F) bail via `recallActiveRef` so the modal owns the keyboard.
- The two Recall editors need distinct Monaco `path` props — without them Monaco shares one text model and typing mutated the original (the "affects the original" bug).
- Zoom-drift fix: pin the cycling zoom once (`navZoomRef`), reset only on user-initiated `onMoveEnd` — don't re-sample live zoom each `.` press.
- `data.recall` rides along in node data (wholesale save/load, no migration); SQLite index untouched (only indexes code/language/title/tags).
