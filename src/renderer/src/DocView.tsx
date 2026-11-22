import 'katex/dist/katex.min.css'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import type { LocalDoc } from '../../shared/files'

/** Something open for reading: a Lifeline doc, or a Markdown file from disk. */
export type Reading = { kind: 'lifeline'; docId: string } | { kind: 'file'; doc: LocalDoc }

interface Shown {
  title: string
  body: string
  /** "last edited …" or where the file lives. */
  detail: string
}

interface Props {
  reading: Reading
  /** Label for the close button: "Back to transcript" beside a page, "Close" on its own. */
  closeLabel: string
  onClose(): void
}

/** A document, read-only. Lifeline docs are edited in Lifeline; files in your own editor. */
export function DocView({ reading, closeLabel, onClose }: Props) {
  const [loaded, setLoaded] = useState<Shown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const docId = reading.kind === 'lifeline' ? reading.docId : null

  useEffect(() => {
    if (!docId) return
    let cancelled = false
    setLoaded(null)
    setError(null)
    window.quill.lifeline.readDoc(docId).then((result) => {
      if (cancelled) return
      if (result.ok) {
        const doc = result.value
        setLoaded({ title: doc.title, body: doc.body, detail: `Lifeline · last edited ${new Date(doc.updatedAt).toLocaleString()}` })
      } else {
        setError(result.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [docId])

  const shown: Shown | null =
    reading.kind === 'file'
      ? {
          title: reading.doc.name,
          body: reading.doc.markdown,
          detail: reading.doc.path ?? 'Dropped file',
        }
      : loaded

  return (
    <aside className="transcript doc-view">
      <header>
        <span className="doc-title" title={shown?.title}>
          {shown?.title ?? 'Lifeline doc'}
        </span>
        <button className="secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {!shown && !error && <p className="muted">Loading…</p>}
      {shown && (
        <>
          <p className="muted small doc-detail" title={shown.detail}>
            Read-only · {shown.detail}
          </p>
          <div className="preview doc-body">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {shown.body}
            </ReactMarkdown>
          </div>
        </>
      )}
    </aside>
  )
}
