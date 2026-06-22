# Status — ThinkCanvas

**Last updated**: 2026-06-22 12:23
**Current phase**: Phase 1 — Core canvas MVP
**Current slice**: Slice 03 — Navigation polish (done); Slice 04 — MRU code-note cycler (designing)

---

## Last Completed Task
Navigation polish: Java default + smaller (240x200) code notes, click-a-note-to-center camera, two-finger panning glides over unselected notes (transparent shield blocks Monaco's wheel capture), and Cmd/Ctrl+wheel zooms the canvas even while inside an active code note.

## Next Concrete Action
Design + build the left-side MRU panel: a most-recently-selected code-note list (chips/tags) with a `.`-key cycler that focuses each note in turn and wraps around. Confirm behavior choices first (see open questions).

## Active Blockers
- none

## Open Questions
- MRU cycler: only code notes, or all notes? Does plain selecting auto-add, or only an explicit "pin"?
- `.` direction + reverse key (Shift+. for forward?); list cap size; click-a-chip-to-jump.

## Recent Decisions (last 3)
- Code-note wheel: shield when idle (pan passes through), nowheel when selected (Monaco scrolls), native capture listener for Cmd+wheel zoom.
- Click a note → smooth setCenter glide; skip when already selected (so editing doesn't jerk the camera).
- Java is the default code language; list order Java, Python, JS, C, TS, Rust, …
