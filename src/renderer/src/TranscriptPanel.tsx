import 'katex/dist/katex.min.css'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

interface Props {
  text: string | null
  /** False once the transcript has been edited by hand: auto-read leaves it alone. */
  auto: boolean
  onEdit(md: string): void
  onReadNow(): void
  onClose(): void
}

/** Claude's transcription of the page: fix it by hand, preview it with math. */
export function TranscriptPanel({ text, auto, onEdit, onReadNow, onClose }: Props) {
  return (
    <aside className="transcript">
      <header>
        <span>Transcript</span>
        <button className="icon-button" onClick={onClose} aria-label="Hide transcript" title="Hide transcript">
          ×
        </button>
      </header>
      {!auto && (
        <p className="paused">
          You've edited this, so auto-read leaves it alone.{' '}
          <button className="link" onClick={onReadNow}>Read the page again</button> to replace it.
        </p>
      )}
      <textarea
        value={text ?? ''}
        onChange={(e) => onEdit(e.target.value)}
        placeholder="Write on the canvas; Quill reads it a few seconds after you pause. Fix anything Claude got wrong here."
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
