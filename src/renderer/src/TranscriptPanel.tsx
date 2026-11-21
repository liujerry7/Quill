import 'katex/dist/katex.min.css'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { type Editor, useValue } from 'tldraw'

const pages = window.quill.pages
const SAVE_DELAY_MS = 400

type Status = { kind: 'idle' } | { kind: 'reading' } | { kind: 'error'; message: string }

interface Props {
  pageId: string
  editor: Editor | null
}

/** Claude's transcription of the page: read, fix by hand, preview with math. */
export function TranscriptPanel({ pageId, editor }: Props) {
  const [text, setText] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const textRef = useRef<string | null>(null)
  textRef.current = text
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedCount = useValue('selected shapes', () => editor?.getSelectedShapeIds().length ?? 0, [editor])

  // Load this page's transcript, and save edits (debounced, flushed on switch or close).
  useEffect(() => {
    let cancelled = false
    pages.loadTranscript(pageId).then((md) => {
      if (!cancelled) setText(md)
    })

    const flush = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      const md = pending.current
      pending.current = null
      return md === null ? Promise.resolve() : pages.saveTranscript(pageId, md)
    }
    const stopFlushHandler = window.quill.onFlushRequest(flush)
    return () => {
      cancelled = true
      stopFlushHandler()
      flush()
    }
  }, [pageId])

  function edit(md: string) {
    textRef.current = md
    setText(md)
    pending.current = md
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const value = pending.current
      pending.current = null
      if (value !== null) pages.saveTranscript(pageId, value)
    }, SAVE_DELAY_MS)
  }

  async function read() {
    if (!editor) return
    const selected = editor.getSelectedShapeIds()
    const shapes = selected.length > 0 ? selected : [...editor.getCurrentPageShapeIds()]
    if (shapes.length === 0) {
      setStatus({ kind: 'error', message: 'Nothing on this page to read yet.' })
      return
    }

    setStatus({ kind: 'reading' })
    try {
      const { blob } = await editor.toImage(shapes, { format: 'png', background: true, darkMode: false, padding: 24 })
      const result = await window.quill.ink.read(await toBase64(blob))
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error })
        return
      }
      // Append rather than replace, so a new read never wipes corrections already made.
      // textRef holds the latest text, including anything typed while Claude was reading.
      const current = textRef.current ?? ''
      edit(current.trim() ? `${current.trimEnd()}\n\n${result.markdown}` : result.markdown)
      setStatus({ kind: 'idle' })
    } catch (err) {
      setStatus({ kind: 'error', message: `Couldn't export the ink: ${(err as Error).message}` })
    }
  }

  const reading = status.kind === 'reading'
  return (
    <aside className="transcript">
      <header>
        <span>Transcript</span>
        <button
          className="read"
          onClick={read}
          disabled={!editor || reading}
          title="Send the ink to Claude. The result is added to the end of the transcript."
        >
          {reading ? 'Reading…' : selectedCount > 0 ? 'Read selection' : 'Read page'}
        </button>
      </header>
      {status.kind === 'error' && <p className="error">{status.message}</p>}
      <textarea
        value={text ?? ''}
        onChange={(e) => edit(e.target.value)}
        placeholder="Write on the canvas, then press Read. Fix anything Claude got wrong here."
        spellCheck
        disabled={text === null}
      />
      <div className="preview">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {text ?? ''}
        </ReactMarkdown>
      </div>
    </aside>
  )
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',', 2)[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
