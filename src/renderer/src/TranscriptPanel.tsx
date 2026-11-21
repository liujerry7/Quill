import 'katex/dist/katex.min.css'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { type Editor, useValue } from 'tldraw'
import type { LifelineProject } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { ProjectPicker } from './ProjectPicker'

const pages = window.quill.pages
const SAVE_DELAY_MS = 400

type Status =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'saving' }
  | { kind: 'saved'; created: boolean }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string }

interface Props {
  page: PageMeta
  editor: Editor | null
  configured: boolean
  projects: LifelineProject[]
  onMove(projectId: string | null): void
  onSaved(): void
}

/** Claude's transcription of the page: read, fix by hand, preview with math, save to Lifeline. */
export function TranscriptPanel({ page, editor, configured, projects, onMove, onSaved }: Props) {
  const pageId = page.id
  const [text, setText] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [moving, setMoving] = useState(false)
  const textRef = useRef<string | null>(null)
  textRef.current = text
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const selectedCount = useValue('selected shapes', () => editor?.getSelectedShapeIds().length ?? 0, [editor])

  // Load this page's transcript, and save edits (debounced, flushed on switch, close or Save).
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
    flushRef.current = flush
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
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS)
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

  async function save(overwrite = false) {
    setStatus({ kind: 'saving' })
    await flushRef.current() // Lifeline gets exactly what is on screen
    const result = await window.quill.lifeline.savePage(pageId, { overwrite })
    if (result.ok) {
      setStatus({ kind: 'saved', created: result.created })
      onSaved()
    } else if (result.conflict) {
      setStatus({ kind: 'conflict', message: result.error })
    } else {
      setStatus({ kind: 'error', message: result.error })
    }
  }

  const busy = status.kind === 'reading' || status.kind === 'saving'
  const projectName = page.projectId ? (projects.find((p) => p.id === page.projectId)?.name ?? '…') : null
  const canSave = configured && page.projectId !== null && !!text?.trim() && !busy
  const saveTitle = !configured
    ? 'Connect Lifeline in .env first'
    : !page.projectId
      ? 'Move this page into a Lifeline project first'
      : !text?.trim()
        ? 'Read the page first'
        : page.lifeline
          ? 'Replace the Lifeline doc with this transcript'
          : 'Create a doc for this page in its project'

  return (
    <aside className="transcript">
      <header>
        <span>Transcript</span>
        <button
          className="read"
          onClick={read}
          disabled={!editor || busy}
          title="Send the ink to Claude. The result is added to the end of the transcript."
        >
          {status.kind === 'reading' ? 'Reading…' : selectedCount > 0 ? 'Read selection' : 'Read page'}
        </button>
      </header>

      {configured && (
        <div className="filing">
          {moving ? (
            <ProjectPicker
              projects={projects}
              placeholder="Move to project…"
              autoFocus
              onPick={(p) => {
                onMove(p.id)
                setMoving(false)
              }}
              onCancel={() => setMoving(false)}
            />
          ) : (
            <>
              <span className="muted">In</span>
              <span className="project-name">{projectName ?? 'Unfiled'}</span>
              <button className="link" onClick={() => setMoving(true)}>Move</button>
              {page.projectId && (
                <button className="link" onClick={() => onMove(null)} title="Take this page out of its project">
                  Unfile
                </button>
              )}
            </>
          )}
        </div>
      )}

      {status.kind === 'error' && <p className="error">{status.message}</p>}
      {status.kind === 'conflict' && (
        <div className="error">
          <p>{status.message}</p>
          <div className="row">
            <button className="danger" onClick={() => save(true)}>Replace Lifeline's version</button>
            <button className="secondary" onClick={() => setStatus({ kind: 'idle' })}>Cancel</button>
          </div>
        </div>
      )}

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

      {configured && (
        <footer>
          <span className="muted small">
            {status.kind === 'saved'
              ? status.created
                ? `Saved as a new doc in ${projectName}.`
                : `Updated in ${projectName}.`
              : page.lifeline
                ? `Last saved ${new Date(page.lifeline.savedAt).toLocaleString()}`
                : 'Not in Lifeline yet'}
          </span>
          <button className="read" onClick={() => save()} disabled={!canSave} title={saveTitle}>
            {status.kind === 'saving' ? 'Saving…' : page.lifeline ? 'Update in Lifeline' : 'Save to Lifeline'}
          </button>
        </footer>
      )}
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
