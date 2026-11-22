import { useEffect, useState } from 'react'
import { DrawShapeUtil, Editor, getSnapshot, type TLComponents, Tldraw, TLStoreSnapshot } from 'tldraw'
import type { Paper } from '../../shared/pages'
import { PaperBackground, PaperContext } from './Paper'

const api = window.quill.pages
const SAVE_DELAY_MS = 400
const COMPONENTS: TLComponents = { PageMenu: null, Background: PaperBackground }

// The pen's smallest size (S) is a fine tip: about half tldraw's usual S. M, L and XL are unchanged.
const FINE_TIP = 0.25
const SHAPE_UTILS = [
  DrawShapeUtil.configure({
    getCustomDisplayValues: (_editor, shape, theme) =>
      shape.props.size === 's' ? { strokeWidth: theme.strokeWidth * FINE_TIP } : {},
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
        licenseKey={import.meta.env.RENDERER_VITE_TLDRAW_LICENSE_KEY}
      />
    </PaperContext.Provider>
  )
}
