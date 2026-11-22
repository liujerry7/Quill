import { useState } from 'react'
import type { Editor } from 'tldraw'
import type { LifelineProject } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { DocView, type Reading } from './DocView'
import { PageCanvas } from './PageCanvas'
import { TranscriptPanel } from './TranscriptPanel'

interface Props {
  page: PageMeta
  configured: boolean
  projects: LifelineProject[]
  /** A document to show in place of the transcript (read-only). */
  reading: Reading | null
  onCloseReading(): void
  onMove(projectId: string | null): void
  onSaved(): void
}

/** A page: its ink canvas beside its transcription (or a document being read). */
export function PageView({ page, configured, projects, reading, onCloseReading, onMove, onSaved }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  return (
    <div className="page-view">
      <main className="canvas">
        <PageCanvas pageId={page.id} onEditor={setEditor} />
      </main>
      {reading ? (
        <DocView reading={reading} closeLabel="Back to transcript" onClose={onCloseReading} />
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
