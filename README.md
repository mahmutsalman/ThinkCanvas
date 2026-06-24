# ThinkCanvas

A Scapple-style infinite canvas for thinking through ideas (and LeetCode solutions).
Double-click anywhere to drop a note and start typing. Drag a note onto another to
connect them with a live, border-to-border dashed edge. Some notes can be full
**Monaco** code editors — tag them, title them, and search every snippet you've ever
written **across all your boards**.

Built with **Electron + React + React Flow + Monaco**, dark theme, with a
**SQLite (FTS5)** index for cross-board snippet search.

## Gestures

| Action | How |
| --- | --- |
| New text note | Double-click empty canvas (or **+ Note**) |
| New code note | **+ Code** button, or select a note → **To code** |
| Edit a note | Double-click it; **Enter** commits, **Shift+Enter** newline, **Esc** exits |
| Connect two notes | Drag one note onto another and release — it snaps back and an edge appears |
| Label an edge | Double-click it (or select + type); right-click for Edit / Remove |
| Tag a code note | Type in the chip row under the editor — `#greedy`, `#hashmap`, … |
| Title a code note | The title field in the code note's header |
| Search snippets | **⌘F** (or **Search**) → by tag or literal text, across every board |
| Cycle code notes | Click code notes, then press **.** to cycle; **Enter** dives into the editor |
| Tour all code notes | Press **,** to walk every code note in reading order (no click needed); **Shift+,** goes back |
| Move / resize a code note | Drag the colored header bar; select + drag the corner handles |
| Delete | Select a note/edge → **Backspace**/**Delete**, or the node's **Delete** button |
| Pan / Zoom | Drag empty canvas or two-finger scroll; **⌘**+wheel or pinch to zoom |

Boards are saved as JSON files in the app data folder and reload on launch. Every
code note is mirrored into a derived SQLite/FTS5 index so search spans all boards.

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
├── main/
│   ├── index.ts                 Electron main: window + board/snippet IPC
│   └── db.ts                    SQLite/FTS5 search index (schema, sync, queries)
├── preload/index.ts             context bridge (window.boards, window.snippets)
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx             React entry + Monaco offline workers
        ├── App.tsx              the canvas: create / drag-connect / multi-board / search
        ├── components/
        │   ├── TextNode.tsx     borderless type-to-edit note
        │   ├── CodeNode.tsx     Monaco code note (lang, title, tags, line numbers)
        │   ├── FloatingEdge.tsx dashed border-to-border edge with editable label
        │   ├── Library.tsx      board gallery (open / new / delete / rename)
        │   └── SearchPanel.tsx  pinnable cross-board snippet search (tag + text)
        ├── lib/
        │   ├── boards.ts        board types + persistence helpers
        │   ├── codeEditors.ts   live Monaco editor registry (Enter-to-focus)
        │   └── floating-edge-utils.ts   edge geometry (React Flow v12)
        └── styles/global.css    dark theme
```

## How search works

Boards stay the source of truth (JSON files). On every save, each code note is
mirrored into a derived **SQLite** database with an **FTS5** full-text index over
title + code. Searching by **tag** filters via a normalized tag table; searching by
**text** runs a literal FTS5 phrase match with highlighted excerpts — both span every
board, and results jump you straight to the note.

## Ideas / next

- Run a code note (reuse FocusWriter2's language runners) and pin output as a note
- AND-tag filtering and saved tag filters
- Note colors, multi-select drag-connect
- Curved vs straight edges toggle
