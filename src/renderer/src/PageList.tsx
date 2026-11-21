import { useState } from 'react'
import type { PageMeta } from '../../shared/pages'

interface Props {
  pages: PageMeta[]
  currentId: string
  onSelect(id: string): void
  onCreate(): void
  onRename(id: string, name: string): void
  onRemove(id: string): void
}

export function PageList({ pages, currentId, onSelect, onCreate, onRename, onRemove }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <aside className="pages">
      <header>
        <span>Pages</span>
        <button onClick={onCreate} title="New page">+</button>
      </header>
      <ul>
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
                title="Double-click to rename"
              >
                {page.name}
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
                <button onClick={() => setConfirmingId(page.id)} title="Delete">×</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}
