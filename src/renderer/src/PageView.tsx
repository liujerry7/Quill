import { useState } from 'react'
import type { Editor } from 'tldraw'
import type { LifelineProject } from '../../shared/lifeline'
import type { PageMeta, Paper } from '../../shared/pages'
import { PageCanvas } from './PageCanvas'
import { PageHeader } from './PageHeader'
import { useStoredState } from './storedFlag'
import { TranscriptPanel } from './TranscriptPanel'
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
          transcriptOpen={transcript === 'open'}
          onToggleTranscript={() => setTranscript(transcript === 'open' ? 'closed' : 'open')}
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
      {transcript === 'open' && (
        <TranscriptPanel
          text={t.text}
          auto={t.auto}
          onEdit={t.edit}
          onReadNow={t.readNow}
          onClose={() => setTranscript('closed')}
        />
      )}
    </div>
  )
}
