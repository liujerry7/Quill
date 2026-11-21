import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PageContent, PageMeta } from '../shared/pages'

// Layout under the app's user-data folder:
//   pages/index.json      { pages: PageMeta[], lastOpened: string | null }
//   pages/<id>.json       tldraw document snapshot for that page
//   pages/<id>.md         that page's Markdown transcription
//   pages/trash/<id>.*    deleted pages, kept so a slip of the pen never loses notes

interface PageIndex {
  pages: PageMeta[]
  lastOpened: string | null
}

const dir = () => path.join(app.getPath('userData'), 'pages')
const indexFile = () => path.join(dir(), 'index.json')
const pageFile = (id: string) => path.join(dir(), `${id}.json`)
const transcriptFile = (id: string) => path.join(dir(), `${id}.md`)

const ID_PATTERN = /^[0-9a-f-]{36}$/
function checkId(id: string) {
  if (!ID_PATTERN.test(id)) throw new Error(`Bad page id: ${id}`)
}

/** Write via a temp file and rename, so a crash mid-write never leaves a half-written page. */
async function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, file)
}

async function readIndex(): Promise<PageIndex> {
  try {
    return JSON.parse(await fs.readFile(indexFile(), 'utf8')) as PageIndex
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { pages: [], lastOpened: null }
    throw err
  }
}

// Index edits run one at a time so concurrent saves/renames can't overwrite each other.
let indexQueue: Promise<unknown> = Promise.resolve()
function editIndex<T>(fn: (index: PageIndex) => T | Promise<T>): Promise<T> {
  const run = indexQueue.then(async () => {
    await fs.mkdir(dir(), { recursive: true })
    const index = await readIndex()
    const result = await fn(index)
    await writeAtomic(indexFile(), JSON.stringify(index, null, 2))
    return result
  })
  indexQueue = run.catch(() => {})
  return run
}

function findPage(index: PageIndex, id: string): PageMeta {
  const page = index.pages.find((p) => p.id === id)
  if (!page) throw new Error(`No page ${id}`)
  return page
}

export async function listPages(): Promise<PageMeta[]> {
  return (await readIndex()).pages
}

export function createPage(name?: string): Promise<PageMeta> {
  return editIndex((index) => {
    const now = new Date().toISOString()
    const page: PageMeta = {
      id: randomUUID(),
      name: name?.trim() || `Page ${index.pages.length + 1}`,
      createdAt: now,
      updatedAt: now,
    }
    index.pages.push(page)
    return page
  })
}

export function renamePage(id: string, name: string): Promise<PageMeta> {
  checkId(id)
  return editIndex((index) => {
    const page = findPage(index, id)
    page.name = name.trim() || page.name
    page.updatedAt = new Date().toISOString()
    return { ...page }
  })
}

export function removePage(id: string): Promise<void> {
  checkId(id)
  return editIndex(async (index) => {
    findPage(index, id)
    index.pages = index.pages.filter((p) => p.id !== id)
    if (index.lastOpened === id) index.lastOpened = null
    const trash = path.join(dir(), 'trash')
    await fs.mkdir(trash, { recursive: true })
    for (const file of [pageFile(id), transcriptFile(id)]) {
      await fs.rename(file, path.join(trash, path.basename(file))).catch((err) => {
        // A page never drawn on (or never read) has no file of that kind; nothing to keep.
        if (err.code !== 'ENOENT') throw err
      })
    }
  })
}

export async function loadPage(id: string): Promise<PageContent | null> {
  checkId(id)
  try {
    return JSON.parse(await fs.readFile(pageFile(id), 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function savePage(id: string, content: PageContent): Promise<void> {
  checkId(id)
  await editIndex(async (index) => {
    const page = findPage(index, id)
    await writeAtomic(pageFile(id), JSON.stringify(content))
    page.updatedAt = new Date().toISOString()
  })
}

export async function loadTranscript(id: string): Promise<string> {
  checkId(id)
  try {
    return await fs.readFile(transcriptFile(id), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw err
  }
}

export async function saveTranscript(id: string, markdown: string): Promise<void> {
  checkId(id)
  await editIndex(async (index) => {
    const page = findPage(index, id)
    await writeAtomic(transcriptFile(id), markdown)
    page.updatedAt = new Date().toISOString()
  })
}

export async function getLastOpened(): Promise<string | null> {
  const index = await readIndex()
  return index.pages.some((p) => p.id === index.lastOpened) ? index.lastOpened : null
}

export function setLastOpened(id: string): Promise<void> {
  checkId(id)
  return editIndex((index) => {
    index.lastOpened = id
  })
}
