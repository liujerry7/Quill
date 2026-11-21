import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import icon from '../../resources/icon.png?asset'
import * as lifeline from './lifeline'
import * as pages from './pageStore'
import { readInk } from './read'

// Secrets (ANTHROPIC_API_KEY, LIFELINE_TOKEN) come from .env and stay in this process.
try {
  process.loadEnvFile(path.join(app.getAppPath(), '.env'))
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}

// Test runs point Quill at a scratch data folder so they never touch real notes.
if (process.env.QUILL_USER_DATA) app.setPath('userData', process.env.QUILL_USER_DATA)

function registerPageHandlers() {
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

  // Hold the close until the renderer has written its pending saves (3s cap so it can't hang).
  let flushed = false
  win.on('close', (event) => {
    if (flushed) return
    event.preventDefault()
    const finish = () => {
      if (flushed) return
      flushed = true
      ipcMain.removeListener('app:flushed', onFlushed)
      if (!win.isDestroyed()) win.close()
    }
    const onFlushed = (e: Electron.IpcMainEvent) => {
      if (e.sender === win.webContents) finish()
    }
    ipcMain.on('app:flushed', onFlushed)
    win.webContents.send('app:flush')
    setTimeout(finish, 3000)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// Groups Quill's windows under its own taskbar icon on Windows.
app.setAppUserModelId('app.quill')

app.whenReady().then(() => {
  registerPageHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
