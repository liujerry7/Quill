import { useState } from 'react'
import type { Editor } from 'tldraw'
import type { LifelineProject } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { PageCanvas } from './PageCanvas'
import { TranscriptPanel } from './TranscriptPanel'

interface Props {
  page: PageMeta
  configured: boolean
  projects: LifelineProject[]
  onMove(projectId: string | null): void
  onSaved(): void
}

/** A page: its ink canvas beside its transcription. */
export function PageView({ page, configured, projects, onMove, onSaved }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  return (
    <div className="page-view">
      <main className="canvas">
        <PageCanvas pageId={page.id} onEditor={setEditor} />
      </main>
      <TranscriptPanel
        page={page}
        editor={editor}
        configured={configured}
        projects={projects}
        onMove={onMove}
        onSaved={onSaved}
      />
    </div>
  )
}
