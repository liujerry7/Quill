import { useState } from 'react'
import type { Editor } from 'tldraw'
import { PageCanvas } from './PageCanvas'
import { TranscriptPanel } from './TranscriptPanel'

/** A page: its ink canvas beside its transcription. */
export function PageView({ pageId }: { pageId: string }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  return (
    <div className="page-view">
      <main className="canvas">
        <PageCanvas pageId={pageId} onEditor={setEditor} />
      </main>
      <TranscriptPanel pageId={pageId} editor={editor} />
    </div>
  )
}
