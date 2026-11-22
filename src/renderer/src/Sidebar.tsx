import { useEffect, useMemo, useState } from 'react'
import type { FilterList, LifelineDocMeta, ProjectList } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { PageList } from './PageList'
import { ProjectPicker } from './ProjectPicker'
import { buildFilterTree, buildTree, pathTo, type TreeNode } from './projectTree'

/** The sidebar view: Lifeline's project tree ("By goal"), or one of the user's filters by id. */
const BY_GOAL = 'by-goal'
const VIEW_KEY = 'quill.sidebarView'

function storedView(): string {
  try {
    return localStorage.getItem(VIEW_KEY) ?? BY_GOAL
  } catch {
    return BY_GOAL
  }
}

export type DocsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; docs: LifelineDocMeta[] }
  | { status: 'error'; error: string }

interface Props {
  configured: boolean
  projects: ProjectList | null
  projectsError: string | null
  filters: FilterList | null
  pages: PageMeta[]
  /** The open folder: a Lifeline project id, or null for Unfiled. */
  folderId: string | null
  currentPageId: string | null
  docs: DocsState
  openDocId: string | null
  onSelectFolder(id: string | null): void
  onSelectPage(id: string): void
  onCreatePage(): void
  onRenamePage(id: string, name: string): void
  onRemovePage(id: string): void
  onOpenDoc(id: string): void
}

/** Quill's folders are Lifeline's projects. */
export function Sidebar(props: Props) {
  const { configured, projects, projectsError, filters, pages, folderId } = props
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
  // A filter that's gone (or not loaded yet) falls back to the project tree.
  const filter = view === BY_GOAL ? null : (filters?.filters.find((f) => f.id === view) ?? null)

  const pageCount = useMemo(() => {
    const counts = new Map<string | null, number>()
    for (const p of pages) counts.set(p.projectId, (counts.get(p.projectId) ?? 0) + 1)
    return counts
  }, [pages])

  const tree = useMemo(() => {
    const withPages = new Set(pages.flatMap((p) => (p.projectId ? [p.projectId] : [])))
    return filter ? buildFilterTree(list, filter, withPages, folderId) : buildTree(list, withPages, folderId)
  }, [list, filter, pages, folderId])

  // The open folder can sit in more than one place; its contents show at the first one only.
  const openPath = useMemo(() => (folderId ? pathTo(tree, folderId) : null), [tree, folderId])
  const firstKey = openPath?.at(-1) ?? null

  // Branches start collapsed, except the ones down to the open folder.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const openPathKey = openPath?.join('|') ?? ''
  useEffect(() => {
    if (!openPath) return
    const above = openPath.slice(0, -1)
    setExpanded((prev) => (above.every((k) => prev.has(k)) ? prev : new Set([...prev, ...above])))
    // Keyed on the path's text, not the array, so collapsing a branch by hand sticks.
  }, [openPathKey])
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const contents = <FolderContents {...props} />
  const renderNode = (node: TreeNode) => {
    const open = expanded.has(node.key)
    const chevron =
      node.children.length > 0 ? (
        <button className="chevron" onClick={() => toggle(node.key)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? '▾' : '▸'}
        </button>
      ) : (
        <span className="chevron" />
      )
    const p = node.project
    const selected = p?.id === folderId
    return (
      <li key={node.key}>
        <div
          className={`folder${selected ? ' selected' : ''}${node.group ? ' group' : ''}`}
          style={{ paddingLeft: 6 + node.depth * 14 }}
        >
          {chevron}
          {p ? (
            <button className="folder-name" onClick={() => props.onSelectFolder(p.id)} title={p.name}>
              {p.color && <span className="swatch" style={{ background: p.color }} />}
              <span className="label">{p.name}</span>
              {(pageCount.get(p.id) ?? 0) > 0 && <span className="count">{pageCount.get(p.id)}</span>}
            </button>
          ) : (
            // A filter folder only arranges projects, so it opens and closes rather than being opened.
            <button
              className="folder-name"
              onClick={() => toggle(node.key)}
              title={node.group!.name}
              disabled={node.children.length === 0}
            >
              <span className="label">{node.group!.name}</span>
              {node.children.length === 0 && <span className="count">empty</span>}
            </button>
          )}
        </div>
        {selected && node.key === firstKey && <div style={{ paddingLeft: 20 + node.depth * 14 }}>{contents}</div>}
        {open && node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    )
  }

  const stale = (projects?.stale || filters?.stale) ?? false
  return (
    <aside className="sidebar">
      <header>
        {configured && (filters?.filters.length ?? 0) > 0 ? (
          <select
            className="view-select"
            value={filter ? filter.id : BY_GOAL}
            onChange={(e) => chooseView(e.target.value)}
            aria-label="Arrange folders"
          >
            <option value={BY_GOAL}>By goal</option>
            {filters!.filters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <span>Folders</span>
        )}
        {configured && stale && (
          <span className="chip" title={projects?.error ?? filters?.error}>offline</span>
        )}
      </header>

      {!configured && (
        <p className="note">
          Connect Lifeline to use its projects as folders: add <code>LIFELINE_URL</code> and{' '}
          <code>LIFELINE_TOKEN</code> to Quill's{' '}
          <button className="link" onClick={() => window.quill.app.openEnv()}>.env</button> and restart.
        </p>
      )}
      {configured && projectsError && <p className="note error-text">{projectsError}</p>}
      {configured && list.length > 0 && (
        <ProjectPicker projects={list} placeholder="Find a project…" onPick={(p) => props.onSelectFolder(p.id)} />
      )}

      <ul className="tree">
        {tree.map(renderNode)}
        <li>
          <div className={`folder${folderId === null ? ' selected' : ''}`} style={{ paddingLeft: 6 }}>
            <span className="chevron" />
            <button className="folder-name" onClick={() => props.onSelectFolder(null)}>
              <span className="label unfiled">Unfiled</span>
              {(pageCount.get(null) ?? 0) > 0 && <span className="count">{pageCount.get(null)}</span>}
            </button>
          </div>
          {folderId === null && <div style={{ paddingLeft: 20 }}>{contents}</div>}
        </li>
      </ul>
    </aside>
  )
}

function FolderContents(props: Props) {
  const { pages, folderId, docs } = props
  const inFolder = pages.filter((p) => p.projectId === folderId)
  const fromQuill = new Set(pages.flatMap((p) => (p.lifeline ? [p.lifeline.docId] : [])))
  return (
    <div className="folder-contents">
      <PageList
        pages={inFolder}
        currentId={props.currentPageId}
        onSelect={props.onSelectPage}
        onCreate={props.onCreatePage}
        onRename={props.onRenamePage}
        onRemove={props.onRemovePage}
      />
      {folderId !== null && props.configured && (
        <div className="docs">
          <div className="docs-heading">In Lifeline</div>
          {docs.status === 'loading' && <p className="muted small">Loading docs…</p>}
          {docs.status === 'error' && <p className="muted small error-text">{docs.error}</p>}
          {docs.status === 'ok' && docs.docs.length === 0 && <p className="muted small">No docs yet.</p>}
          {docs.status === 'ok' && (
            <ul>
              {docs.docs.map((d) => (
                <li key={d.id}>
                  <button
                    className={`doc${d.id === props.openDocId ? ' current' : ''}`}
                    onClick={() => props.onOpenDoc(d.id)}
                    title={d.title}
                  >
                    <span className="label">{d.title}</span>
                    {fromQuill.has(d.id) && <span className="from-quill" title="Saved from a Quill page">✎</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
