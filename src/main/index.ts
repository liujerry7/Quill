import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import * as pages from './pageStore'

function registerPageHandlers() {
  ipcMain.handle('pages:list', () => pages.listPages())
  ipcMain.handle('pages:create', (_e, name?: string) => pages.createPage(name))
  ipcMain.handle('pages:rename', (_e, id: string, name: string) => pages.renamePage(id, name))
  ipcMain.handle('pages:remove', (_e, id: string) => pages.removePage(id))
  ipcMain.handle('pages:load', (_e, id: string) => pages.loadPage(id))
  ipcMain.handle('pages:save', (_e, id: string, content: unknown) => pages.savePage(id, content))
  ipcMain.handle('pages:getLastOpened', () => pages.getLastOpened())
  ipcMain.handle('pages:setLastOpened', (_e, id: string) => pages.setLastOpened(id))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Quill',
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
