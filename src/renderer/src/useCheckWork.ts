import { useCallback, useEffect, useRef, useState } from 'react'
import type { Box, Editor } from 'tldraw'
import { type CheckResult, sameArea } from '../../shared/read'
import { clearMarks, drawMarks } from './checkMarks'
import { pageImage } from './usePageTranscript'

export type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string }

/**
 * Claude's checks of the problems worked on a page, newest first. Checking an area marks it in
 * red pen and replaces any earlier check of the same area; removing a check takes its marks off.
 */
export function useCheckWork(pageId: string, editor: Editor | null) {
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [state, setState] = useState<CheckState>({ kind: 'idle' })
  const alive = useRef(true)
  const checksRef = useRef(checks)
  checksRef.current = checks

  useEffect(() => {
    alive.current = true
    window.quill.pages.loadChecks(pageId).then((saved) => {
      if (alive.current) setChecks(saved)
    })
    return () => {
      alive.current = false
    }
  }, [pageId])

  /** Checks the work in `area`; `transcript` lets corrections point at its lines. */
  const checkArea = useCallback(
    async (area: Box, transcript: string) => {
      if (!editor) return
      setState({ kind: 'checking' })
      try {
        const image = await pageImage(editor, area)
        if (!image) {
          setState({ kind: 'error', message: 'No writing in that box. Drag it over a problem and your working.' })
          return
        }
        const region = { x: area.x, y: area.y, w: area.w, h: area.h }
        const result = await window.quill.ink.check(pageId, image.png, transcript, image.size, region)
        if (!alive.current) return
        if (result.ok) {
          const check = result.check
          const replaced = checksRef.current.filter((c) => sameArea(c.region, check.region)).map((c) => c.id)
          drawMarks(editor, check.id, check.marks, area, replaced)
          setChecks((prev) => [check, ...prev.filter((c) => !replaced.includes(c.id))])
          setState({ kind: 'idle' })
        } else {
          setState({ kind: 'error', message: result.error })
        }
      } catch (err) {
        if (alive.current) setState({ kind: 'error', message: `Couldn't check that: ${(err as Error).message}` })
      }
    },
    [editor, pageId],
  )

  /** Forgets a check and takes its marks off the page. */
  const remove = useCallback(
    async (checkId: string) => {
      if (editor) clearMarks(editor, [checkId])
      setChecks((prev) => prev.filter((c) => c.id !== checkId))
      await window.quill.pages.removeCheck(pageId, checkId)
    },
    [editor, pageId],
  )

  return { checks, state, checkArea, remove }
}
