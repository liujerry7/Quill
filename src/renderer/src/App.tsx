import { useCallback, useEffect, useState } from 'react'
import type { MarkdownFile } from '../../shared/files'
import type { FilterList, ProjectList } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { Banners } from './Banners'
import { DocView, type Reading } from './DocView'
import { lastPaper, PageView } from './PageView'
import { type DocsState, Sidebar } from './Sidebar'
import { useStoredState } from './storedFlag'

const pagesApi = window.quill.pages
const lifeline = window.quill.lifeline

const MARKDOWN = /\.(md|markdown|mdown|txt)$/i
const filesApi = window.quill.files

// ipcRenderer.invoke wraps errors thrown in main; show just the message.
const cleanError = (err: unknown) =>
  (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/** How long launch waits for Lifeline's running clock before opening the last page instead. */
const CONTEXT_WAIT_MS = 2500

interface Launch {
  pages: PageMeta[]
  configured: boolean
  folderId: string | null
  pageId: string | null
}

// Runs once per app load (StrictMode mounts twice in dev).
const launch: Promise<Launch> = (async () => {
  const [pages, last, configured] = await Promise.all([
    pagesApi.list(),
    pagesApi.getLastOpened(),
    lifeline.isConfigured(),
  ])
  const lastPage = pages.find((p) => p.id === last) ?? pages.at(-1) ?? null

  // Open on whatever Lifeline says you're working on: the running clock's project.
  if (configured) {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), CONTEXT_WAIT_MS))
    const current = await Promise.race([lifeline.currentProjectId(), timeout])
    if (current?.ok && current.value) {
      const folderId = current.value
      const inFolder = pages.filter((p) => p.projectId === folderId)
      const page =
        lastPage?.projectId === folderId
          ? lastPage
          : ([...inFolder].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null)
      return { pages, configured, folderId, pageId: page?.id ?? null }
    }
  }
  return { pages, configured, folderId: lastPage?.projectId ?? null, pageId: lastPage?.id ?? null }
})()

