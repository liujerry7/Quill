import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  FilterFolder,
  FilterList,
  LifelineDoc,
  LifelineFilter,
  LifelineDocMeta,
  LifelineProject,
  ProjectList,
  Result,
  SaveResult,
  TodoResult,
} from '../shared/lifeline'
import type { PageMeta } from '../shared/pages'
import * as pages from './pageStore'
import { findTodos, todoKey } from './todos'

// Quill is an MCP client of Lifeline's own /mcp endpoint, with a personal access token
// (Settings ▸ AI access). The token stays in this process; the renderer only sees results.

const CALL_TIMEOUT_MS = 15_000

/** A tool refused the call (bad id, archived doc, …), as opposed to Lifeline being unreachable. */
class ToolError extends Error {}

function config(): { url: URL; token: string } | null {
  const raw = process.env.LIFELINE_URL?.trim()
  const token = process.env.LIFELINE_TOKEN?.trim()
  if (!raw || !token) return null
  const url = new URL(raw)
  if (!url.pathname.replace(/\/$/, '').endsWith('/mcp')) url.pathname = `${url.pathname.replace(/\/$/, '')}/mcp`
  return { url, token }
}

export function isConfigured(): boolean {
  return config() !== null
}

let connection: Promise<Client> | null = null
function connect(): Promise<Client> {
  if (!connection) {
    const cfg = config()
    if (!cfg) throw new ToolError('Lifeline isn\'t set up: add LIFELINE_URL and LIFELINE_TOKEN to Quill\'s .env and restart.')
    connection = (async () => {
      const client = new Client({ name: 'quill', version: app.getVersion() })
      const transport = new StreamableHTTPClientTransport(cfg.url, {
        requestInit: { headers: { Authorization: `Bearer ${cfg.token}` } },
      })
      await client.connect(transport, { timeout: CALL_TIMEOUT_MS })
      return client
    })()
    connection.catch(() => {
      connection = null
    })
  }
  return connection
}

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const client = await connect()
  let result
  try {
    result = await client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS })
  } catch (err) {
    connection = null // reconnect on the next call
    throw err
  }
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>
  const text = content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('')
  if (result.isError) throw new ToolError(text || `Lifeline refused ${name}.`)
  return JSON.parse(text) as T
}

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    const message = (err as Error).message
    return { ok: false, error: err instanceof ToolError ? message : `Couldn't reach Lifeline: ${message}` }
  }
}

// ---- projects (cached, so folders still show offline) ----------------------------

interface RawProject {
  id: string
  name: string
  status: LifelineProject['status']
  color?: string | null
  parent_ids?: string[]
}

/**
 * Fetch from Lifeline and keep a copy in userData/lifeline/<name>.json; when Lifeline can't be
 * reached, hand back that copy marked stale.
 */
async function cached<T>(name: string, fetch: () => Promise<T>): Promise<Result<{ value: T; stale: boolean; error?: string }>> {
  const file = path.join(app.getPath('userData'), 'lifeline', `${name}.json`)
  try {
    const value = await fetch()
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(value), 'utf8')
    return { ok: true, value: { value, stale: false } }
  } catch (err) {
    const error = err instanceof ToolError ? err.message : `Couldn't reach Lifeline: ${(err as Error).message}`
    try {
      return { ok: true, value: { value: JSON.parse(await fs.readFile(file, 'utf8')) as T, stale: true, error } }
    } catch {
      return { ok: false, error }
    }
  }
}

export async function listProjects(): Promise<Result<ProjectList>> {
  const result = await cached('projects', async () =>
    (await call<RawProject[]>('list_projects')).map(
      (p): LifelineProject => ({
        id: p.id,
        name: p.name,
        status: p.status,
        parentIds: p.parent_ids ?? [],
        color: p.color ?? null,
      }),
    ),
  )
  if (!result.ok) return result
  const { value, ...rest } = result.value
  return { ok: true, value: { projects: value, ...rest } }
}

// ---- filters: the user's own arrangements of projects into folders ------------------

interface RawFilterFolder {
  id: string
  name: string
  folders?: RawFilterFolder[]
  projects?: { id: string }[]
  /** `via` names the filed project a task is here through; absent when the task is filed directly. */
  tasks?: { id: string; via?: string }[]
}

const toFolder = (f: RawFilterFolder): FilterFolder => ({
  id: f.id,
  name: f.name,
  folders: (f.folders ?? []).map(toFolder),
  itemIds: [...(f.projects ?? []).map((p) => p.id), ...(f.tasks ?? []).filter((t) => !t.via).map((t) => t.id)],
})

/** A filter: its folders, plus (newer Lifeline) projects and tasks filed at its top level. */
interface RawFilter extends RawFilterFolder {
  home?: boolean
}

export async function listFilters(): Promise<Result<FilterList>> {
  const result = await cached('filters', async () =>
    (await call<RawFilter[]>('list_filters')).map((f): LifelineFilter => {
      const top = toFolder(f)
      return { id: f.id, name: f.name, folders: top.folders, itemIds: top.itemIds }
    }),
  )
  if (!result.ok) return result
  const { value, ...rest } = result.value
  return { ok: true, value: { filters: value, ...rest } }
}

