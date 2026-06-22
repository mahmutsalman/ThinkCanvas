# Status — ThinkCanvas

**Last updated**: 2026-06-22 18:37
**Current phase**: Phase 2 — Knowledge base (tag + cross-board snippet search)
**Current slice**: Slice 09 — Ranked tag filter + true per-assignment recency (done)

---

## Last Completed Task
Tag mode now has a type-to-filter ranked tag list with two lenses: "Most used" (frequency, from the snippet_tags junction) and "Recent" (true last-assignment time). Added schema v2 (`snippet_tags.assigned_at`) with carry-forward on re-save so recency reflects the real moment a tag was applied, not board saves. Then built + installed to production and pushed.

## Next Concrete Action
Keep iterating in dev (HMR). Open question to decide: cross-board search results switch boards on every arrow-land — keep instant or gate behind Enter?

## Active Blockers
- none

## Open Questions
- Cross-board arrow-land switches boards each time — keep instant or require Enter for cross-board only?
- Backfill all existing boards into the search index on first launch (today a board indexes only after it's saved once)?
- "Recent" recency is precise per assignment now; consider a snippet-level "recently studied" view too?

## Recent Decisions (last 5)
- Tag recency tracked via `snippet_tags.assigned_at` (schema v2), carried forward across re-saves; stamped `now` only for genuinely new tag↔snippet links.
- Tag list ranking is computed (frequency = COUNT junction, recency = MAX assigned_at) — no denormalized counter table.
- Tag mode: typing filters the ranked list; picking a tag runs the snippet search; sort toggle (Most used / Recent) persisted in localStorage.
- Single-instance lock + unified userData (setName/setPath) so dev and packaged share one store and never double-launch.
- Reinstall flow deletes `dist/` + unregisters it from LaunchServices to avoid the duplicate dock icon.
