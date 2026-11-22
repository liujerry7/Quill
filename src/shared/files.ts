// Markdown files from disk, opened read-only.

export interface LocalDoc {
  name: string
  markdown: string
  /** Where it came from, when known (a dropped file's path isn't passed along). */
  path: string | null
  modifiedAt: string | null
}

export interface FilesApi {
  /** Asks for a Markdown file and reads it; null if the dialog was cancelled. */
  openMarkdown(): Promise<LocalDoc | null>
}
