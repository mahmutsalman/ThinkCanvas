import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('app', {
  platform: process.platform
})

// Board persistence — each board saved as a JSON file in the app data folder.
contextBridge.exposeInMainWorld('boards', {
  list: () => ipcRenderer.invoke('boards:list'),
  load: (id: string) => ipcRenderer.invoke('boards:load', id),
  save: (board: unknown) => ipcRenderer.invoke('boards:save', board),
  remove: (id: string) => ipcRenderer.invoke('boards:delete', id)
})

// Cross-board snippet search over the derived SQLite/FTS5 index (read-only;
// all writes flow through boards:save).
contextBridge.exposeInMainWorld('snippets', {
  search: (query: string, mode: 'tag' | 'text') =>
    ipcRenderer.invoke('snippets:search', query, mode),
  listTags: () => ipcRenderer.invoke('tags:list')
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