// ---- context: what Lifeline says you're working on --------------------------------

interface RawSession {
  /** The project (a leaf "task" in Lifeline's terms) the session is filed on. */
  task_id: string | null
  running: boolean
}

export function currentProjectId(): Promise<Result<string | null>> {
  return attempt(async () => {
    const running = await call<RawSession[]>('list_time_tracked', { running_only: true, limit: 10 })
    // Most recent first; skip any session that isn't filed on a project.
    return running.find((s) => s.task_id)?.task_id ?? null
  })
}

// ---- docs ---------------------------------------------------------------------------

interface RawDoc {
  id: string
  title: string
  project_id: string
  project_ids: string[]
  updated_at: string
  body?: string
}

const toMeta = (d: RawDoc): LifelineDocMeta => ({
  id: d.id,
  title: d.title,
  projectIds: d.project_ids,
  updatedAt: d.updated_at,
})

export function listDocs(projectId: string): Promise<Result<LifelineDocMeta[]>> {
  return attempt(async () => (await call<RawDoc[]>('list_docs', { project_id: projectId })).map(toMeta))
}

export function readDoc(docId: string): Promise<Result<LifelineDoc>> {
  return attempt(async () => {
    const d = await call<RawDoc>('read_doc', { doc_id: docId })
    return { ...toMeta(d), body: d.body ?? '' }
  })
}

// ---- saving a page --------------------------------------------------------------------

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

export async function savePage(pageId: string, opts: { overwrite?: boolean } = {}): Promise<SaveResult> {
  try {
    const page = await pages.getPage(pageId)
    if (!page.projectId) return { ok: false, error: 'Choose a Lifeline project for this page first.' }
    const transcript = (await pages.loadTranscript(pageId)).trim()
    if (!transcript) return { ok: false, error: 'Nothing to save yet: press Read first.' }

    // The footer says where the doc came from; the id lets a later tool find the ink again.
    const body = `${transcript}\n\n---\n*From Quill page "${page.name}" · quill:${page.id}*\n`

    if (page.lifeline) {
      const existing = await call<RawDoc>('read_doc', { doc_id: page.lifeline.docId }).catch((err) => {
        if (err instanceof ToolError) return null // archived or gone in Lifeline: make a new one
        throw err
      })
      if (existing) {
        if (!opts.overwrite && sha256(existing.body ?? '') !== page.lifeline.bodyHash) {
          return {
            ok: false,
            conflict: true,
            error: 'This doc was edited in Lifeline since Quill last saved it. Saving will replace those edits.',
          }
        }
        await call('update_doc', {
          doc_id: existing.id,
          title: page.name,
          body,
          // The page moved folders: move the doc's home too (unless it's already filed there).
          ...(existing.project_ids.includes(page.projectId) ? {} : { project_id: page.projectId }),
        })
        await pages.setPageLink(pageId, { docId: existing.id, bodyHash: sha256(body), savedAt: new Date().toISOString() })
        return { ok: true, docId: existing.id, created: false, todos: await addTodos(page, transcript) }
      }
    }

    const created = await call<{ doc_id: string }>('create_doc', { project_id: page.projectId, title: page.name, body })
    await pages.setPageLink(pageId, { docId: created.doc_id, bodyHash: sha256(body), savedAt: new Date().toISOString() })
    return { ok: true, docId: created.doc_id, created: true, todos: await addTodos(page, transcript) }
  } catch (err) {
    const message = (err as Error).message
    return { ok: false, error: err instanceof ToolError ? message : `Couldn't reach Lifeline: ${message}` }
  }
}

// ---- to-dos: TODO lines become to-dos in the page's project ---------------------------

/**
 * Each TODO on the page becomes a to-do (a project with no sub-projects) under the page's
 * project. One already added from this page, or already in that project by the same name (even
 * if finished), is left alone, so saving again never repeats one.
 */
async function addTodos(page: PageMeta, transcript: string): Promise<TodoResult> {
  const projectId = page.projectId
  if (!projectId) return { added: [] }
  const done = new Set((page.todos ?? []).map(todoKey))
  const wanted = findTodos(transcript).filter((t) => !done.has(todoKey(t)))
  if (wanted.length === 0) return { added: [] }

  const added: string[] = []
  const known: string[] = []
  try {
    const projects = await call<RawProject[]>('list_projects')
    const inProject = new Set(projects.filter((p) => p.parent_ids?.includes(projectId)).map((p) => todoKey(p.name)))
    for (const name of wanted) {
      if (!inProject.has(todoKey(name))) {
        await call('create_project', {
          name,
          parent_ids: [projectId],
          description: `From Quill page "${page.name}" (quill:${page.id})`,
        })
        added.push(name)
      }
      known.push(name)
    }
    return { added }
  } catch (err) {
    const message = (err as Error).message
    return { added, error: err instanceof ToolError ? message : `Couldn't reach Lifeline: ${message}` }
  } finally {
    if (known.length > 0) await pages.addPageTodos(page.id, known)
  }
}
