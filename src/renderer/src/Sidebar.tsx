import { useEffect, useMemo, useState } from 'react'
import type { LifelineDocMeta, ProjectList } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { PageList } from './PageList'
import { ProjectPicker } from './ProjectPicker'
import { ancestorsOf, buildTree, type TreeNode } from './projectTree'

export type DocsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; docs: LifelineDocMeta[] }
  | { status: 'error'; error: string }

interface Props {
  configured: boolean
  projects: ProjectList | null
  projectsError: string | null
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
  const { configured, projects, projectsError, pages, folderId } = props
  const list = projects?.projects ?? []

  const pageCount = useMemo(() => {
    const counts = new Map<string | null, number>()
    for (const p of pages) counts.set(p.projectId, (counts.get(p.projectId) ?? 0) + 1)
    return counts
  }, [pages])

  const tree = useMemo(() => {
    const withPages = new Set(pages.flatMap((p) => (p.projectId ? [p.projectId] : [])))
    return buildTree(list, withPages, folderId)
  }, [list, pages, folderId])

  // Branches start collapsed, except the one holding the open folder.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!folderId) return
    const path = ancestorsOf(list, folderId)
    setExpanded((prev) => (([...path].every((id) => prev.has(id))) ? prev : new Set([...prev, ...path])))
  }, [list, folderId])
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const contents = <FolderContents {...props} />
  const renderNode = (node: TreeNode) => {
    const p = node.project
    const open = expanded.has(p.id)
    const selected = p.id === folderId
    return (
      <li key={node.key}>
        <div className={`folder${selected ? ' selected' : ''}`} style={{ paddingLeft: 6 + node.depth * 14 }}>
          {node.children.length > 0 ? (
            <button className="chevron" onClick={() => toggle(p.id)} aria-label={open ? 'Collapse' : 'Expand'}>
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="chevron" />
          )}
          <button className="folder-name" onClick={() => props.onSelectFolder(p.id)} title={p.name}>
            {p.color && <span className="swatch" style={{ background: p.color }} />}
            <span className="label">{p.name}</span>
            {(pageCount.get(p.id) ?? 0) > 0 && <span className="count">{pageCount.get(p.id)}</span>}
          </button>
        </div>
        {selected && node.key === firstKey && <div style={{ paddingLeft: 20 + node.depth * 14 }}>{contents}</div>}
        {open && node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    )
  }

  // The open folder may sit twice in the tree (two parents); show its contents only at the first.
  const firstKey = useMemo(() => {
    let found: string | null = null
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (found) return
        if (n.project.id === folderId) found = n.key
        else walk(n.children)
      }
    }
    walk(tree)
    return found
  }, [tree, folderId])

  return (
    <aside className="sidebar">
      <header>
        <span>Folders</span>
        {configured && projects?.stale && (
          <span className="chip" title={projects.error}>offline</span>
        )}
      </header>

      {!configured && (
        <p className="note">
          Connect Lifeline to use its projects as folders: add <code>LIFELINE_URL</code> and{' '}
          <code>LIFELINE_TOKEN</code> to Quill's <code>.env</code> and restart.
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
