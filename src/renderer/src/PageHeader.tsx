import { useEffect, useRef, useState } from 'react'
import type { LifelineProject } from '../../shared/lifeline'
import type { PageMeta, Paper } from '../../shared/pages'
import { ProjectPicker } from './ProjectPicker'
import type { ReadState, SaveState } from './usePageTranscript'

const PAPERS: { id: Paper; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'lined', label: 'Lined' },
  { id: 'graph', label: 'Graph paper' },
]

interface Props {
  page: PageMeta
  paper: Paper
  configured: boolean
  projects: LifelineProject[]
  hasText: boolean
  auto: boolean
  read: ReadState
  save: SaveState
  transcriptOpen: boolean
  onToggleTranscript(): void
  feedbackOpen: boolean
  /** A check from the Check work tool is under way. */
  checking: boolean
  onToggleFeedback(): void
  onReadNow(): void
  onSave(overwrite?: boolean): void
  onDismissSave(): void
  onMove(projectId: string | null): void
  onPaper(paper: Paper): void
  onNewPage(): void
}

/** The bar above the canvas: the File menu, the page's name, read status, the transcript toggle. */
export function PageHeader(props: Props) {
  const { page, read, save } = props
  const projectName = page.projectId
    ? (props.projects.find((p) => p.id === page.projectId)?.name ?? '…')
    : 'Unfiled'

  return (
    <>
      <header className="page-header">
        <FileMenu {...props} projectName={projectName} />
        <span className="page-title" title={page.name}>{page.name}</span>
        <span className="page-folder muted" title={projectName}>{projectName}</span>
        <span className="spacer" />
        <span className={`read-status${read.kind === 'error' ? ' error-text' : ''}`} title={read.kind === 'error' ? read.message : undefined}>
          {readLabel(read, props.auto)}
        </span>
        <button
          className={`toggle${props.feedbackOpen ? ' on' : ''}`}
          onClick={props.onToggleFeedback}
          aria-pressed={props.feedbackOpen}
          title="Claude's checks of your work (box a problem with the Check work tool)"
        >
          {props.checking ? 'Checking…' : 'Feedback'}
        </button>
        <button
          className={`toggle${props.transcriptOpen ? ' on' : ''}`}
          onClick={props.onToggleTranscript}
          aria-pressed={props.transcriptOpen}
        >
          Transcript
        </button>
      </header>

      {save.kind === 'conflict' && (
        <div className="notice error">
          <span>{save.message}</span>
          <button className="danger" onClick={() => props.onSave(true)}>Replace Lifeline's version</button>
          <button className="secondary" onClick={props.onDismissSave}>Cancel</button>
        </div>
      )}
      {save.kind === 'error' && (
        <div className="notice error">
          <span>{save.message}</span>
          <button className="secondary" onClick={props.onDismissSave}>OK</button>
        </div>
      )}
      {save.kind === 'saved' && (
        <div className={`notice${save.todos.error ? ' error' : ''}`}>
          <span>
            {save.created ? `Saved as a new doc in ${projectName}.` : `Updated in ${projectName}.`}
            {save.todos.added.length > 0 &&
              ` Added ${save.todos.added.length === 1 ? 'a to-do' : `${save.todos.added.length} to-dos`}: ${save.todos.added.join('; ')}.`}
            {save.todos.error && ` Some to-dos weren't added: ${save.todos.error}`}
          </span>
          <button className="secondary" onClick={props.onDismissSave}>OK</button>
        </div>
      )}
    </>
  )
}

function readLabel(read: ReadState, auto: boolean): string {
  switch (read.kind) {
    case 'waiting':
      return 'Will read when you pause'
    case 'reading':
      return 'Reading…'
    case 'read':
      return `Read ${read.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    case 'error':
      return "Couldn't read the page"
    default:
      return auto ? '' : 'Auto-read paused (transcript edited)'
  }
}

/**
 * Opens on a tap or click (never on hover, so it works with a pen), closes on a tap outside,
 * Escape, or after choosing something.
 */
function FileMenu(props: Props & { projectName: string }) {
  const { page, configured, save } = props
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // Capture phase, so taps on the canvas count even though tldraw handles them.
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function close() {
    setOpen(false)
    setMoving(false)
  }
  const choose = (fn: () => void) => () => {
    close()
    fn()
  }

  const saving = save.kind === 'saving'
  const whyNotSave = !configured
    ? 'Connect Lifeline in .env first'
    : !page.projectId
      ? 'Move this page into a Lifeline project first'
      : !props.hasText
        ? 'Nothing transcribed yet'
        : null

  return (
    <div className="menu" ref={ref}>
      <button className={`menu-button${open ? ' on' : ''}`} onClick={() => (open ? close() : setOpen(true))} aria-expanded={open}>
        File
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          {moving ? (
            <div className="menu-picker">
              <ProjectPicker
                projects={props.projects}
                placeholder="Move to project…"
                autoFocus
                onPick={(p) => {
                  close()
                  props.onMove(p.id)
                }}
                onCancel={() => setMoving(false)}
              />
            </div>
          ) : (
            <>
              <button role="menuitem" onClick={choose(props.onNewPage)}>
                <span>New page</span>
                <span className="hint">In {props.projectName}</span>
              </button>
              <hr />
              <button role="menuitem" disabled={!!whyNotSave || saving} onClick={choose(() => props.onSave())}>
                <span>{saving ? 'Saving…' : page.lifeline ? 'Update in Lifeline' : 'Save to Lifeline'}</span>
                <span className="hint">
                  {whyNotSave ??
                    (page.lifeline ? `Last saved ${new Date(page.lifeline.savedAt).toLocaleString()}` : props.projectName)}
                </span>
              </button>
              <button role="menuitem" disabled={props.read.kind === 'reading'} onClick={choose(props.onReadNow)}>
                <span>Read page now</span>
                {!props.auto && <span className="hint">Replaces your edits to the transcript</span>}
              </button>
              {configured && (
                <>
                  <hr />
                  <button role="menuitem" onClick={() => setMoving(true)}>
                    <span>Move to project…</span>
                  </button>
                  {page.projectId && (
                    <button role="menuitem" onClick={choose(() => props.onMove(null))}>
                      <span>Unfile</span>
                    </button>
                  )}
                </>
              )}
              <hr />
              <div className="menu-label">Paper</div>
              {PAPERS.map((p) => (
                <button
                  key={p.id}
                  role="menuitemradio"
                  aria-checked={props.paper === p.id}
                  onClick={choose(() => props.onPaper(p.id))}
                >
                  <span>{p.label}</span>
                  {props.paper === p.id && <span className="check">✓</span>}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
