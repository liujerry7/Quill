import type { LifelineProject } from '../../shared/lifeline'

export interface TreeNode {
  project: LifelineProject
  /** Unique per position: a project with two parents appears under both. */
  key: string
  depth: number
  children: TreeNode[]
}

/**
 * The folder tree: active projects (in progress or up next), any project holding Quill pages,
 * the open folder, plus their ancestors so each sits where it does in Lifeline.
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
    if (p.status === 'in_progress' || p.status === 'next' || withPages.has(p.id)) include(p.id)
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

  const byName = (a: LifelineProject, b: LifelineProject) => a.name.localeCompare(b.name)
  const grow = (p: LifelineProject, depth: number, path: string[]): TreeNode => {
    const key = [...path, p.id].join('/')
    const kids = path.includes(p.id) ? [] : (children.get(p.id) ?? []) // guard against a cycle
    return {
      project: p,
      key,
      depth,
      children: [...kids].sort(byName).map((c) => grow(c, depth + 1, [...path, p.id])),
    }
  }
  return roots.sort(byName).map((p) => grow(p, 0, []))
}

/** Every project id above `id` in the tree, so the open folder's branch can start expanded. */
export function ancestorsOf(projects: LifelineProject[], id: string): Set<string> {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const out = new Set<string>()
  const walk = (pid: string) => {
    for (const parent of byId.get(pid)?.parentIds ?? []) {
      if (!out.has(parent)) {
        out.add(parent)
        walk(parent)
      }
    }
  }
  walk(id)
  return out
}
