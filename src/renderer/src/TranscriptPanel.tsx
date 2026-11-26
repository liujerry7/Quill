import 'katex/dist/katex.min.css'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import type { CheckMark } from '../../shared/read'
import { displayMath } from './mathMarkdown'

interface Props {
  text: string | null
  /** False once the transcript has been edited by hand: auto-read leaves it alone. */
  auto: boolean
  onEdit(md: string): void
  onReadNow(): void
  onClose(): void
  /** The last check's corrections, shown in the preview under the lines they're about. */
  corrections: CheckMark[]
}

/**
 * The transcript with the check's corrections under the lines they're about (any that match no
 * line go at the end). Only the preview shows them: the transcript itself, and what's saved to
 * Lifeline, stay as written.
 */
function annotate(text: string, marks: CheckMark[]): string {
  const wrong = marks.filter((m) => m.kind === 'wrong' && m.correction.trim())
  if (wrong.length === 0) return text
  const lines = text.split('\n')
  const key = (s: string) => s.replace(/\s+/g, ' ').trim()
  const after = new Map<number, string[]>()
  const loose: string[] = []
  for (const m of wrong) {
    const want = key(m.transcriptLine)
    const i = want ? lines.findIndex((l) => key(l) === want || (want.length > 3 && key(l).includes(want))) : -1
    if (i >= 0) after.set(i, [...(after.get(i) ?? []), m.correction])
    else loose.push(m.correction)
  }
  const out = lines.flatMap((line, i) => [line, ...(after.get(i) ?? []).map((c) => `\n> ❌ **Correction:** ${c}\n`)])
  if (loose.length > 0) out.push('', '---', '**Corrections**', '', ...loose.map((c) => `- ❌ ${c}`))
  return out.join('\n')
}

/** Claude's transcription of the page: fix it by hand, preview it with math. */
export function TranscriptPanel({ text, auto, onEdit, onReadNow, onClose, corrections }: Props) {
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
          {displayMath(annotate(text ?? '', corrections))}
        </ReactMarkdown>
      </div>
    </aside>
  )
}
