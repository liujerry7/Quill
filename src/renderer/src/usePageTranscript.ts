import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, type Editor } from 'tldraw'
import type { TodoResult } from '../../shared/lifeline'
import type { PageMeta } from '../../shared/pages'
import { isMark, onlyMarks } from './checkMarks'

const pagesApi = window.quill.pages
const SAVE_DELAY_MS = 400
/** How long the pen rests before Quill reads the page. */
const AUTO_READ_MS = 4000

export type ReadState =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'reading' }
  | { kind: 'read'; at: Date }
  | { kind: 'error'; message: string }

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; created: boolean; todos: TodoResult }
  | { kind: 'conflict'; message: string }
  | { kind: 'error'; message: string }

/**
 * A page's transcript. Claude reads the whole page by itself a few seconds after the ink stops
 * changing, and the read replaces the transcript. Editing the transcript by hand pauses that
 * (so a read never wipes corrections) until the page is read again on request.
 */
export function usePageTranscript(page: PageMeta, editor: Editor | null, onSaved: () => void) {
  const pageId = page.id
  const [text, setText] = useState<string | null>(null)
  const [auto, setAuto] = useState(true)
  const [read, setRead] = useState<ReadState>({ kind: 'idle' })
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  // Ink drawn since the last read, found when the page loaded.
  const [unread, setUnread] = useState(false)

  const textRef = useRef<string | null>(null)
  const autoRef = useRef(true)
  const pending = useRef<string | null>(null)
  const editTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const readAgain = useRef(false)
  const alive = useRef(true)
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Load the transcript and whether it's still Claude's; save hand edits (debounced, flushed on
  // switch or close).
  useEffect(() => {
    alive.current = true
    Promise.all([pagesApi.loadTranscript(pageId), pagesApi.get(pageId)]).then(([md, meta]) => {
      if (!alive.current) return
      textRef.current = md
      setText(md)
      const isAuto = meta.transcriptAuto ?? md.trim() === ''
      autoRef.current = isAuto
      setAuto(isAuto)
      setUnread(!!meta.inkAt && (!meta.readAt || meta.inkAt > meta.readAt))
    })

    const flush = () => {
      if (editTimer.current) clearTimeout(editTimer.current)
      editTimer.current = null
      const md = pending.current
      pending.current = null
      return md === null ? Promise.resolve() : pagesApi.saveTranscript(pageId, md)
    }
    flushRef.current = flush
    const stopFlushHandler = window.quill.onFlushRequest(flush)
    return () => {
      alive.current = false
      if (readTimer.current) clearTimeout(readTimer.current)
      stopFlushHandler()
      flush()
    }
  }, [pageId])

  /** A hand edit: saved shortly, and auto-read stops replacing the transcript. */
  const edit = useCallback((md: string) => {
    textRef.current = md
    setText(md)
    autoRef.current = false
    setAuto(false)
    if (readTimer.current) clearTimeout(readTimer.current)
    // The bar now says auto-read is paused (a read already under way finishes but isn't used).
    setRead((r) => (r.kind === 'reading' ? r : { kind: 'idle' }))
    pending.current = md
    if (editTimer.current) clearTimeout(editTimer.current)
    editTimer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS)
  }, [])

  /** Claude's read becomes the transcript. */
  const apply = useCallback(
    (md: string, readAt: string) => {
      if (editTimer.current) clearTimeout(editTimer.current)
      pending.current = null
      textRef.current = md
      setText(md)
      autoRef.current = true
      setAuto(true)
      return pagesApi.saveTranscript(pageId, md, readAt)
    },
    [pageId],
  )

  /** Read the whole page. `force` (asked for) replaces even a hand-edited transcript. */
  const readPage = useCallback(
    async (force: boolean) => {
      if (!editor || textRef.current === null) return
      if (!force && !autoRef.current) return
      if (inFlight.current) {
        readAgain.current = true
        return
      }
      if (readTimer.current) clearTimeout(readTimer.current)
      const startedAt = new Date().toISOString()
      if (inkIds(editor).length === 0) {
        // Everything erased: the transcript empties too (unless it's hand-written).
        if (textRef.current !== '') await apply('', startedAt)
        setRead({ kind: 'idle' })
        return
      }

      inFlight.current = true
      setRead({ kind: 'reading' })
      try {
        const image = await pageImage(editor)
        if (!image) return
        const result = await window.quill.ink.read(image.png)
        if (!alive.current) return
        if (!result.ok) {
          setRead({ kind: 'error', message: result.error })
        } else if (force || autoRef.current) {
          // A hand edit made while Claude was reading wins over the read.
          await apply(result.markdown, startedAt)
          setRead({ kind: 'read', at: new Date() })
        } else {
          setRead({ kind: 'idle' })
        }
      } catch (err) {
        if (alive.current) setRead({ kind: 'error', message: `Couldn't export the ink: ${(err as Error).message}` })
      } finally {
        inFlight.current = false
        if (readAgain.current && alive.current) {
          readAgain.current = false
          readPage(false)
        }
      }
    },
    [editor, apply],
  )
  const readRef = useRef(readPage)
  readRef.current = readPage

  const schedule = useCallback(() => {
    if (!autoRef.current) return
    if (readTimer.current) clearTimeout(readTimer.current)
    setRead((r) => (r.kind === 'reading' ? r : { kind: 'waiting' }))
    readTimer.current = setTimeout(() => readRef.current(false), AUTO_READ_MS)
  }, [])

  // Every change to the ink restarts the wait.
  useEffect(() => {
    if (!editor) return
    return editor.store.listen(
      ({ changes }) => {
        // A check's marks going on or off the page isn't new writing.
        const records = [...Object.values(changes.added), ...Object.values(changes.updated).map(([, to]) => to), ...Object.values(changes.removed)]
        if (!onlyMarks(records)) schedule()
      },
      { scope: 'document', source: 'user' },
    )
  }, [editor, schedule])

  // Ink drawn since the last read (say Quill closed mid-pause) is read once the page is up.
  useEffect(() => {
    if (editor && text !== null && unread) {
      setUnread(false)
      schedule()
    }
  }, [editor, text, unread, schedule])

  const saveToLifeline = useCallback(
    async (overwrite = false) => {
      setSave({ kind: 'saving' })
      await flushRef.current() // Lifeline gets exactly what is on screen
      const result = await window.quill.lifeline.savePage(pageId, { overwrite })
      if (result.ok) {
        setSave({ kind: 'saved', created: result.created, todos: result.todos })
        onSaved()
      } else if (result.conflict) {
        setSave({ kind: 'conflict', message: result.error })
      } else {
        setSave({ kind: 'error', message: result.error })
      }
    },
    [pageId, onSaved],
  )

  return {
    text,
    auto,
    read,
    save,
    edit,
    readNow: () => readPage(true),
    saveToLifeline,
    dismissSave: () => setSave({ kind: 'idle' }),
  }
}

