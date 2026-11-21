// Lifeline, as Quill sees it: projects are Quill's folders, docs are where transcripts land.
// Everything goes through Lifeline's own MCP endpoint, so Lifeline needs no changes.

export type ProjectStatus = 'in_progress' | 'next' | 'backlog' | 'finished'

export interface LifelineProject {
  id: string
  name: string
  status: ProjectStatus
  parentIds: string[]
  color: string | null
}

export interface LifelineDocMeta {
  id: string
  title: string
  projectIds: string[]
  updatedAt: string
}

export interface LifelineDoc extends LifelineDocMeta {
  body: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface ProjectList {
  projects: LifelineProject[]
  /** True when Lifeline couldn't be reached and this is the last list Quill saw. */
  stale: boolean
  /** Why it is stale, if it is. */
  error?: string
}

export type SaveResult =
  | { ok: true; docId: string; created: boolean }
  /** `conflict`: the doc changed in Lifeline since Quill last saved it; retry with overwrite to replace it. */
  | { ok: false; error: string; conflict?: boolean }

export interface LifelineApi {
  /** False when LIFELINE_URL / LIFELINE_TOKEN are missing from .env. */
  isConfigured(): Promise<boolean>
  listProjects(): Promise<Result<ProjectList>>
  /** The project of the clock running in Lifeline right now, if any. */
  currentProjectId(): Promise<Result<string | null>>
  listDocs(projectId: string): Promise<Result<LifelineDocMeta[]>>
  readDoc(docId: string): Promise<Result<LifelineDoc>>
  /** Create or update the Lifeline doc for a Quill page from its transcript. */
  savePage(pageId: string, opts?: { overwrite?: boolean }): Promise<SaveResult>
}
