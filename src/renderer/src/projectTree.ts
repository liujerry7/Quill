import type { FilterFolder, LifelineFilter, LifelineProject } from '../../shared/lifeline'

/** A row in the sidebar tree: a Lifeline project (a Quill folder) or a group that only arranges them. */
export interface TreeNode {
  /** Unique per position: a project can appear in more than one place. */
  key: string
  depth: number
  children: TreeNode[]
  project?: LifelineProject
  group?: { id: string; name: string }
}

const byName = (a: LifelineProject, b: LifelineProject) => a.name.localeCompare(b.name)
/** Every project still open (in progress, up next or backlog) shows, so a page can go anywhere. */
const isOpen = (p: LifelineProject) => p.status !== 'finished'

/**
 * "By goal", Lifeline's own project tree: every unfinished project, any project holding Quill
 * pages, the open folder, plus their ancestors so each sits where it does in Lifeline.
 */
export function buildTree(
  projects: LifelineProject[],
  withPages: ReadonlySet<string>,
  openFolder: string | null,
): TreeNode[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const visible = new Set<string>()
  const include = (id: string, seen = new Set<string>()) => {
    const p = byId.get(id)
    if (!p || seen.has(id)) return
    seen.add(id)
    visible.add(id)
    for (const parent of p.parentIds) include(parent, seen)
  }
  for (const p of projects) {
    if (isOpen(p) || withPages.has(p.id)) include(p.id)
  }
  if (openFolder) include(openFolder)

  const children = new Map<string, LifelineProject[]>()
  const roots: LifelineProject[] = []
  for (const id of visible) {
    const p = byId.get(id)!
    const parents = p.parentIds.filter((parent) => visible.has(parent))
    if (parents.length === 0) roots.push(p)
    for (const parent of parents) children.set(parent, [...(children.get(parent) ?? []), p])
  }

  const grow = (p: LifelineProject, depth: number, path: string[]): TreeNode => {
    const kids = path.includes(p.id) ? [] : (children.get(p.id) ?? []) // guard against a cycle
    return {
      project: p,
      key: [...path, p.id].join('/'),
      depth,
      children: [...kids].sort(byName).map((c) => grow(c, depth + 1, [...path, p.id])),
    }
  }
  return roots.sort(byName).map((p) => grow(p, 0, []))
}

/**
 * One of the user's Lifeline filters: the projects and tasks filed in it (at its top level or in its
 * folders, shown as groups), and under each project its unfinished sub-projects. Everything the
 * filter doesn't place goes in a last group, so every project is reachable from every filter.
 */
export function buildFilterTree(
  projects: LifelineProject[],
  filter: LifelineFilter,
  withPages: ReadonlySet<string>,
  openFolder: string | null,
): TreeNode[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const children = new Map<string, LifelineProject[]>()
  for (const p of projects) for (const parent of p.parentIds) children.set(parent, [...(children.get(parent) ?? []), p])

  const wanted = (p: LifelineProject) => isOpen(p) || withPages.has(p.id) || p.id === openFolder
  // Whether a project, or anything below it, is worth showing.
  const memo = new Map<string, boolean>()
  const worthShowing = (p: LifelineProject): boolean => {
    const known = memo.get(p.id)
    if (known !== undefined) return known
    memo.set(p.id, false) // guard against a cycle
    const result = wanted(p) || (children.get(p.id) ?? []).some(worthShowing)
    memo.set(p.id, result)
    return result
  }

  const placed = new Set<string>()
  const grow = (p: LifelineProject, depth: number, path: string[]): TreeNode => {
    placed.add(p.id)
    const kids = path.includes(p.id) ? [] : (children.get(p.id) ?? []).filter(worthShowing)
    return {
      project: p,
      key: [...path, p.id].join('/'),
      depth,
      children: [...kids].sort(byName).map((c) => grow(c, depth + 1, [...path, p.id])),
    }
  }
  // The user filed these by hand, so show all of them except finished ones nothing points to.
  const filed = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((p): p is LifelineProject => !!p && worthShowing(p)).sort(byName)
  const folder = (f: FilterFolder, depth: number, path: string[]): TreeNode => {
    const here = [...path, f.id]
    const items = filed(f.itemIds)
    return {
      group: { id: f.id, name: f.name },
      key: here.join('/'),
      depth,
      children: [
        ...f.folders.map((sub) => folder(sub, depth + 1, here)),
        ...items.map((p) => grow(p, depth + 1, here)),
      ],
    }
  }

  const nodes = [
    ...filter.folders.map((f) => folder(f, 0, [])),
    ...filed(filter.itemIds ?? []).map((p) => grow(p, 0, [])),
  ]
  // What's left, each at its topmost unplaced project (its sub-projects come along under it).
  const left = new Set(projects.filter((p) => !placed.has(p.id) && worthShowing(p)).map((p) => p.id))
  const elsewhere = projects.filter((p) => left.has(p.id) && !p.parentIds.some((id) => left.has(id)))
  if (elsewhere.length > 0) {
    const key = `elsewhere:${filter.id}`
    nodes.push({
      group: { id: key, name: `Not in “${filter.name}”` },
      key,
      depth: 0,
      children: elsewhere.sort(byName).map((p) => grow(p, 1, [key])),
    })
  }
  return nodes
}

/** Keys from the top of the tree down to the first row for `projectId` (that row's key last). */
export function pathTo(nodes: TreeNode[], projectId: string): string[] | null {
  for (const n of nodes) {
    if (n.project?.id === projectId) return [n.key]
    const below = pathTo(n.children, projectId)
    if (below) return [n.key, ...below]
  }
  return null
}
