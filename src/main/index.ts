import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import icon from '../../resources/icon.png?asset'
import * as files from './files'
import * as lifeline from './lifeline'
import * as pages from './pageStore'
import { checkWork, readInk } from './read'
import type { CheckReply, CheckResult, PageRegion } from '../shared/read'
import { ensureEnvFile, loadEnv, setupStatus } from './setup'
import { checkForUpdates, installUpdate, updateReady } from './updates'
import type { Paper } from '../shared/pages'

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
  ipcMain.handle('pages:get', (_e, id: string) => pages.getPage(id))
  ipcMain.handle('pages:create', (_e, projectId: string | null, name?: string) => pages.createPage(projectId, name))
  ipcMain.handle('pages:rename', (_e, id: string, name: string) => pages.renamePage(id, name))
  ipcMain.handle('pages:setProject', (_e, id: string, projectId: string | null) => pages.setPageProject(id, projectId))
  ipcMain.handle('pages:remove', (_e, id: string) => pages.removePage(id))
  ipcMain.handle('pages:load', (_e, id: string) => pages.loadPage(id))
  ipcMain.handle('pages:save', (_e, id: string, content: unknown) => pages.savePage(id, content))
  ipcMain.handle('pages:loadTranscript', (_e, id: string) => pages.loadTranscript(id))
  ipcMain.handle('pages:loadChecks', (_e, id: string) => pages.loadChecks(id))
  ipcMain.handle('pages:removeCheck', (_e, id: string, checkId: string) => pages.removeCheck(id, checkId))
  ipcMain.handle('pages:saveTranscript', (_e, id: string, md: string, readAt?: string) =>
    pages.saveTranscript(id, md, typeof readAt === 'string' ? readAt : undefined),
  )
  ipcMain.handle('pages:setPaper', (_e, id: string, paper: Paper) => pages.setPagePaper(id, paper))
  ipcMain.handle('pages:getLastOpened', () => pages.getLastOpened())
  ipcMain.handle('pages:setLastOpened', (_e, id: string) => pages.setLastOpened(id))
  ipcMain.handle('ink:read', (_e, pngBase64: string) => readInk(pngBase64))
  ipcMain.handle(
    'ink:check',
    async (_e, pageId: string, pngBase64: string, transcript: unknown, size: unknown, region: unknown): Promise<CheckReply> => {
      const { width, height } = (size ?? {}) as { width?: unknown; height?: unknown }
      const r = (region ?? {}) as Partial<Record<keyof PageRegion, unknown>>
      const nums = [width, height, r.x, r.y, r.w, r.h]
      if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n)) || (width as number) <= 0 || (height as number) <= 0) {
        return { ok: false, error: "Quill sent the area to check without its size." }
      }
      const result = await checkWork(pngBase64, typeof transcript === 'string' ? transcript : '', {
        width: width as number,
        height: height as number,
      })
      if (!result.ok) return result
      const check: CheckResult = {
        id: randomUUID(),
        region: { x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number },
        markdown: result.markdown,
        marks: result.marks,
        checkedAt: new Date().toISOString(),
      }
      await pages.addCheck(pageId, check)
      return { ok: true, check }
    },
  )

  ipcMain.handle('lifeline:isConfigured', () => lifeline.isConfigured())
  ipcMain.handle('lifeline:listProjects', () => lifeline.listProjects())
  ipcMain.handle('lifeline:listFilters', () => lifeline.listFilters())
  ipcMain.handle('lifeline:currentProjectId', () => lifeline.currentProjectId())
  ipcMain.handle('lifeline:listDocs', (_e, projectId: string) => lifeline.listDocs(projectId))
  ipcMain.handle('lifeline:readDoc', (_e, docId: string) => lifeline.readDoc(docId))
  ipcMain.handle('lifeline:savePage', (_e, pageId: string, opts?: { overwrite?: boolean }) =>
    lifeline.savePage(pageId, opts),
  )

  ipcMain.handle('files:list', () => files.listFiles())
  ipcMain.handle('files:pick', (e, projectId: string | null) => files.pickFile(e.sender, projectId))
  ipcMain.handle('files:add', (_e, file: string, projectId: string | null) => files.addFile(file, projectId))
  ipcMain.handle('files:remove', (_e, id: string) => files.removeFile(id))
  ipcMain.handle('files:read', (_e, id: string) => files.readFile(id))

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
