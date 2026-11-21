import { useEffect, useState } from 'react'
import { Editor, getSnapshot, Tldraw, TLStoreSnapshot } from 'tldraw'

const api = window.quill.pages
const SAVE_DELAY_MS = 400

type Loaded = { snapshot: TLStoreSnapshot | undefined }

/** One page's canvas: loads its ink, autosaves every change, flushes on switch or close. */
export function PageCanvas({ pageId }: { pageId: string }) {
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
  }, [editor, pageId])

  if (!loaded) return null
  return <Tldraw snapshot={loaded.snapshot} onMount={setEditor} />
}
