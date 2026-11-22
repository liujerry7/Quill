import { useCallback, useEffect, useState } from 'react'
import type { FilterList, ProjectList } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { Banners } from './Banners'
import { DocView, type Reading } from './DocView'
import { PageView } from './PageView'
import { type DocsState, Sidebar } from './Sidebar'

const pagesApi = window.quill.pages
const lifeline = window.quill.lifeline

const MARKDOWN = /.(md|markdown|mdown|txt)$/i

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
    const page = await pagesApi.create(folderId)
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

  const openFile = useCallback(async () => {
    try {
      const doc = await window.quill.files.openMarkdown()
      if (doc) setReading({ kind: 'file', doc })
    } catch (err) {
      setReading({ kind: 'file', doc: { name: 'Couldn’t open that file', markdown: (err as Error).message, path: null, modifiedAt: null } })
    }
  }, [])

  // Drop a Markdown file anywhere to read it. Other drops (images onto the canvas) pass through.
  const allowFileDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
  }
  const dropMarkdown = async (e: React.DragEvent) => {
    const file = [...e.dataTransfer.files].find((f) => MARKDOWN.test(f.name))
    if (!file) return
    e.preventDefault()
    e.stopPropagation() // keep tldraw from also dropping it onto the canvas
    if (file.size > 5 * 1024 * 1024) return
    setReading({ kind: 'file', doc: { name: file.name, markdown: await file.text(), path: null, modifiedAt: null } })
  }

  if (!ready) return <div className="loading">Opening Quill…</div>

  const page = pages.find((p) => p.id === currentId) ?? null
  const folderName =
    folderId === null ? 'Unfiled' : (projects?.projects.find((p) => p.id === folderId)?.name ?? 'this project')

  return (
    <div className="app" onDragOver={allowFileDrop} onDropCapture={dropMarkdown}>
      <Banners />
      <Sidebar
        configured={configured}
        projects={projects}
        projectsError={projectsError}
        filters={filters}
        pages={pages}
        folderId={folderId}
        currentPageId={currentId}
        docs={docs}
        openDocId={reading?.kind === 'lifeline' ? reading.docId : null}
        onSelectFolder={selectFolder}
        onSelectPage={selectPage}
        onCreatePage={createPage}
        onRenamePage={renamePage}
        onRemovePage={removePage}
        onOpenDoc={(docId) => setReading({ kind: 'lifeline', docId })}
        onOpenFile={openFile}
      />
      {page ? (
        // Keyed by page so each page gets a fresh editor, store and transcript.
        <PageView
          key={page.id}
          page={page}
          configured={configured}
          projects={projects?.projects ?? []}
          reading={reading}
          onCloseReading={() => setReading(null)}
          onMove={(projectId) => movePage(page.id, projectId)}
          onSaved={afterSave}
        />
      ) : reading ? (
        // No page open here: the document gets the whole window.
        <DocView reading={reading} closeLabel="Close" onClose={() => setReading(null)} />
      ) : (
        <div className="empty">
          <p>No pages in {folderName} yet.</p>
          <button className="primary" onClick={createPage}>+ New page</button>
        </div>
      )}
    </div>
  )
}