export function App() {
  const [ready, setReady] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [pages, setPages] = useState<PageMeta[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectList | null>(null)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterList | null>(null)
  const [docs, setDocs] = useState<DocsState>({ status: 'idle' })
  const [reading, setReading] = useState<Reading | null>(null)
  const [markdownFiles, setMarkdownFiles] = useState<MarkdownFile[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [sidebar, setSidebar] = useStoredState<'open' | 'closed'>('quill.sidebar', 'open')

  useEffect(() => {
    filesApi.list().then(setMarkdownFiles)
  }, [])

  useEffect(() => {
    let cancelled = false
    launch.then((l) => {
      if (cancelled) return
      setPages(l.pages)
      setConfigured(l.configured)
      setFolderId(l.folderId)
      setCurrentId(l.pageId)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Lifeline's projects are the folders. A stale (cached) list still works offline.
  useEffect(() => {
    if (!configured) return
    let cancelled = false
    lifeline.listProjects().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setProjects(result.value)
        setProjectsError(null)
      } else {
        setProjectsError(result.error)
      }
    })
    // The user's filters arrange those projects; without them the sidebar shows the project tree.
    lifeline.listFilters().then((result) => {
      if (!cancelled && result.ok) setFilters(result.value)
    })
    return () => {
      cancelled = true
    }
  }, [configured])

  const loadDocs = useCallback(
    (projectId: string | null) => {
      if (!configured || !projectId) {
        setDocs({ status: 'idle' })
        return () => {}
      }
      let cancelled = false
      setDocs({ status: 'loading' })
      lifeline.listDocs(projectId).then((result) => {
        if (cancelled) return
        setDocs(result.ok ? { status: 'ok', docs: result.value } : { status: 'error', error: result.error })
      })
      return () => {
        cancelled = true
      }
    },
    [configured],
  )
  useEffect(() => loadDocs(folderId), [folderId, loadDocs])

  useEffect(() => {
    if (currentId) pagesApi.setLastOpened(currentId)
  }, [currentId])

  const selectFolder = useCallback(
    (id: string | null) => {
      setFolderId(id)
      setReading(null)
      // Stay on the current page if it lives here; otherwise open the folder's latest page.
      const inFolder = pages.filter((p) => p.projectId === id)
      if (!inFolder.some((p) => p.id === currentId)) {
        const latest = [...inFolder].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
        setCurrentId(latest?.id ?? null)
      }
    },
    [pages, currentId],
  )

  const selectPage = useCallback((id: string) => {
    setCurrentId(id)
    setReading(null)
  }, [])

  const createPage = useCallback(async () => {
    let page = await pagesApi.create(folderId)
    const paper = lastPaper()
    if (paper !== 'plain') page = await pagesApi.setPaper(page.id, paper)
    setPages((prev) => [...prev, page])
    setCurrentId(page.id)
    setReading(null)
  }, [folderId])

  const replacePage = useCallback((updated: PageMeta) => {
    setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }, [])

  const renamePage = useCallback(
    async (id: string, name: string) => replacePage(await pagesApi.rename(id, name)),
    [replacePage],
  )

  const movePage = useCallback(
    async (id: string, projectId: string | null) => {
      replacePage(await pagesApi.setProject(id, projectId))
      if (id === currentId) setFolderId(projectId) // follow the page to its new folder
    },
    [replacePage, currentId],
  )

  const removePage = useCallback(
    async (id: string) => {
      await pagesApi.remove(id)
      const remaining = pages.filter((p) => p.id !== id)
      setPages(remaining)
      if (id === currentId) {
        const next = remaining.filter((p) => p.projectId === folderId).at(-1)
        setCurrentId(next?.id ?? null)
      }
    },
    [pages, currentId, folderId],
  )

  // After a save the page carries its doc link, and the folder's doc list may have a new doc.
  const afterSave = useCallback(async () => {
    setPages(await pagesApi.list())
    loadDocs(folderId)
  }, [folderId, loadDocs])

  // A Markdown file joins the open folder and opens in the content window.
  const showAdded = useCallback((file: MarkdownFile) => {
    setMarkdownFiles((prev) => (prev.some((f) => f.id === file.id) ? prev : [...prev, file]))
    setReading({ kind: 'file', id: file.id })
    setFileError(null)
  }, [])

  const addFile = useCallback(async () => {
    try {
      const file = await filesApi.pick(folderId)
      if (file) showAdded(file)
    } catch (err) {
      setFileError(cleanError(err))
    }
  }, [folderId, showAdded])

  const removeFile = useCallback(async (id: string) => {
    await filesApi.remove(id)
    setMarkdownFiles((prev) => prev.filter((f) => f.id !== id))
    setReading((r) => (r?.kind === 'file' && r.id === id ? null : r))
  }, [])

  // Drop Markdown files anywhere to add them to the open folder. Other drops (images onto the
  // canvas) pass through to tldraw.
  const allowFileDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
  }
  const dropMarkdown = async (e: React.DragEvent) => {
    const dropped = [...e.dataTransfer.files].filter((f) => MARKDOWN.test(f.name))
    if (dropped.length === 0) return
    e.preventDefault()
    e.stopPropagation() // keep tldraw from also dropping them onto the canvas
    for (const f of dropped) {
      const filePath = filesApi.pathForFile(f)
      if (!filePath) continue
      try {
        showAdded(await filesApi.add(filePath, folderId))
      } catch (err) {
        setFileError(cleanError(err))
      }
    }
  }

  if (!ready) return <div className="loading">Opening Quill…</div>

  const page = pages.find((p) => p.id === currentId) ?? null
  const folderName =
    folderId === null ? 'Unfiled' : (projects?.projects.find((p) => p.id === folderId)?.name ?? 'this project')

  return (
    <div className="app" onDragOver={allowFileDrop} onDropCapture={dropMarkdown}>
      <Banners />
      {sidebar === 'closed' ? (
        <aside className="rail">
          <button className="icon-button" onClick={() => setSidebar('open')} aria-label="Show folders" title="Show folders">
            ☰
          </button>
        </aside>
      ) : (
        <Sidebar
          onHide={() => setSidebar('closed')}
          configured={configured}
          projects={projects}
          projectsError={projectsError}
          filters={filters}
          pages={pages}
          markdownFiles={markdownFiles}
          folderId={folderId}
          currentPageId={reading ? null : currentId}
          reading={reading}
          fileError={fileError}
          docs={docs}
          onSelectFolder={selectFolder}
          onSelectPage={selectPage}
          onCreatePage={createPage}
          onRenamePage={renamePage}
          onRemovePage={removePage}
          onOpenDoc={(docId) => setReading({ kind: 'lifeline', docId })}
          onOpenFile={(id) => setReading({ kind: 'file', id })}
          onAddFile={addFile}
          onRemoveFile={removeFile}
        />
      )}
      {reading ? (
        // Docs and Markdown files open in the content window, read-only.
        <DocView reading={reading} closeLabel={page ? 'Back to page' : 'Close'} onClose={() => setReading(null)} />
      ) : page ? (
        // Keyed by page so each page gets a fresh editor, store and transcript.
        <PageView
          key={page.id}
          page={page}
          configured={configured}
          projects={projects?.projects ?? []}
          onMove={(projectId) => movePage(page.id, projectId)}
          onSaved={afterSave}
          onChange={replacePage}
        />
      ) : (
        <div className="empty">
          <p>No pages in {folderName} yet.</p>
          <button className="primary" onClick={createPage}>+ New page</button>
        </div>
      )}
    </div>
  )
}
