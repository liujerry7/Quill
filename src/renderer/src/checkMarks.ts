import { type Box, createShapeId, type Editor, type TLShape, type TLShapeId, type TLShapePartial, toRichText } from 'tldraw'
import type { CheckMark } from '../../shared/read'

// The marks a check leaves on the page, in red pen: a dashed box round each mistake with a note
// beside it, and a tick by a correct answer. They're ordinary (locked) shapes, so they save with
// the ink, but tagged so Quill leaves them out of what Claude reads and can take them off again.

const TAG = 'quillCheck'

export const isMark = (shape: Pick<TLShape, 'meta'> | undefined) => !!shape?.meta?.[TAG]

/** Every record in a store change is a mark (so the change isn't new ink). */
export function onlyMarks(records: unknown[]): boolean {
  return records.length > 0 && records.every((r) => (r as { typeName?: string }).typeName === 'shape' && isMark(r as TLShape))
}

/** The marks of the given checks (each mark carries its check's id). */
function markIds(editor: Editor, checkIds: string[]): TLShapeId[] {
  const ids = new Set(checkIds)
  return editor
    .getCurrentPageShapes()
    .filter((s) => isMark(s) && ids.has(String(s.meta[TAG])))
    .map((s) => s.id)
}

export function clearMarks(editor: Editor, checkIds: string[]) {
  const ids = markIds(editor, checkIds)
  if (ids.length > 0) editor.run(() => editor.deleteShapes(ids), { ignoreShapeLock: true })
}

/**
 * Draws a check's `marks` (boxes in 0–1000 of the checked image) over `region`, the page area the
 * image showed, in place of the marks of `replacing` (earlier checks of the same area).
 */
export function drawMarks(editor: Editor, checkId: string, marks: CheckMark[], region: Box, replacing: string[]) {
  editor.markHistoryStoppingPoint('check marks')
  clearMarks(editor, replacing)
  const at = (x: number, y: number) => ({ x: region.minX + (x / 1000) * region.w, y: region.minY + (y / 1000) * region.h })
  const meta = { [TAG]: checkId }
  const shapes = marks.flatMap((m): TLShapePartial[] => {
    const a = at(m.box[0], m.box[1])
    const b = at(m.box[2], m.box[3])
    const pad = 6
    if (m.kind === 'help') {
      // By a "?": where the walkthrough is, in blue (not marking anything wrong).
      return [
        {
          id: createShapeId(),
          type: 'text',
          x: b.x + pad + 14,
          y: a.y - pad,
          isLocked: true,
          meta,
          props: { richText: toRichText(m.note || 'walkthrough in Feedback'), color: 'blue', size: 's', font: 'draw', autoSize: true },
        },
      ]
    }
    if (m.kind === 'right') {
      return [
        {
          id: createShapeId(),
          type: 'text' as const,
          x: b.x + 10,
          y: a.y + (b.y - a.y) / 2 - 22,
          isLocked: true,
          meta,
          props: { richText: toRichText('✓'), color: 'green' as const, size: 'l' as const, font: 'draw' as const, autoSize: true },
        },
      ]
    }
    return [
      {
        id: createShapeId(),
        type: 'geo' as const,
        x: a.x - pad,
        y: a.y - pad,
        isLocked: true,
        meta,
        props: { geo: 'rectangle' as const, w: b.x - a.x + pad * 2, h: b.y - a.y + pad * 2, color: 'red' as const, dash: 'dashed' as const, fill: 'none' as const, size: 's' as const },
      },
      ...(m.note
        ? [
            {
              id: createShapeId(),
              type: 'text' as const,
              x: b.x + pad + 14,
              y: a.y - pad,
              isLocked: true,
              meta,
              props: { richText: toRichText(m.note), color: 'red' as const, size: 's' as const, font: 'draw' as const, autoSize: true },
            },
          ]
        : []),
    ]
  })
  editor.createShapes(shapes)
}
