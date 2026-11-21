import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PageContent, PageMeta } from '../shared/pages'

// Layout under the app's user-data folder:
//   pages/index.json      { pages: PageMeta[], lastOpened: string | null }
//   pages/<id>.json       tldraw document snapshot for that page
//   pages/trash/<id>.json deleted pages, kept so a slip of the pen never loses notes

interface PageIndex {
  pages: PageMeta[]
  lastOpened: string | null
}

const dir = () => path.join(app.getPath('userData'), 'pages')
const indexFile = () => path.join(dir(), 'index.json')
const pageFile = (id: string) => path.join(dir(), `${id}.json`)

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
    await fs.rename(pageFile(id), path.join(trash, `${id}.json`)).catch((err) => {
      // A page that was never drawn on has no ink file; nothing to keep.
      if (err.code !== 'ENOENT') throw err
    })
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