const PADDING = 24
/**
 * The image's longest side, at most. The API scales down bigger images, and a check's marks use
 * pixel positions in the image as sent, so Quill sends it at a size that's kept as is.
 */
const MAX_IMAGE_PX = 1500

/** The page's ink: everything but a check's marks. */
const inkIds = (editor: Editor) => editor.getCurrentPageShapes().filter((s) => !isMark(s)).map((s) => s.id)

/**
 * The page's ink as a PNG (base64), as Claude sees it, the page area it shows and its size in
 * pixels; null if there's no ink there. With `area`, just the ink in that area, cropped to it.
 */
export async function pageImage(
  editor: Editor,
  area?: Box,
): Promise<{ png: string; region: Box; size: { width: number; height: number } } | null> {
  const ids = inkIds(editor).filter((id) => {
    const b = editor.getShapePageBounds(id)
    return !area || (!!b && area.collides(b))
  })
  if (ids.length === 0) return null
  const region = area ?? Box.Common(ids.flatMap((id) => editor.getShapePageBounds(id) ?? [])).expandBy(PADDING)
  const pixelRatio = Math.min(2, MAX_IMAGE_PX / Math.max(region.w, region.h, 1))
  const { blob, width, height } = await editor.toImage(ids, {
    format: 'png',
    background: true,
    darkMode: false,
    ...(area ? { bounds: area, padding: 0 } : { padding: PADDING }),
    pixelRatio,
  })
  return { png: await toBase64(blob), region, size: { width, height } }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',', 2)[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
