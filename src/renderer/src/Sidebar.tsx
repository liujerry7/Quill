import { useEffect, useMemo, useState } from 'react'
import type { MarkdownFile } from '../../shared/files'
import type { FilterList, ProjectList } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import type { Reading } from './DocView'
import { PageList } from './PageList'
import { ProjectPicker } from './ProjectPicker'
import { buildFilterTree, buildTree, pathTo, type TreeNode } from './projectTree'

/**
 * The sidebar view: every page in one list ("None"), Lifeline's project tree ("By goal"), or one
 * of the user's Lifeline filters by id.
 */
const NONE = 'none'
const BY_GOAL = 'by-goal'
const VIEW_KEY = 'quill.sidebarView'
const UNFILED_KEY = 'unfiled'

function storedView(): string {
  try {
    return localStorage.getItem(VIEW_KEY) ?? BY_GOAL
  } catch {
    return BY_GOAL
  }
}

interface Props {
  configured: boolean
  projects: ProjectList | null
  projectsError: string | null
  filters: FilterList | null
  pages: PageMeta[]
  markdownFiles: MarkdownFile[]
  /** The project the open page is in (null for Unfiled). */
  folderId: string | null
  currentPageId: string | null
  /** The Markdown file open in the content window, if any. */
  reading: Reading | null
  /** Why adding a Markdown file failed, if it did. */
  fileError: string | null
  /** A project picked from search: it becomes the current one and opens in the list. */
  onSelectFolder(id: string | null): void
  onSelectPage(id: string): void
  /** A new page in that project (null for Unfiled). */
  onCreatePage(projectId: string | null): void
  onRenamePage(id: string, name: string): void
  onRemovePage(id: string): void
  onOpenFile(id: string): void
  onRemoveFile(id: string): void
  /** Collapse the sidebar to a thin rail. */
  onHide(): void
}

/**
 * Lifeline's projects, each opening to the Quill pages in it. Quill only reads the projects:
 * it never renames, moves or deletes one.
 */
