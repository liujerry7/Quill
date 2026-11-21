import { useState } from 'react'
import type { Editor } from 'tldraw'
import type { LifelineProject } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { DocView } from './DocView'
import { PageCanvas } from './PageCanvas'
import { TranscriptPanel } from './TranscriptPanel'

interface Props {
  page: PageMeta
  configured: boolean
  projects: LifelineProject[]
  /** A Lifeline doc to show in place of the transcript (read-only). */
  openDocId: string | null
  onCloseDoc(): void
  onMove(projectId: string | null): void
  onSaved(): void
}

/** A page: its ink canvas beside its transcription (or a Lifeline doc being looked at). */
export function PageView({ page, configured, projects, openDocId, onCloseDoc, onMove, onSaved }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  return (
    <div className="page-view">
      <main className="canvas">
        <PageCanvas pageId={page.id} onEditor={setEditor} />
      </main>
      {openDocId ? (
        <DocView docId={openDocId} onClose={onCloseDoc} />
      ) : (
        <TranscriptPanel
          page={page}
          editor={editor}
          configured={configured}
          projects={projects}
          onMove={onMove}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
