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
