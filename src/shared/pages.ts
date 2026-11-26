import type { CheckResult } from './read'

// A Quill page: one tldraw canvas of ink plus Claude's (hand-corrected) transcription.
// Its metadata lives in the page index; its ink and transcript live in their own files.

/** Where a page's transcript was last saved in Lifeline. */
export interface LifelineLink {
  docId: string
  /** SHA-256 of the body Quill last wrote, to notice edits made in Lifeline since. */
  bodyHash: string
  savedAt: string
}

/** The page's background: blank, ruled lines, or graph paper. */
export type Paper = 'plain' | 'lined' | 'graph'

export interface PageMeta {
  id: string
  name: string
  /** The Lifeline project this page is filed in (its folder); null = Unfiled. */
  projectId: string | null
  lifeline: LifelineLink | null
  createdAt: string
  updatedAt: string
  /** Missing = plain. */
  paper?: Paper
  /** When the ink last changed. */
  inkAt?: string
  /** When the ink was last read automatically (the transcript reflects the ink as of then). */
  readAt?: string
  /**
   * True while the transcript is exactly what Claude last read, so auto-read may replace it;
   * false once it's been edited by hand. Missing (older pages): auto only if it's empty.
   */
  transcriptAuto?: boolean
  /** To-dos (TODO lines) already added to Lifeline from this page, so a later save doesn't repeat them. */
  todos?: string[]
}

/** The tldraw document snapshot, stored opaquely (main never looks inside). */
export type PageContent = unknown

export interface PagesApi {
  list(): Promise<PageMeta[]>
  get(id: string): Promise<PageMeta>
  create(projectId: string | null, name?: string): Promise<PageMeta>
  rename(id: string, name: string): Promise<PageMeta>
  /** Move a page to another folder (Lifeline project), or to Unfiled with null. */
  setProject(id: string, projectId: string | null): Promise<PageMeta>
  remove(id: string): Promise<void>
  load(id: string): Promise<PageContent | null>
  save(id: string, content: PageContent): Promise<void>
  /** The page's Markdown transcription (empty string if it has none yet). */
  loadTranscript(id: string): Promise<string>
  /** Save the transcript. With readAt it's an automatic read of the ink as of then; without, a hand edit. */
  saveTranscript(id: string, markdown: string, readAt?: string): Promise<void>
  /** Claude's checks of the page's work, newest first. */
  loadChecks(id: string): Promise<CheckResult[]>
  /** Forget one check (its marks come off the page in the renderer). */
  removeCheck(id: string, checkId: string): Promise<void>
  setPaper(id: string, paper: Paper): Promise<PageMeta>
  /** The page that was open when Quill last closed, if it still exists. */
  getLastOpened(): Promise<string | null>
  setLastOpened(id: string): Promise<void>
}
