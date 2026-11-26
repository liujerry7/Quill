import { useEffect, useRef, useState } from 'react'
import type { Editor } from 'tldraw'
import type { LifelineProject } from '../../shared/lifeline'
import type { PageMeta, Paper } from '../../shared/pages'
import { PageCanvas } from './PageCanvas'
import { PageHeader } from './PageHeader'
import { useStoredState } from './storedFlag'
import { setCheckHandler } from './CheckTool'
import { FeedbackPanel } from './FeedbackPanel'
import { TranscriptPanel } from './TranscriptPanel'
import { useCheckWork } from './useCheckWork'
import { usePageTranscript } from './usePageTranscript'

const pagesApi = window.quill.pages
/** New pages get whichever paper was chosen last. */
const PAPER_KEY = 'quill.paper'

export function lastPaper(): Paper {
  try {
    const p = localStorage.getItem(PAPER_KEY)
    return p === 'lined' || p === 'graph' ? p : 'plain'
  } catch {
    return 'plain'
  }
}

function rememberPaper(p: Paper) {
  try {
    localStorage.setItem(PAPER_KEY, p)
  } catch {
    // Only sets the default for new pages.
  }
}

interface Props {
  page: PageMeta
  configured: boolean
  projects: LifelineProject[]
  onMove(projectId: string | null): void
  onSaved(): void
  onChange(page: PageMeta): void
  onNewPage(): void
}

/** A page: its ink canvas, with its transcript beside it when asked for. */
export function PageView({ page, configured, projects, onMove, onSaved, onChange, onNewPage }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [transcript, setTranscript] = useStoredState<'open' | 'closed'>('quill.transcript', 'closed')
  const t = usePageTranscript(page, editor, onSaved)
  // One side panel at a time: the feedback takes the transcript's place while it's open.
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const c = useCheckWork(page.id, editor)
  // The Check work tool hands its area here; corrections point at the transcript as it is then.
  const textRef = useRef(t.text)
  textRef.current = t.text
  const checkArea = c.checkArea
  useEffect(() => {
    setCheckHandler((area) => {
      setFeedbackOpen(true)
      checkArea(area, textRef.current ?? '')
    })
    return () => setCheckHandler(null)
  }, [checkArea])
  const paper = page.paper ?? 'plain'

  const choosePaper = async (p: Paper) => {
    rememberPaper(p)
    onChange(await pagesApi.setPaper(page.id, p))
  }

  return (
    <div className="page-view">
      <div className="page-main">
        <PageHeader
          page={page}
          paper={paper}
          configured={configured}
          projects={projects}
          hasText={!!t.text?.trim()}
          auto={t.auto}
          read={t.read}
          save={t.save}
          transcriptOpen={!feedbackOpen && transcript === 'open'}
          onToggleTranscript={() => {
            setFeedbackOpen(false)
            setTranscript(feedbackOpen || transcript !== 'open' ? 'open' : 'closed')
          }}
          feedbackOpen={feedbackOpen}
          checking={c.state.kind === 'checking'}
          onToggleFeedback={() => setFeedbackOpen(!feedbackOpen)}
          onReadNow={t.readNow}
          onSave={t.saveToLifeline}
          onDismissSave={t.dismissSave}
          onMove={onMove}
          onPaper={choosePaper}
          onNewPage={onNewPage}
        />
        <main className="canvas">
          <PageCanvas pageId={page.id} paper={paper} onEditor={setEditor} />
        </main>
      </div>
      {feedbackOpen ? (
        <FeedbackPanel checks={c.checks} state={c.state} onRemove={c.remove} onClose={() => setFeedbackOpen(false)} />
      ) : transcript === 'open' && (
        <TranscriptPanel
          text={t.text}
          auto={t.auto}
          onEdit={t.edit}
          onReadNow={t.readNow}
          onClose={() => setTranscript('closed')}
          corrections={c.checks.flatMap((check) => check.marks)}
        />
      )}
    </div>
  )
}
