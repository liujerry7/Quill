import { useEffect, useState } from 'react'
import { Editor, getSnapshot, type TLComponents, Tldraw, TLStoreSnapshot } from 'tldraw'

const api = window.quill.pages
const SAVE_DELAY_MS = 400
const HIDDEN_UI: TLComponents = { PageMenu: null }

type Loaded = { snapshot: TLStoreSnapshot | undefined }

interface Props {
  pageId: string
  /** Called once the page's editor is ready, so siblings (the transcript panel) can use it. */
  onEditor(editor: Editor): void
}

/** One page's canvas: loads its ink, autosaves every change, flushes on switch or close. */
export function PageCanvas({ pageId, onEditor }: Props) {
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
    <Tldraw
      snapshot={loaded.snapshot}
      onMount={setEditor}
      components={HIDDEN_UI}
      licenseKey={import.meta.env.RENDERER_VITE_TLDRAW_LICENSE_KEY}
    />
  )
}
