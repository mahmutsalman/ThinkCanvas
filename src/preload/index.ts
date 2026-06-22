import { contextBridge } from 'electron'

// Minimal surface for now. The board persists to localStorage in the renderer,
// so no IPC is needed yet. This is where file open/save IPC would go later.
contextBridge.exposeInMainWorld('app', {
  platform: process.platform
})
