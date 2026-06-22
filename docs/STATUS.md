# Status — ThinkCanvas

**Last updated**: 2026-06-22 18:00
**Current phase**: Phase 2 — Knowledge base (tag + cross-board snippet search)
**Current slice**: Slice 08 — Search keyboard UX + dev-loop hardening (done; in dev)

---

## Last Completed Task
Search panel keyboard UX: ↑/↓ live-navigate results and auto-open each (no Enter), focus stays in the search box, and the orange highlight is reserved for the single selected result (hover is neutral). Plus dev-loop hardening: single-instance lock, unified dev/packaged userData, and a clean single dev process.

## Next Concrete Action
Keep iterating in dev (HMR live). When ready to ship these to the dock app: `npm run build:mac` → reinstall to /Applications → then unregister + delete `dist/` (prevents the duplicate dock icon).

## Active Blockers
- none

## Open Questions
- Cross-board search results switch boards on every arrow-land (heavier than same-board). Keep instant, or require Enter for cross-board jumps only?
- A pre-existing code note only enters the index after its board is saved once (any edit triggers autosave). Backfill all boards on first launch?
- Tag search is OR semantics — add AND filtering / saved tag filters?

## Recent Decisions (last 5)
- Search results auto-open as you arrow (sel starts at -1; first ↓ opens top match); Esc closes and returns focus to canvas.
- Result cards use `onMouseDown` preventDefault so clicking navigates without stealing focus from the search box.
- Single-instance lock (`requestSingleInstanceLock`) in main — a second launch focuses the existing window instead of opening a twin.
- `app.setName('ThinkCanvas')` + `app.setPath('userData', …)` so dev and packaged share one board store (macOS APFS is case-insensitive, so this was belt-and-suspenders here, but protects case-sensitive volumes).
- Dock duplicate root cause: stale LaunchServices registration of the `dist/` bundle (same appId as /Applications). Reinstall flow now deletes `dist/`.
