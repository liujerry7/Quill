import 'katex/dist/katex.min.css'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import type { LifelineDoc } from '../../shared/lifeline'

interface Props {
  docId: string
  onClose(): void
}

/** A Lifeline doc, read-only. Editing stays in Lifeline. */
export function DocView({ docId, onClose }: Props) {
  const [doc, setDoc] = useState<LifelineDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(null)
    window.quill.lifeline.readDoc(docId).then((result) => {
      if (cancelled) return
      if (result.ok) setDoc(result.value)
      else setError(result.error)
    })
    return () => {
      cancelled = true
    }
  }, [docId])

  return (
    <aside className="transcript doc-view">
      <header>
        <span className="doc-title" title={doc?.title}>
          {doc?.title ?? 'Lifeline doc'}
        </span>
        <button className="secondary" onClick={onClose} title="Back to this page's transcript">
          Back to transcript
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {!doc && !error && <p className="muted">Loading…</p>}
      {doc && (
        <>
          <p className="muted small">Read-only · last edited {new Date(doc.updatedAt).toLocaleString()}</p>
          <div className="preview doc-body">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {doc.body}
            </ReactMarkdown>
          </div>
        </>
      )}
    </aside>
  )
}
