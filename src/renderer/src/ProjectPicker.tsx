import { useMemo, useState } from 'react'
import type { LifelineProject } from '../../shared/lifeline'

interface Props {
  projects: LifelineProject[]
  placeholder: string
  onPick(project: LifelineProject): void
  /** Called on Escape or when the field is emptied and blurred, if the picker should close. */
  onCancel?(): void
  autoFocus?: boolean
}

const STATUS_ORDER = { in_progress: 0, next: 1, backlog: 2, finished: 3 } as const
const STATUS_LABEL = { in_progress: '', next: 'next', backlog: 'backlog', finished: 'finished' } as const

/** Search every Lifeline project by name (any status). */
export function ProjectPicker({ projects, placeholder, onPick, onCancel, autoFocus }: Props) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return projects
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) ||
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 12)
  }, [projects, query])

  return (
    <div className="picker">
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setQuery('')
            onCancel?.()
          }
          if (e.key === 'Enter' && matches[0]) {
            onPick(matches[0])
            setQuery('')
          }
        }}
      />
      {matches.length > 0 && (
        <ul className="picker-results">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  onPick(p)
                  setQuery('')
                }}
              >
                <span>{p.name}</span>
                {STATUS_LABEL[p.status] && <span className="status">{STATUS_LABEL[p.status]}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
