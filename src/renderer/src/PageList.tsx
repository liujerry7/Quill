import { useState } from 'react'
import type { MarkdownFile } from '../../shared/files'
import type { PageMeta } from '../../shared/pages'

interface Props {
  pages: PageMeta[]
  files: MarkdownFile[]
  currentId: string | null
  currentFileId: string | null
  onSelect(id: string): void
  onRename(id: string, name: string): void
  onRemove(id: string): void
  onSelectFile(id: string): void
  onRemoveFile(id: string): void
}

/** What's inside one folder: Quill pages (ink) and Markdown files (read-only), each labelled. */
export function PageList(props: Props) {
  const { pages, files, currentId, currentFileId, onSelect, onRename, onRemove } = props
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
              <span className="kind page">Page</span>
              <span className="label">{page.name}</span>
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
      {files.map((file) => (
        <li key={file.id} className={file.id === currentFileId ? 'current' : ''}>
          <button className="name" onClick={() => props.onSelectFile(file.id)} title={file.path}>
            <span className="kind file">MD</span>
            <span className="label">{file.name}</span>
          </button>
          {confirmingId === file.id ? (
            <span className="confirm">
              <button
                onClick={() => {
                  props.onRemoveFile(file.id)
                  setConfirmingId(null)
                }}
                title="Takes it out of Quill; the file itself stays where it is"
              >
                Remove
              </button>
              <button onClick={() => setConfirmingId(null)}>Keep</button>
            </span>
          ) : (
            <span className="actions">
              <button onClick={() => setConfirmingId(file.id)} title="Remove from Quill (the file stays on disk)">×</button>
            </span>
          )}
        </li>
      ))}
      {pages.length === 0 && files.length === 0 && <li className="none muted small">No pages yet</li>}
    </ul>
  )
}