export function Sidebar(props: Props) {
  const { configured, projects, projectsError, filters, pages, markdownFiles, folderId } = props
  const list = projects?.projects ?? []

  const [view, setView] = useState(storedView)
  const chooseView = (id: string) => {
    setView(id)
    try {
      localStorage.setItem(VIEW_KEY, id)
    } catch {
      // Remembering the view is a convenience; without storage it just resets next launch.
    }
  }
  const filter = view === NONE || view === BY_GOAL ? null : (filters?.filters.find((f) => f.id === view) ?? null)
  // A filter that's gone (or not loaded yet) falls back to the project tree.
  const flat = view === NONE

  const byProject = useMemo(() => {
    const map = new Map<string | null, { pages: PageMeta[]; files: MarkdownFile[] }>()
    const entry = (id: string | null) => {
      let e = map.get(id)
      if (!e) map.set(id, (e = { pages: [], files: [] }))
      return e
    }
    for (const p of pages) entry(p.projectId).pages.push(p)
    for (const f of markdownFiles) entry(f.projectId).files.push(f)
    return map
  }, [pages, markdownFiles])
  const countOf = (id: string | null) => {
    const e = byProject.get(id)
    return e ? e.pages.length + e.files.length : 0
  }

  const tree = useMemo(() => {
    // Projects holding pages or Markdown files always show, so nothing in Quill is out of reach.
    const withPages = new Set([...byProject.keys()].filter((id): id is string => id !== null))
    return filter ? buildFilterTree(list, filter, withPages, folderId) : buildTree(list, withPages, folderId)
  }, [list, filter, byProject, folderId])

  // Everything starts collapsed except the way down to the current project, and that project.
  const openPath = useMemo(() => (folderId ? pathTo(tree, folderId) : [UNFILED_KEY]), [tree, folderId])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const openPathKey = openPath?.join('|') ?? ''
  useEffect(() => {
    if (!openPath) return
    setExpanded((prev) => (openPath.every((k) => prev.has(k)) ? prev : new Set([...prev, ...openPath])))
    // Keyed on the path's text, not the array, so collapsing a branch by hand sticks.
  }, [openPathKey])
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const pageList = (id: string | null, all = false) => {
    const e = all ? { pages, files: markdownFiles } : (byProject.get(id) ?? { pages: [], files: [] })
    const name = (pid: string | null) => (pid === null ? 'Unfiled' : (list.find((p) => p.id === pid)?.name ?? ''))
    return (
      <PageList
        pages={all ? [...e.pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : e.pages}
        files={e.files}
        currentId={props.currentPageId}
        currentFileId={props.reading?.kind === 'file' ? props.reading.id : null}
        folderName={all ? name : undefined}
        onSelect={props.onSelectPage}
        onRename={props.onRenamePage}
        onRemove={props.onRemovePage}
        onSelectFile={props.onOpenFile}
        onRemoveFile={props.onRemoveFile}
      />
    )
  }

  /** One row: a project (or Unfiled) that opens to its pages, or a group that only arranges projects. */
  const row = (opts: {
    key: string
    depth: number
    label: React.ReactNode
    title: string
    projectId?: string | null
    swatch?: string | null
    group?: boolean
    children?: TreeNode[]
  }) => {
    const isProject = opts.projectId !== undefined
    const open = expanded.has(opts.key)
    const kids = opts.children ?? []
    const empty = !isProject && kids.length === 0
    const count = isProject ? countOf(opts.projectId!) : 0
    return (
      <li key={opts.key}>
        <div
          className={`folder${isProject && opts.projectId === folderId ? ' selected' : ''}${opts.group ? ' group' : ''}`}
          style={{ paddingLeft: 4 + opts.depth * 14 }}
        >
          <button
            className="folder-name"
            onClick={() => toggle(opts.key)}
            title={opts.title}
            disabled={empty}
            aria-expanded={empty ? undefined : open}
          >
            <span className="chevron">{empty ? '' : open ? '▾' : '▸'}</span>
            {opts.swatch && <span className="swatch" style={{ background: opts.swatch }} />}
            <span className="label">{opts.label}</span>
            {count > 0 && <span className="count">{count}</span>}
            {empty && <span className="count">empty</span>}
          </button>
          {isProject && (
            <button
              className="add-page"
              onClick={() => {
                setExpanded((prev) => new Set([...prev, opts.key]))
                props.onCreatePage(opts.projectId!)
              }}
              aria-label={`New page in ${opts.title}`}
              title="New page here"
            >
              +
            </button>
          )}
        </div>
        {open && (
          <div className="folder-open">
            {/* A project with sub-projects and no pages just opens to its sub-projects. */}
            {isProject && (count > 0 || kids.length === 0) && (
              <div style={{ paddingLeft: 22 + opts.depth * 14 }}>{pageList(opts.projectId!)}</div>
            )}
            {kids.length > 0 && <ul>{kids.map(renderNode)}</ul>}
          </div>
        )}
      </li>
    )
  }

  const renderNode = (node: TreeNode): React.ReactNode =>
    node.project
      ? row({
          key: node.key,
          depth: node.depth,
          label: node.project.name,
          title: node.project.name,
          projectId: node.project.id,
          swatch: node.project.color,
          children: node.children,
        })
      : row({ key: node.key, depth: node.depth, label: node.group!.name, title: node.group!.name, group: true, children: node.children })

  const stale = (projects?.stale || filters?.stale) ?? false
  return (
    <aside className="sidebar">
      <header>
        <select className="view-select" value={flat ? NONE : filter ? filter.id : BY_GOAL} onChange={(e) => chooseView(e.target.value)} aria-label="Group pages by">
          <option value={NONE}>None</option>
          {configured && <option value={BY_GOAL}>By goal</option>}
          {configured &&
            filters?.filters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
        <span className="header-end">
          {configured && stale && (
            <span className="chip" title={projects?.error ?? filters?.error}>offline</span>
          )}
          <button className="icon-button" onClick={props.onHide} aria-label="Hide sidebar" title="Hide sidebar">
            «
          </button>
        </span>
      </header>

      {!configured && (
        <p className="note">
          Connect Lifeline to file pages in its projects: add <code>LIFELINE_URL</code> and{' '}
          <code>LIFELINE_TOKEN</code> to Quill's{' '}
          <button className="link" onClick={() => window.quill.app.openEnv()}>.env</button> and restart.
        </p>
      )}
      {configured && projectsError && <p className="note error-text">{projectsError}</p>}
      {props.fileError && <p className="note error-text">{props.fileError}</p>}

      {flat || !configured ? (
        <div className="tree">
          <button className="new-page-top" onClick={() => props.onCreatePage(null)}>
            + New page
          </button>
          {pageList(null, true)}
        </div>
      ) : (
        <>
          {list.length > 0 && (
            <ProjectPicker projects={list} placeholder="Find a project…" onPick={(p) => props.onSelectFolder(p.id)} />
          )}
          <ul className="tree">
            {tree.map(renderNode)}
            {row({ key: UNFILED_KEY, depth: 0, label: <span className="unfiled">Unfiled</span>, title: 'Unfiled', projectId: null })}
          </ul>
        </>
      )}
    </aside>
  )
}
