# Status — ThinkCanvas

**Last updated**: 2026-06-23 11:24
**Current phase**: Phase 3 — Theming & collaboration
**Current slice**: Slice 11 — Recall Mode (memorization) + dot-cycle zoom-drift fix (done; in dev)

---

## Last Completed Task
Shipped Recall Mode: Space on a focused code note opens a cinematic full-screen overlay (board dims) with a blank, independent Monaco editor to retype the snippet from memory. Hold Tab to peek at the original (fades in), live typing-test diff coloring (green/red), and a Done/⌘↵ score card (accuracy %, time, stars, streak). Stats persist per note in the board JSON (`data.recall`). Comments are stripped so only code is tested. Also fixed the `.`-cycle zoom drift (camera no longer creeps out over many presses).

## Next Concrete Action
Build search-result keyboard navigation: in the search panel, **Right arrow** = "Go to" the focused result (navigate to it), **Left arrow** = Back (return to where search opened). Replaces having to click the buttons. See `components/SearchPanel.tsx` + the `onOpenSnippet`/`goBackToOrigin` wiring in `App.tsx`.

## Active Blockers
- none

## Open Questions
- Recall: should the peek view still show comments as context-hints (currently stripped everywhere)?
- Comment-stripping is naive (doesn't parse strings) — revisit if a `//`/`#` inside a string gets over-trimmed.
- Cross-board search arrow-land switches boards each time — keep instant or gate behind Enter?

## Recent Decisions (last 5)
- Recall Mode is a modal overlay (mirrors the `.tc-library` pattern); while open, the global canvas key handlers (`.`/Space/Enter, edge-label, ⌘F) bail via `recallActiveRef` so the modal owns the keyboard.
- The two Recall editors need distinct Monaco `path` props — without them Monaco shares one text model and typing mutated the original (the "affects the original" bug).
- Zoom-drift fix: pin the cycling zoom once (`navZoomRef`), reset only on user-initiated `onMoveEnd` — don't re-sample live zoom each `.` press.
- `data.recall` rides along in node data (wholesale save/load, no migration); SQLite index untouched (only indexes code/language/title/tags).
- Themes = the 9 CSS color variables; new overlays must use `var(--*)` to re-skin automatically.
