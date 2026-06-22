# ThinkCanvas

A Scapple-style infinite canvas for thinking through ideas (and LeetCode solutions).
Double-click anywhere to drop a note and start typing. Drag a note onto another to
connect them with a live, border-to-border dashed edge. Some notes can be full
**Monaco** code editors.

Built with **Electron + React + React Flow + Monaco**, dark theme. Mirrors the
proven Electron+Monaco offline-worker setup from FocusWriter2.

## Gestures

| Action | How |
| --- | --- |
| New text note | Double-click empty canvas (or **+ Note**) |
| New code note | **+ Code** button, or select a note → **To code** |
| Edit a note | Double-click it; **Enter** commits, **Shift+Enter** newline, **Esc** exits |
| Connect two notes | Drag one note onto another and release — it snaps back and an edge appears |
| Move a note | Drag it (code notes drag by their header bar) |
| Move a code note | Drag the colored header bar |
| Resize a code note | Select it, drag the corner handles |
| Delete | Select a note/edge → **Backspace**/**Delete**, or the node's **Delete** button |
| Pan | Drag empty canvas, or two-finger scroll |
| Zoom | Pinch, or the bottom-left zoom controls |

The board autosaves to `localStorage` and reloads on launch.

## Run

```bash
cd ThinkCanvas
npm install
npm run dev          # launches the Electron app with hot reload
```

## Package a Mac app

```bash
npm run build:mac    # → dist/
```

## Project layout

```
src/
├── main/index.ts                 Electron main process (window only)
├── preload/index.ts              minimal context bridge
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx              React entry + Monaco offline workers
        ├── App.tsx               the canvas: create / drag-connect / persist
        ├── components/
        │   ├── TextNode.tsx      borderless type-to-edit note
        │   ├── CodeNode.tsx      Monaco editor note (lang dropdown, resizable)
        │   └── FloatingEdge.tsx  dashed border-to-border edge
        ├── lib/floating-edge-utils.ts   edge geometry (React Flow v12)
        └── styles/global.css     dark theme
```

## Ideas / next

- File-based save/open (`.thinkcanvas` JSON) via IPC instead of localStorage
- Run a code note (reuse FocusWriter2's language runners) and pin output as a note
- Edge labels, note colors, multi-select drag-connect
- Curved vs straight edges toggle
