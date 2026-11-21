import { useState } from 'react'
import type { PageMeta } from '../../shared/pages'

interface Props {
  pages: PageMeta[]
  currentId: string | null
  onSelect(id: string): void
  onCreate(): void
  onRename(id: string, name: string): void
  onRemove(id: string): void
}

/** The Quill pages inside one folder. */
export function PageList({ pages, currentId, onSelect, onCreate, onRename, onRemove }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <ul className="page-list">
      {pages.map((page) => (
        <li key={page.id} className={page.id === currentId ? 'current' : ''}>
          {editingId === page.id ? (
            <input
              autoFocus
              defaultValue={page.name}
              onBlur={(e) => {
                onRename(page.id, e.currentTarget.value)
                setEditingId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
          ) : (
            <button
              className="name"
              onClick={() => onSelect(page.id)}
              onDoubleClick={() => setEditingId(page.id)}
              title={page.lifeline ? 'Saved to Lifeline. Double-click to rename' : 'Double-click to rename'}
            >
              {page.name}
              {page.lifeline && <span className="saved-dot" aria-label="saved to Lifeline" />}
            </button>
          )}
          {confirmingId === page.id ? (
            <span className="confirm">
              <button
                onClick={() => {
                  onRemove(page.id)
                  setConfirmingId(null)
                }}
              >
                Delete
              </button>
              <button onClick={() => setConfirmingId(null)}>Keep</button>
            </span>
          ) : (
            <span className="actions">
              <button onClick={() => setEditingId(page.id)} title="Rename">✎</button>
              <button onClick={() => setConfirmingId(page.id)} title="Delete (kept in Quill's trash folder)">×</button>
            </span>
          )}
        </li>
      ))}
      <li>
        <button className="new-page" onClick={onCreate}>+ New page</button>
      </li>
    </ul>
  )
}
