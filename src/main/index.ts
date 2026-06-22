import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import {
  openDatabase,
  closeDatabase,
  syncBoardSnippets,
  deleteBoardSnippets,
  searchByTags,
  searchByText,
  listTags,
  type SyncBoard
} from './db'

// --- Board file storage --------------------------------------------------
// Each board is one JSON file under <userData>/boards/<id>.json. No size
// limits, survives crashes/reloads, and the folder can be opened/backed up.
const boardsDir = (): string => join(app.getPath('userData'), 'boards')

async function ensureBoardsDir(): Promise<void> {
  await fs.mkdir(boardsDir(), { recursive: true })
}

function registerBoardIpc(): void {
  ipcMain.handle('boards:list', async () => {
    await ensureBoardsDir()
    const files = await fs.readdir(boardsDir())
    const metas: unknown[] = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        const b = JSON.parse(await fs.readFile(join(boardsDir(), f), 'utf8'))
        metas.push({
          id: b.id,
          name: b.name ?? 'Untitled',
          createdAt: b.createdAt ?? 0,
          updatedAt: b.updatedAt ?? 0,
          noteCount: Array.isArray(b.nodes) ? b.nodes.length : 0
        })
      } catch {
        /* skip unreadable file */
      }
    }
    return metas
  })

  ipcMain.handle('boards:load', async (_e, id: string) => {
    try {
      return JSON.parse(await fs.readFile(join(boardsDir(), `${id}.json`), 'utf8'))
    } catch {
      return null
    }
  })

  ipcMain.handle('boards:save', async (_e, board: SyncBoard & { id: string }) => {
    await ensureBoardsDir()
    await fs.writeFile(join(boardsDir(), `${board.id}.json`), JSON.stringify(board), 'utf8')
    // Mirror code notes into the search index. The board file is already safe,
    // so a sync failure must never fail the save.
    try {
      syncBoardSnippets(board)
    } catch (err) {
      console.error('snippet sync failed', err)
    }
    return true
  })

  ipcMain.handle('boards:delete', async (_e, id: string) => {
    try {
      await fs.unlink(join(boardsDir(), `${id}.json`))
    } catch {
      /* already gone */
    }
    try {
      deleteBoardSnippets(id)
    } catch (err) {
      console.error('snippet delete failed', err)
    }
    return true
  })
}

// Read-only search channels over the derived SQLite index.
function registerSnippetIpc(): void {
  ipcMain.handle('snippets:search', (_e, query: string, mode: 'tag' | 'text') =>
    mode === 'tag' ? searchByTags(query) : searchByText(query)
  )
  ipcMain.handle('tags:list', () => listTags())
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 700,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#14161b',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open any target="_blank" / external links in the system browser, not a new window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Single-instance lock: if another ThinkCanvas is already running, quit this
// one immediately and focus the existing window instead of opening a second
// instance (prevents duplicate windows/processes).
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    openDatabase() // before IPC — the snippet handlers depend on it
    registerBoardIpc()
    registerSnippetIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDatabase()
})
