// A Quill page: one tldraw canvas of ink plus Claude's (hand-corrected) transcription.
// Its metadata lives in the page index; its ink and transcript live in their own files.

/** Where a page's transcript was last saved in Lifeline. */
export interface LifelineLink {
  docId: string
  /** SHA-256 of the body Quill last wrote, to notice edits made in Lifeline since. */
  bodyHash: string
  savedAt: string
}

export interface PageMeta {
  id: string
  name: string
  /** The Lifeline project this page is filed in (its folder); null = Unfiled. */
  projectId: string | null
  lifeline: LifelineLink | null
  createdAt: string
  updatedAt: string
}

/** The tldraw document snapshot, stored opaquely (main never looks inside). */
export type PageContent = unknown

export interface PagesApi {
  list(): Promise<PageMeta[]>
  create(projectId: string | null, name?: string): Promise<PageMeta>
  rename(id: string, name: string): Promise<PageMeta>
  /** Move a page to another folder (Lifeline project), or to Unfiled with null. */
  setProject(id: string, projectId: string | null): Promise<PageMeta>
  remove(id: string): Promise<void>
  load(id: string): Promise<PageContent | null>
  save(id: string, content: PageContent): Promise<void>
  /** The page's Markdown transcription (empty string if it has none yet). */
  loadTranscript(id: string): Promise<string>
  saveTranscript(id: string, markdown: string): Promise<void>
  /** The page that was open when Quill last closed, if it still exists. */
  getLastOpened(): Promise<string | null>
  setLastOpened(id: string): Promise<void>
}
