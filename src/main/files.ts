import { BrowserWindow, dialog, type WebContents } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LocalDoc } from '../shared/files'

const MAX_BYTES = 5 * 1024 * 1024

/** Only files the user picks in the dialog are read, so the window can't ask for arbitrary paths. */
export async function openMarkdown(sender: WebContents): Promise<LocalDoc | null> {
  const win = BrowserWindow.fromWebContents(sender)
  const options: Electron.OpenDialogOptions = {
    title: 'Open a Markdown file',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] },
      { name: 'All files', extensions: ['*'] },
    ],
  }
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const file = picked.filePaths[0]
  if (picked.canceled || !file) return null

  const stat = await fs.stat(file)
  if (stat.size > MAX_BYTES) throw new Error(`${path.basename(file)} is over 5 MB, too big to show.`)
  return {
    name: path.basename(file),
    markdown: await fs.readFile(file, 'utf8'),
    path: file,
    modifiedAt: stat.mtime.toISOString(),
  }
}
