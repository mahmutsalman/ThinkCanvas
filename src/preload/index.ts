import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('app', {
  platform: process.platform
})

// Board persistence — each board saved as a JSON file in the app data folder.
contextBridge.exposeInMainWorld('boards', {
  list: () => ipcRenderer.invoke('boards:list'),
  load: (id: string) => ipcRenderer.invoke('boards:load', id),
  save: (board: unknown) => ipcRenderer.invoke('boards:save', board),
  remove: (id: string) => ipcRenderer.invoke('boards:delete', id),
  touch: (id: string) => ipcRenderer.invoke('boards:touch', id)
})

// Cross-board snippet search over the derived SQLite/FTS5 index (read-only;
// all writes flow through boards:save).
contextBridge.exposeInMainWorld('snippets', {
  search: (query: string, mode: 'tag' | 'text') =>
    ipcRenderer.invoke('snippets:search', query, mode),
  listTags: () => ipcRenderer.invoke('tags:list')
})

// Compile & run code snippets. start/cancel are fire-and-forget; progress streams
// back on 'run:event' (subscribe via onEvent). The main-process queue enforces
// one-at-a-time execution.
contextBridge.exposeInMainWorld('runner', {
  start: (req: { nodeId: string; language: string; code: string; setup?: string }) =>
    ipcRenderer.invoke('run:start', req),
  cancel: (nodeId: string) => ipcRenderer.invoke('run:cancel', nodeId),
  onEvent: (cb: (evt: unknown) => void) => {
    const listener = (_e: unknown, evt: unknown): void => cb(evt)
    ipcRenderer.on('run:event', listener)
    return () => ipcRenderer.removeListener('run:event', listener)
  }
})

// Viewer !color theme bridge. The main process watches stream-color.json (written
// by the Twitch daemon) and emits 'stream-color:change'. Renderer subscribes here.
contextBridge.exposeInMainWorld('streamColor', {
  onChange: (cb: (data: { hex?: string; name?: string; reset?: boolean }) => void) => {
    const listener = (_e: unknown, data: unknown): void =>
      cb(data as { hex?: string; name?: string; reset?: boolean })
    ipcRenderer.on('stream-color:change', listener)
    return () => ipcRenderer.removeListener('stream-color:change', listener)
  }
})
