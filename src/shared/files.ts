// Markdown files from disk, kept in Quill's folders beside pages and shown read-only.

/** A Markdown file added to a Quill folder. Quill keeps only its path; the file stays where it is. */
export interface MarkdownFile {
  id: string
  name: string
  path: string
  /** The Lifeline project (Quill folder) it was added to, or null for Unfiled. */
  projectId: string | null
  addedAt: string
}

/** A Markdown file's contents, read fresh from disk. */
export interface LocalDoc {
  name: string
  markdown: string
  path: string
  modifiedAt: string
}

export interface FilesApi {
  list(): Promise<MarkdownFile[]>
  /** Asks for a Markdown file and adds it to a folder; null if the dialog was cancelled. */
  pick(projectId: string | null): Promise<MarkdownFile | null>
  /** Adds a dropped file (see pathForFile) to a folder. */
  add(path: string, projectId: string | null): Promise<MarkdownFile>
  /** Takes it out of Quill. The file on disk is left alone. */
  remove(id: string): Promise<void>
  read(id: string): Promise<LocalDoc>
  /** The disk path of a dropped File (Electron's webUtils), or "" if it has none. */
  pathForFile(file: File): string
}
