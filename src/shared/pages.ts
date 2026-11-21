// A Quill page: one tldraw canvas of ink. Its metadata lives in the page index;
// its ink lives in its own file as a tldraw document snapshot.

export interface PageMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

/** The tldraw document snapshot, stored opaquely (main never looks inside). */
export type PageContent = unknown

export interface PagesApi {
  list(): Promise<PageMeta[]>
  create(name?: string): Promise<PageMeta>
  rename(id: string, name: string): Promise<PageMeta>
  remove(id: string): Promise<void>
  load(id: string): Promise<PageContent | null>
  save(id: string, content: PageContent): Promise<void>
  /** The page that was open when Quill last closed, if it still exists. */
  getLastOpened(): Promise<string | null>
  setLastOpened(id: string): Promise<void>
}
