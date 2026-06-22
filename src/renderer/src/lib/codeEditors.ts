import type { editor } from 'monaco-editor'

// Process-wide registry mapping a code-note id to its live Monaco editor
// instance. React Flow keeps every node mounted, so each editor (and its cursor
// position) survives the whole session — App can reach into the right one to
// focus it when the user presses Enter on a cycled note.
const registry = new Map<string, editor.IStandaloneCodeEditor>()

export function registerEditor(id: string, ed: editor.IStandaloneCodeEditor): void {
  registry.set(id, ed)
}

export function unregisterEditor(id: string): void {
  registry.delete(id)
}

export function getEditor(id: string): editor.IStandaloneCodeEditor | undefined {
  return registry.get(id)
}
