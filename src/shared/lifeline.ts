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

/** A folder in one of the user's Lifeline filters. It arranges projects; it is not a project itself. */
export interface FilterFolder {
  id: string
  name: string
  folders: FilterFolder[]
  /**
   * Projects and tasks filed directly in this folder. A task that is here only through a filed
   * project is left out, since it shows under that project.
   */
  itemIds: string[]
}

/** A filter: one arrangement of all the user's projects into folders ("By product", "By role"…). */
export interface LifelineFilter {
  id: string
  name: string
  folders: FilterFolder[]
}

export interface FilterList {
  filters: LifelineFilter[]
  /** True when Lifeline couldn't be reached and these are the last filters Quill saw. */
  stale: boolean
  error?: string
}

/** What a save did with the page's TODO lines. */
export interface TodoResult {
  /** New to-dos made in the page's project. */
  added: string[]
  /** Set when some couldn't be added (the doc itself was still saved). */
  error?: string
}

export type SaveResult =
  | { ok: true; docId: string; created: boolean; todos: TodoResult }
  /** `conflict`: the doc changed in Lifeline since Quill last saved it; retry with overwrite to replace it. */
  | { ok: false; error: string; conflict?: boolean }

export interface LifelineApi {
  /** False when LIFELINE_URL / LIFELINE_TOKEN are missing from .env. */
  isConfigured(): Promise<boolean>
  listProjects(): Promise<Result<ProjectList>>
  listFilters(): Promise<Result<FilterList>>
  /** The project of the clock running in Lifeline right now, if any. */
  currentProjectId(): Promise<Result<string | null>>
  listDocs(projectId: string): Promise<Result<LifelineDocMeta[]>>
  readDoc(docId: string): Promise<Result<LifelineDoc>>
  /** Create or update the Lifeline doc for a Quill page from its transcript. */
  savePage(pageId: string, opts?: { overwrite?: boolean }): Promise<SaveResult>
}
