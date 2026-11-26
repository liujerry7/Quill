import 'katex/dist/katex.min.css'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import type { CheckResult } from '../../shared/read'
import { displayMath } from './mathMarkdown'
import type { CheckState } from './useCheckWork'

interface Props {
  checks: CheckResult[]
  state: CheckState
  onRemove(checkId: string): void
  onClose(): void
}

/** Claude's checks of the page's work, newest first: right or wrong, what went right and wrong. */
export function FeedbackPanel({ checks, state, onRemove, onClose }: Props) {
  return (
    <aside className="transcript feedback">
      <header>
        <span>Feedback</span>
        <button className="icon-button" onClick={onClose} aria-label="Hide feedback" title="Hide feedback">
          ×
        </button>
      </header>
      <div className="feedback-body">
        {state.kind === 'checking' && (
          <p className="paused">Claude is working the problem out and checking each step. Calculus can take a minute or two.</p>
        )}
        {state.kind === 'error' && <p className="paused error-text">{state.message}</p>}
        {checks.length === 0 && state.kind !== 'checking' && (
          <p className="muted how">
            Pick <b>Check work</b> in the toolbar (the ✓ in a dashed box, or Shift+C) and drag a box over a problem and
            your working, with a box drawn round your final answer. Claude solves it itself, then marks your work in red
            and says what went right and what went wrong. Stuck? Write <b>?</b> under the problem instead of working and
            check that: Claude walks you through it.
          </p>
        )}
        {checks.map((c) => (
          <section key={c.id} className="check">
            <div className="check-head">
              <span className="muted small">Checked {new Date(c.checkedAt).toLocaleString()}</span>
              <button className="icon-button" onClick={() => onRemove(c.id)} title="Remove this check and its marks" aria-label="Remove this check">
                ×
              </button>
            </div>
            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
              {displayMath(c.markdown)}
            </ReactMarkdown>
          </section>
        ))}
      </div>
    </aside>
  )
}
