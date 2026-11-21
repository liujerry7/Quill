import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  LifelineDoc,
  LifelineDocMeta,
  LifelineProject,
  ProjectList,
  Result,
  SaveResult,
} from '../shared/lifeline'
import * as pages from './pageStore'

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

const cacheFile = () => path.join(app.getPath('userData'), 'lifeline', 'projects.json')

export async function listProjects(): Promise<Result<ProjectList>> {
  try {
    const raw = await call<RawProject[]>('list_projects')
    const projects: LifelineProject[] = raw.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      parentIds: p.parent_ids ?? [],
      color: p.color ?? null,
    }))
    await fs.mkdir(path.dirname(cacheFile()), { recursive: true })
    await fs.writeFile(cacheFile(), JSON.stringify(projects), 'utf8')
    return { ok: true, value: { projects, stale: false } }
  } catch (err) {
    const error = err instanceof ToolError ? err.message : `Couldn't reach Lifeline: ${(err as Error).message}`
    try {
      const projects = JSON.parse(await fs.readFile(cacheFile(), 'utf8')) as LifelineProject[]
      return { ok: true, value: { projects, stale: true, error } }
    } catch {
      return { ok: false, error }
    }
  }
}

// ---- context: what Lifeline says you're working on --------------------------------

interface RawSession {
  subject_id: string
  subject_kind: string
  running: boolean
  project_ids?: string[]
}

export function currentProjectId(): Promise<Result<string | null>> {
  return attempt(async () => {
    const running = await call<RawSession[]>('list_time_tracked', { running_only: true, limit: 10 })
    // Most recent first. A clock on a goal has no project, so skip to one that does.
    for (const s of running) {
      const projectId = s.project_ids?.[0] ?? (s.subject_kind === 'project' ? s.subject_id : null)
      if (projectId) return projectId
    }
    return null
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
        return { ok: true, docId: existing.id, created: false }
      }
    }

    const created = await call<{ doc_id: string }>('create_doc', { project_id: page.projectId, title: page.name, body })
    await pages.setPageLink(pageId, { docId: created.doc_id, bodyHash: sha256(body), savedAt: new Date().toISOString() })
    return { ok: true, docId: created.doc_id, created: true }
  } catch (err) {
    const message = (err as Error).message
    return { ok: false, error: err instanceof ToolError ? message : `Couldn't reach Lifeline: ${message}` }
  }
}
