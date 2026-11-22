import { app, BrowserWindow, dialog, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LocalDoc, MarkdownFile } from '../shared/files'

// Markdown files added to Quill's folders. Quill stores only where each file is, in
// userData/markdown.json, and reads it fresh from disk whenever it's opened.

const MAX_BYTES = 5 * 1024 * 1024
const MARKDOWN = /\.(md|markdown|mdown|txt)$/i

const storeFile = () => path.join(app.getPath('userData'), 'markdown.json')

async function readStore(): Promise<MarkdownFile[]> {
  try {
    return (JSON.parse(await fs.readFile(storeFile(), 'utf8')) as { files: MarkdownFile[] }).files
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

// Edits run one at a time, written via a temp file so a crash can't leave a half-written list.
let queue: Promise<unknown> = Promise.resolve()
function editStore<T>(fn: (files: MarkdownFile[]) => T): Promise<T> {
  const run = queue.then(async () => {
    const files = await readStore()
    const result = fn(files)
    await fs.mkdir(path.dirname(storeFile()), { recursive: true })
    const tmp = `${storeFile()}.${process.pid}.tmp`
    await fs.writeFile(tmp, JSON.stringify({ files }, null, 2), 'utf8')
    await fs.rename(tmp, storeFile())
    return result
  })
  queue = run.catch(() => {})
  return run
}

export const listFiles = () => readStore()

/** Adds a file to a folder (once: adding the same file to the same folder returns the existing entry). */
export async function addFile(file: string, projectId: string | null): Promise<MarkdownFile> {
  const full = path.resolve(file)
  if (!MARKDOWN.test(full)) throw new Error(`${path.basename(full)} isn't a Markdown file.`)
  const stat = await fs.stat(full)
  if (!stat.isFile()) throw new Error(`${path.basename(full)} isn't a file.`)
  return editStore((files) => {
    const existing = files.find((f) => f.projectId === projectId && f.path.toLowerCase() === full.toLowerCase())
    if (existing) return existing
    const entry: MarkdownFile = {
      id: randomUUID(),
      name: path.basename(full),
      path: full,
      projectId,
      addedAt: new Date().toISOString(),
    }
    files.push(entry)
    return entry
  })
}

export async function pickFile(sender: WebContents, projectId: string | null): Promise<MarkdownFile | null> {
  const win = BrowserWindow.fromWebContents(sender)
  const options: Electron.OpenDialogOptions = {
    title: 'Add a Markdown file',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] },
      { name: 'All files', extensions: ['*'] },
    ],
  }
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const file = picked.filePaths[0]
  if (picked.canceled || !file) return null
  return addFile(file, projectId)
}

export function removeFile(id: string): Promise<void> {
  return editStore((files) => {
    const i = files.findIndex((f) => f.id === id)
    if (i >= 0) files.splice(i, 1)
  })
}

/** Reads only files on Quill's list, so the window can't ask for arbitrary paths. */
export async function readFile(id: string): Promise<LocalDoc> {
  const entry = (await readStore()).find((f) => f.id === id)
  if (!entry) throw new Error('That file is no longer in Quill.')
  let stat
  try {
    stat = await fs.stat(entry.path)
  } catch {
    throw new Error(`Can't find ${entry.name} at ${entry.path}. It may have been moved or deleted.`)
  }
  if (stat.size > MAX_BYTES) throw new Error(`${entry.name} is over 5 MB, too big to show.`)
  return {
    name: entry.name,
    markdown: await fs.readFile(entry.path, 'utf8'),
    path: entry.path,
    modifiedAt: stat.mtime.toISOString(),
  }
}
