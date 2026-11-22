import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import icon from '../../resources/icon.png?asset'
import * as lifeline from './lifeline'
import * as pages from './pageStore'
import { readInk } from './read'
import { ensureEnvFile, loadEnv, setupStatus } from './setup'
import { checkForUpdates, installUpdate, updateReady } from './updates'

// Test runs point Quill at a scratch data folder so they never touch real notes.
if (process.env.QUILL_USER_DATA) app.setPath('userData', process.env.QUILL_USER_DATA)
loadEnv()

// One Quill per data folder: two copies writing the same notes could undo each other's saves.
// (The installed app and `npm run dev` share %APPDATA%\quill, so this covers both.)
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  start()
}

function registerHandlers() {
  ipcMain.handle('pages:list', () => pages.listPages())
  ipcMain.handle('pages:create', (_e, projectId: string | null, name?: string) => pages.createPage(projectId, name))
  ipcMain.handle('pages:rename', (_e, id: string, name: string) => pages.renamePage(id, name))
  ipcMain.handle('pages:setProject', (_e, id: string, projectId: string | null) => pages.setPageProject(id, projectId))
  ipcMain.handle('pages:remove', (_e, id: string) => pages.removePage(id))
  ipcMain.handle('pages:load', (_e, id: string) => pages.loadPage(id))
  ipcMain.handle('pages:save', (_e, id: string, content: unknown) => pages.savePage(id, content))
  ipcMain.handle('pages:loadTranscript', (_e, id: string) => pages.loadTranscript(id))
  ipcMain.handle('pages:saveTranscript', (_e, id: string, md: string) => pages.saveTranscript(id, md))
  ipcMain.handle('pages:getLastOpened', () => pages.getLastOpened())
  ipcMain.handle('pages:setLastOpened', (_e, id: string) => pages.setLastOpened(id))
  ipcMain.handle('ink:read', (_e, pngBase64: string) => readInk(pngBase64))

  ipcMain.handle('lifeline:isConfigured', () => lifeline.isConfigured())
  ipcMain.handle('lifeline:listProjects', () => lifeline.listProjects())
  ipcMain.handle('lifeline:listFilters', () => lifeline.listFilters())
  ipcMain.handle('lifeline:currentProjectId', () => lifeline.currentProjectId())
  ipcMain.handle('lifeline:listDocs', (_e, projectId: string) => lifeline.listDocs(projectId))
  ipcMain.handle('lifeline:readDoc', (_e, docId: string) => lifeline.readDoc(docId))
  ipcMain.handle('lifeline:savePage', (_e, pageId: string, opts?: { overwrite?: boolean }) =>
    lifeline.savePage(pageId, opts),
  )

  ipcMain.handle('app:setup', () => setupStatus())
  ipcMain.handle('app:openEnv', async () => {
    const error = await shell.openPath(ensureEnvFile())
    if (error) throw new Error(error)
  })
  ipcMain.handle('app:restart', () => {
    app.relaunch()
    app.quit()
  })
  ipcMain.handle('app:updateReady', () => updateReady())
  ipcMain.handle('app:installUpdate', async () => {
    // The installer may close Quill itself, so write pending saves first rather than on close.
    await Promise.all(BrowserWindow.getAllWindows().map(flush))
    installUpdate()
  })
}

/** Windows whose pending saves are written, so they may close without waiting again. */
const flushed = new WeakSet<BrowserWindow>()

/** Ask the window to write its pending saves; resolves when it has (or after 3s, so it can't hang). */
function flush(win: BrowserWindow): Promise<void> {
  if (flushed.has(win) || win.isDestroyed()) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      ipcMain.removeListener('app:flushed', onFlushed)
      flushed.add(win)
      resolve()
    }
    const onFlushed = (e: Electron.IpcMainEvent) => {
      if (e.sender === win.webContents) finish()
    }
    ipcMain.on('app:flushed', onFlushed)
    win.webContents.send('app:flush')
    setTimeout(finish, 3000)
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Quill',
    icon,
    autoHideMenuBar: true,
    backgroundColor: '#f9fafb',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Hold the close until the renderer has written its pending saves.
  win.on('close', (event) => {
    if (flushed.has(win)) return
    event.preventDefault()
    flush(win).then(() => {
      if (!win.isDestroyed()) win.close()
    })
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

function start() {
  // Groups Quill's windows under its own taskbar icon on Windows.
  app.setAppUserModelId('app.quill')

  app.whenReady().then(() => {
    registerHandlers()
    const win = createWindow()
    checkForUpdates(win)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
