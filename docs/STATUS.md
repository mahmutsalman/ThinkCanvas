# Status — ThinkCanvas

**Last updated**: 2026-06-24
**Current phase**: Phase 3 — Theming & collaboration
**Current slice**: Slice 13 — Compile & Run code snippets (done; committed) + Recall code view + setup preamble

---

## Last Completed Task
Green **Run** button on code notes — compiles + runs Java/Python/JS/TS/C/C++/Go through a
global FIFO queue (concurrency 1, 10s timeout, output cap) so 20–50 Run clicks can't spawn
20–50 processes; output streams into an ephemeral panel. Bare fragments are auto-wrapped
(class/main/package + imports) with error lines mapped back to the snippet. Recall Mode gained
a **Ctrl+Tab code view** (editable real snippet + Run + boilerplate palette) and a hidden
per-note **setup preamble** (`data.setup`) that runs but isn't graded. Audited all 185 study
notes and auto-filled setup for fragment boards: **18 → 67 passing** (Python 3→44/50,
HashMap 1→8/11). Windows installer via GitHub Actions. Commits `49a468b`, `7b33f4c`.

## Next Concrete Action
Open — none blocking. Candidates: (a) verify the **production** build (`build:mac`, swap the
installed app, re-test JS/TS/Go/Java PATH resolution) and push to confirm the Windows Actions
artifact; (b) review/refine the auto-derived `setup` values per note; (c) second migration
pass for the ArrayList board (richer fixtures).

## Active Blockers
- none

## Open Questions
- Auto-derived setups are generic (`a = [0..9]`, `d = {...}`) — refine generator or hand-edit?
- ArrayList board: 8 notes still fail (need streams / populated maps / adjacency-list fixtures).
- Go fragments: unused-var/import strictness blocks some illustrations — `_ = x` escape hatch or accept?
- TS: runtime-emitting constructs (enums/namespaces) fail under Node type-stripping — bundle `tsx` if needed.
- (carried) Recall peek view: show comments as context-hints or stay comment-free?

## Recent Decisions (last 5)
- Code execution lives in the **main process**, serialized through one FIFO queue (concurrency 1) — the RAM guarantee. Renderer never spawns; output is ephemeral (not persisted to board JSON).
- **Auto-wrap** bare fragments (detected by class/main/package on a comment-stripped copy); run full programs literally. Go splits top-level decls (file scope) from statements (synthesized main).
- **Setup preamble** (`data.setup`) over inline fixtures — keeps memorized `code` pure; Recall grades only `data.code`.
- Toolchain PATH resolved from the user's **login shell** at runtime so a Finder-launched (packaged) build finds NVM node / JDK / Homebrew, matching `npm run dev`.
- Board fixes are **surgical**: only add `setup` to fragment notes; leave reference solutions (Greedy Top-75) and external-dep fragments (Go-syntax board) untouched.
