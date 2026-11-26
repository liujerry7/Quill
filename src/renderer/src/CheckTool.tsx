import { Box, StateNode, type TLUiOverrides, Vec } from 'tldraw'

// Check work: drag a box over a problem and your working (with your answer boxed by hand), and
// Claude marks it. The tool only picks the area; the page view does the checking.

export const CHECK_TOOL = 'check-work'
/** A drag smaller than this (screen pixels) is a stray tap, not an area. */
const MIN_DRAG_PX = 12

type CheckHandler = (area: Box) => void
let handler: CheckHandler | null = null

/** The open page's way of checking an area (there's one page open at a time). */
export function setCheckHandler(fn: CheckHandler | null) {
  handler = fn
}

export class CheckTool extends StateNode {
  static override id = CHECK_TOOL
  private origin: Vec | null = null
  /** The tool to hand back to once an area is picked (the pen, usually). */
  private returnTo = 'draw'

  override onEnter(_info: unknown, from: string) {
    if (from && from !== CHECK_TOOL) this.returnTo = from
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onExit() {
    this.origin = null
    this.editor.updateInstanceState({ brush: null })
  }

  override onPointerDown() {
    this.origin = this.editor.inputs.getCurrentPagePoint().clone()
  }

  override onPointerMove() {
    if (!this.origin || !this.editor.inputs.getIsPointing()) return
    // tldraw's own selection brush shows the area as it's dragged.
    this.editor.updateInstanceState({ brush: this.area().toJson() })
  }

  override onPointerUp() {
    if (!this.origin) return
    const area = this.area()
    this.origin = null
    this.editor.updateInstanceState({ brush: null })
    const zoom = this.editor.getZoomLevel()
    if (area.w * zoom < MIN_DRAG_PX || area.h * zoom < MIN_DRAG_PX) return
    handler?.(area)
    this.editor.setCurrentTool(this.returnTo)
  }

  override onCancel() {
    this.origin = null
    this.editor.updateInstanceState({ brush: null })
  }

  private area(): Box {
    return Box.FromPoints([this.origin!, this.editor.inputs.getCurrentPagePoint()])
  }
}

const ICON = (
  <div className="tlui-icon quill-tool-icon" aria-hidden>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="3 2.5" />
      <path d="M8 12.5l2.7 2.7L16.5 9" />
    </svg>
  </div>
)

export const CHECK_TOOL_OVERRIDES: TLUiOverrides = {
  tools(editor, tools) {
    tools[CHECK_TOOL] = {
      id: CHECK_TOOL,
      label: 'tool.check-work',
      icon: ICON,
      kbd: 'shift+c',
      onSelect: () => editor.setCurrentTool(CHECK_TOOL),
    }
    return tools
  },
  translations: { en: { 'tool.check-work': 'Check work: box a problem and your answer' } },
}
