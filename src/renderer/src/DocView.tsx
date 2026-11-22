import 'katex/dist/katex.min.css'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

/** Something open for reading: a Lifeline doc, or a Markdown file added to a folder. */
export type Reading = { kind: 'lifeline'; docId: string } | { kind: 'file'; id: string }

interface Shown {
  title: string
  body: string
  /** Where it lives and when it last changed. */
  detail: string
}

interface Props {
  reading: Reading
  /** "Back to page" when a page is open in this folder, otherwise "Close". */
  closeLabel: string
  onClose(): void
}

// ipcRenderer.invoke wraps errors thrown in main; show just the message.
const cleanError = (err: unknown) =>
  (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

async function load(reading: Reading): Promise<Shown> {
  if (reading.kind === 'file') {
    const doc = await window.quill.files.read(reading.id)
    return {
      title: doc.name,
      body: doc.markdown,
      detail: `Markdown file · ${doc.path} · changed ${new Date(doc.modifiedAt).toLocaleString()}`,
    }
  }
  const result = await window.quill.lifeline.readDoc(reading.docId)
  if (!result.ok) throw new Error(result.error)
  const doc = result.value
  return {
    title: doc.title,
    body: doc.body,
    detail: `Lifeline doc · last edited ${new Date(doc.updatedAt).toLocaleString()}`,
  }
}

/** A document in the content window, read-only. Lifeline docs are edited in Lifeline, files in your own editor. */
export function DocView({ reading, closeLabel, onClose }: Props) {
  const [shown, setShown] = useState<Shown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const key = reading.kind === 'file' ? `file:${reading.id}` : `doc:${reading.docId}`

  useEffect(() => {
    let cancelled = false
    setShown(null)
    setError(null)
    load(reading).then(
      (s) => !cancelled && setShown(s),
      (err) => !cancelled && setError(cleanError(err)),
    )
    return () => {
      cancelled = true
    }
    // Keyed on `key`, which names the document; `reading` is a fresh object each render.
  }, [key])

  return (
    <section className="doc-view">
      <header>
        <span className={`kind ${reading.kind}`}>{reading.kind === 'file' ? 'MD' : 'Lifeline'}</span>
        <span className="doc-title" title={shown?.title}>
          {shown?.title ?? (error ? 'Couldn’t open it' : 'Loading…')}
        </span>
        <span className="muted small">Read-only</span>
        <button className="secondary" onClick={onClose}>
          {closeLabel}
        </button>
      </header>
      {error && <p className="error doc-error">{error}</p>}
      {shown && (
        <div className="doc-scroll">
          <p className="muted small doc-detail" title={shown.detail}>
            {shown.detail}
          </p>
          <div className="doc-body">
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {shown.body}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </section>
  )
}
