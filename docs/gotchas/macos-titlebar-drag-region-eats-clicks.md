# Gotcha — macOS title-bar drag region eats clicks on top-of-window controls

**Tags:** electron, macos, css, `-webkit-app-region`, frameless-window
**First hit:** 2026-06-25, the "Recently viewed" sort button in the boards library.
**Severity:** low (cosmetic-feeling) but **high-confusion** — looks like a random/flaky
click bug, so it wastes time. Easy to reproduce, easy to miss in review.

---

## Symptom

A button (or any clickable) that sits near the **top edge of the window** is only
partially clickable:

- Clicking the **bottom half** of the control works.
- Clicking the **top half** does nothing — sometimes it even starts dragging the window.
- Feels intermittent ("sometimes I can click it, sometimes I can't") because whether you
  hit the dead zone depends on the exact Y pixel.

In the boards library it was the `Recently viewed` sort button; the macOS traffic lights
also visually overlapped the "Your boards" title, which is the same root cause showing up
cosmetically.

---

## Root cause

`src/main/index.ts` creates the window with:

```ts
titleBarStyle: 'hiddenInset'
```

That hides the OS title bar but keeps a **system drag strip across the top of the window**
(~28–38px tall, where the traffic lights live). On macOS, Electron decides what is
draggable from the CSS property `-webkit-app-region`:

- `drag`   → the OS swallows mouse-down for window-move. **Clicks never reach the element.**
- `no-drag` → the element is excluded from the drag region and receives clicks normally.

The app's real title bar (`.tc-topbar`) already handles this correctly: it is
`-webkit-app-region: drag` and its buttons are `no-drag`.

The bug appears when you build a **second top-of-window surface** (a modal/overlay bar that
covers the top, like `.tc-library__bar`) and forget the drag/no-drag dance. Even if that bar
declares **no** `-webkit-app-region` at all, the *system* drag strip from `hiddenInset`
still covers the top ~28px of the window — so any control whose top half lands in that strip
loses those clicks. The control isn't broken; the OS is intercepting the pixels above it.

---

## The fix (pattern for ANY top-of-window bar)

1. Make the bar itself the drag handle, **and** explicitly opt every interactive child out:

   ```css
   .tc-library__bar {
     -webkit-app-region: drag;          /* whole bar drags the window  */
     padding-left: 82px;                /* clear the traffic lights     */
   }
   .tc-library__bar button,
   .tc-library__bar input {
     -webkit-app-region: no-drag;       /* …but controls stay clickable */
   }
   ```

   The child rule is the load-bearing part. Declaring `drag` on the bar is optional polish
   (nice draggability); the **`no-drag` on the controls is what restores the clicks**, and
   it is needed even if you never set `drag` anywhere, because `hiddenInset`'s system strip
   is always there.

2. Add left padding (~82px on macOS) so titles/controls don't sit under the traffic lights.

3. If the bar can overlap sticky/elevated content, give it `position: relative; z-index: N`
   above that content too (defensive, not the primary cause here).

See the commit that fixed this for the exact diff (`global.css`, `.tc-library__bar`).

---

## How to catch it next time

- **Reproduce on purpose:** any new bar pinned to the top of the window → click the *top
  edge* of its leftmost/topmost button. If only the bottom responds, it's this.
- **Review checklist for new top bars / modals that reach `top: 0`:**
  - [ ] Interactive children have `-webkit-app-region: no-drag`?
  - [ ] Bar has left inset for the traffic lights (macOS)?
  - [ ] If it's a drag handle, is it `-webkit-app-region: drag`?
- **Grep when something near the top "won't click":**
  ```bash
  grep -rn "app-region\|titleBarStyle" src
  ```
  If `titleBarStyle: 'hiddenInset'` (or `'hidden'`) is set, suspect this first.

## Why it recurs

The working pattern lives on `.tc-topbar`, but every *new* full-width top surface
(library, settings modal, search header, command palette…) is a fresh element that doesn't
inherit `-webkit-app-region`. There is no inheritance and no warning — the OS just quietly
eats the clicks. Treat "new bar touching the top of the window" as the trigger to re-apply
the no-drag rule.
