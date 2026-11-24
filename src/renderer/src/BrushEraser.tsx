import {
  b64Vecs,
  createShapeId,
  DefaultToolbar,
  DefaultToolbarContent,
  type Editor,
  Mat,
  StateNode,
  type TLDrawShape,
  type TLDrawShapeSegment,
  TldrawUiMenuItem,
  type TLUiOverrides,
  useEditor,
  useIsToolSelected,
  useTools,
  useValue,
  Vec,
  type VecModel,
} from 'tldraw'

// A brush eraser: it rubs out only the ink under it, cutting a stroke in two where it passes
// through the middle. tldraw's own eraser (still there) deletes whole strokes.

export const BRUSH_ERASER = 'brush-eraser'
/** The brush's radius in screen pixels, so it feels the same at any zoom. */
const RADIUS_PX = 9

type Point = VecModel

/** The brush's radius on the page right now. */
const pageRadius = (editor: Editor) => RADIUS_PX / editor.getZoomLevel()

/** A draw shape's points in its own space, as one polyline (segments follow on from each other). */
function shapePoints(shape: TLDrawShape): Point[] {
  const { scaleX, scaleY } = shape.props
  const out: Point[] = []
  for (const segment of shape.props.segments) {
    const pts = b64Vecs.decodePoints(segment.path, segment.dim).map((p) => ({ x: p.x * scaleX, y: p.y * scaleY, z: p.z ?? 0.5 }))
    // A straight segment stores only its ends; the densifying below fills in the line.
    for (const p of pts) {
      const last = out.at(-1)
      if (!last || last.x !== p.x || last.y !== p.y) out.push(p)
    }
  }
  return out
}

/** Adds points so no gap is longer than `step`, so the brush can't slip between two of them. */
function densify(points: Point[], step: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (i > 0) {
      const a = points[i - 1]
      const n = Math.floor(Vec.Dist(a, p) / step)
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1)
        out.push({ x: a.x + (p.x - a.x) * t, y: a.y + (p.y - a.y) * t, z: (a.z ?? 0.5) + ((p.z ?? 0.5) - (a.z ?? 0.5)) * t })
      }
    }
    out.push(p)
  }
  return out
}

/** Distance from `p` to the segment a–b. */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Rubs out the ink within `r` of the page point `center`. */
export function eraseAt(editor: Editor, center: Point, r: number) {
  const box = { minX: center.x - r, minY: center.y - r, maxX: center.x + r, maxY: center.y + r }
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'draw' || shape.isLocked) continue
    const bounds = editor.getShapePageBounds(shape)
    if (!bounds || bounds.maxX < box.minX || bounds.minX > box.maxX || bounds.maxY < box.minY || bounds.minY > box.maxY) continue
    const draw = shape as TLDrawShape
    const local = Mat.applyToPoint(Mat.Inverse(editor.getShapePageTransform(draw)), center)
    const points = shapePoints(draw)
    const reach = r
    const hit =
      points.length === 1
        ? Vec.Dist(points[0], local) <= reach
        : points.some((p, i) => i > 0 && distToSegment(local, points[i - 1], p) <= reach)
    if (!hit) continue

    const runs: Point[][] = [[]]
    for (const p of densify(points, Math.max(r / 3, 0.5))) {
      if (Vec.Dist(p, local) <= reach) {
        if (runs.at(-1)!.length > 0) runs.push([])
      } else {
        runs.at(-1)!.push(p)
      }
    }
    // A lone point left at a cut would show as a speck: drop it.
    const kept = runs.filter((run) => run.length >= 2)
    replaceStroke(editor, draw, kept)
  }
}

function toSegment(points: Point[], dim: 2 | 3): TLDrawShapeSegment {
  return dim === 2 ? { type: 'free', path: b64Vecs.encodePoints(points, 2), dim: 2 } : { type: 'free', path: b64Vecs.encodePoints(points) }
}

/** The stroke becomes the pieces left of it: the first keeps its id, the rest are new strokes. */
function replaceStroke(editor: Editor, shape: TLDrawShape, pieces: Point[][]) {
  if (pieces.length === 0) {
    editor.deleteShapes([shape.id])
    return
  }
  const dim = shape.props.segments[0]?.dim === 2 ? 2 : 3
  const props = (points: Point[]) => ({
    segments: [toSegment(points, dim)],
    scaleX: 1,
    scaleY: 1,
    isClosed: false,
    isComplete: true,
  })
  editor.updateShape<TLDrawShape>({ id: shape.id, type: 'draw', props: props(pieces[0]) })
  editor.createShapes<TLDrawShape>(
    pieces.slice(1).map((points) => ({
      id: createShapeId(),
      type: 'draw',
      parentId: shape.parentId,
      x: shape.x,
      y: shape.y,
      rotation: shape.rotation,
      opacity: shape.opacity,
      props: { ...shape.props, ...props(points) },
    })),
  )
}

export class BrushEraserTool extends StateNode {
  static override id = BRUSH_ERASER
  private last: Point | null = null

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onPointerDown() {
    this.editor.markHistoryStoppingPoint('brush erase')
    this.last = this.editor.inputs.getCurrentPagePoint().clone()
    eraseAt(this.editor, this.last, pageRadius(this.editor))
  }

  override onPointerMove() {
    if (!this.last || !this.editor.inputs.getIsPointing()) return
    const to = this.editor.inputs.getCurrentPagePoint().clone()
    const r = pageRadius(this.editor)
    // Rub along the whole way from the last point, so a quick swipe doesn't skip ink.
    const steps = Math.max(1, Math.ceil(Vec.Dist(this.last, to) / (r / 2)))
    for (let i = 1; i <= steps; i++) eraseAt(this.editor, Vec.Lrp(this.last, to, i / steps), r)
    this.last = to
  }

  override onPointerUp() {
    this.last = null
  }

  override onCancel() {
    this.last = null
  }

  override onComplete() {
    this.last = null
  }
}

const ICON = (
  <div className="tlui-icon brush-eraser-icon" aria-hidden>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="7" strokeDasharray="2.5 2.5" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  </div>
)

export const BRUSH_ERASER_OVERRIDES: TLUiOverrides = {
  tools(editor, tools) {
    tools[BRUSH_ERASER] = {
      id: BRUSH_ERASER,
      label: 'tool.brush-eraser',
      icon: ICON,
      kbd: 'shift+e',
      onSelect: () => editor.setCurrentTool(BRUSH_ERASER),
    }
    return tools
  },
  translations: { en: { 'tool.brush-eraser': 'Brush eraser' } },
}

/** tldraw's toolbar with the brush eraser first. */
export function QuillToolbar() {
  const tools = useTools()
  const selected = useIsToolSelected(tools[BRUSH_ERASER])
  return (
    <DefaultToolbar>
      <TldrawUiMenuItem {...tools[BRUSH_ERASER]} isSelected={selected} />
      <DefaultToolbarContent />
    </DefaultToolbar>
  )
}

/** The brush's outline under the pen while the brush eraser is the tool. */
export function BrushOutline() {
  const editor = useEditor()
  const at = useValue(
    'brush outline',
    () => (editor.getCurrentToolId() === BRUSH_ERASER ? editor.inputs.getCurrentScreenPoint().clone() : null),
    [editor],
  )
  if (!at) return null
  // The screen point is already relative to the canvas.
  return (
    <div
      className="brush-outline"
      style={{ width: RADIUS_PX * 2, height: RADIUS_PX * 2, left: at.x - RADIUS_PX, top: at.y - RADIUS_PX }}
    />
  )
}
