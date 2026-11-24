import { useEffect, useState } from 'react'
import { DrawShapeUtil, Editor, getSnapshot, type TLComponents, Tldraw, TLStoreSnapshot } from 'tldraw'
import type { Paper } from '../../shared/pages'
import { BRUSH_ERASER_OVERRIDES, BrushEraserTool, BrushOutline, QuillToolbar } from './BrushEraser'
import { PaperBackground, PaperContext } from './Paper'

const api = window.quill.pages
const SAVE_DELAY_MS = 400
const COMPONENTS: TLComponents = {
  PageMenu: null,
  Background: PaperBackground,
  Toolbar: QuillToolbar,
  InFrontOfTheCanvas: BrushOutline,
}
const TOOLS = [BrushEraserTool]

// Thinner pen strokes than tldraw's, for handwriting. tldraw draws a stroke at (strokeWidth + 1),
// and a pressure-sensitive pen stroke at 1 + 1.2 × that, so lowering strokeWidth alone barely
// thins a pen. These are the totals after tldraw's + 1 (S comes out under zero before it, which
// is fine: only the total is used). With a pen at middling pressure that's about 2, 3, 4.5 and
// 8.5 px on screen at 100%, against tldraw's 6, 8, 10.5 and 18.
const PEN_WIDTHS = { s: 0.4, m: 1.2, l: 2, xl: 4.5 } as const
const SHAPE_UTILS = [
  DrawShapeUtil.configure({
    getCustomDisplayValues: (_editor, shape) => ({ strokeWidth: PEN_WIDTHS[shape.props.size] - 1 }),
  }),
]

type Loaded = { snapshot: TLStoreSnapshot | undefined }

interface Props {
  pageId: string
  paper: Paper
  /** Called once the page's editor is ready, so siblings (the transcript panel) can use it. */
  onEditor(editor: Editor): void
}

/** One page's canvas: loads its ink, autosaves every change, flushes on switch or close. */
export function PageCanvas({ pageId, paper, onEditor }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)

  useEffect(() => {
    let cancelled = false
    api.load(pageId).then((content) => {
      if (!cancelled) setLoaded({ snapshot: (content as TLStoreSnapshot | null) ?? undefined })
    })
    return () => {
      cancelled = true
    }
  }, [pageId])

  useEffect(() => {
    if (!editor) return
    onEditor(editor)
    let timer: ReturnType<typeof setTimeout> | null = null
    let dirty = false

    const save = () => {
      if (timer) clearTimeout(timer)
      timer = null
      if (!dirty) return Promise.resolve()
      dirty = false
      return api.save(pageId, getSnapshot(editor.store).document)
    }

    const stopListening = editor.store.listen(
      () => {
        dirty = true
        if (timer) clearTimeout(timer)
        timer = setTimeout(save, SAVE_DELAY_MS)
      },
      { scope: 'document', source: 'user' },
    )
    const stopFlushHandler = window.quill.onFlushRequest(save)

    return () => {
      stopListening()
      stopFlushHandler()
      save()
    }
  }, [editor, pageId, onEditor])

  if (!loaded) return null
  // A Quill page is one tldraw page, so hide tldraw's own page menu to avoid two kinds of "page".
  return (
    <PaperContext.Provider value={paper}>
      <Tldraw
        snapshot={loaded.snapshot}
        onMount={setEditor}
        components={COMPONENTS}
        shapeUtils={SHAPE_UTILS}
        tools={TOOLS}
        overrides={BRUSH_ERASER_OVERRIDES}
        licenseKey={import.meta.env.RENDERER_VITE_TLDRAW_LICENSE_KEY}
      />
    </PaperContext.Provider>
  )
}
