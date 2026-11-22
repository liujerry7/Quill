import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

// The installed app checks GitHub Releases when it opens. A newer version downloads in the
// background; the window then offers "Restart to update". If that's ignored, it installs the
// next time Quill quits. Running from source there's nothing to update, so this does nothing.

let readyVersion: string | null = null

export function checkForUpdates(win: BrowserWindow): void {
  if (!app.isPackaged) return
  autoUpdater.on('update-downloaded', (info) => {
    readyVersion = info.version
    if (!win.isDestroyed()) win.webContents.send('app:updateReady', info.version)
  })
  // Offline or GitHub down: just try again next launch.
  autoUpdater.on('error', (err) => console.error('[quill] update check failed:', err.message))
  autoUpdater.checkForUpdates().catch(() => {})
}

export const updateReady = () => readyVersion

/** Quit (the window's close still flushes pending saves), install, and reopen. */
export function installUpdate(): void {
  if (readyVersion) autoUpdater.quitAndInstall(false, true)
}
