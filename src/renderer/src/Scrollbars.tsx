import { useEffect, useRef, useState } from 'react'
import { type Editor, useEditor, useValue } from 'tldraw'

// Scroll bars for the page. tldraw's canvas has none of its own, being infinite; these treat the
// page as running from the ink's top to a screen past its bottom (blank paper to write on), and
// as wide as the ink. Drag a thumb to scroll, or tap the track to move a screen at a time.

const MIN_THUMB_PX = 28

type Axis = 'x' | 'y'

interface Extent {
  /** Where the page starts and ends on this axis, in page units. */
  start: number
  end: number
  /** The window's start and size on this axis, in page units. */
  view: number
  size: number
}

function extent(editor: Editor, axis: Axis): Extent {
  const vp = editor.getViewportPageBounds()
  const ink = editor.getCurrentPageBounds()
  const [vMin, vMax, vSize] = axis === 'y' ? [vp.minY, vp.maxY, vp.height] : [vp.minX, vp.maxX, vp.width]
  const [iMin, iMax] = ink ? (axis === 'y' ? [ink.minY, ink.maxY] : [ink.minX, ink.maxX]) : [vMin, vMin]
  // Below the ink there's always a screen of blank page to scroll down into.
  const end = Math.max(vMax, axis === 'y' ? iMax + vSize : iMax)
  return { start: Math.min(vMin, iMin), end, view: vMin, size: vSize }
}

/** Moves the window so it starts at `start` (page units) on this axis. */
function scrollTo(editor: Editor, axis: Axis, start: number) {
  const camera = editor.getCamera()
  // A page point p is on screen at (p + camera) × zoom, so the window starts at -camera.
  editor.setCamera(axis === 'y' ? { ...camera, y: -start } : { ...camera, x: -start })
}

function Bar({ axis }: { axis: Axis }) {
  const editor = useEditor()
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<{ from: number; start: number; perPx: number } | null>(null)
  const e = useValue(`scroll ${axis}`, () => extent(editor, axis), [editor, axis])
  const [trackPx, setTrackPx] = useState(0)

  const total = e.end - e.start
  const shown = total > e.size + 1
  useEffect(() => {
    const el = track.current
    if (!el) return
    const measure = () => setTrackPx(axis === 'y' ? el.clientHeight : el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [axis, shown])

  // Nothing to scroll to: no bar (the vertical one always has the blank screen below the ink).
  if (!shown) return null
  const thumbPx = Math.max(MIN_THUMB_PX, (e.size / total) * trackPx)
  const offsetPx = trackPx > thumbPx ? ((e.view - e.start) / (total - e.size)) * (trackPx - thumbPx) : 0
  const pos = (ev: React.PointerEvent) => (axis === 'y' ? ev.clientY : ev.clientX)

  return (
    <div
      ref={track}
      className={`page-scroll page-scroll-${axis}`}
      // Keep tldraw from treating these as strokes on the page.
      onPointerDown={(ev) => {
        ev.stopPropagation()
        if (ev.target !== ev.currentTarget) return
        // A tap on the track moves a screen towards it.
        const rect = ev.currentTarget.getBoundingClientRect()
        const at = pos(ev) - (axis === 'y' ? rect.top : rect.left)
        scrollTo(editor, axis, e.view + (at < offsetPx ? -1 : 1) * e.size * 0.9)
      }}
    >
      <div
        className="page-scroll-thumb"
        style={axis === 'y' ? { top: offsetPx, height: thumbPx } : { left: offsetPx, width: thumbPx }}
        onPointerDown={(ev) => {
          ev.stopPropagation()
          ev.currentTarget.setPointerCapture(ev.pointerId)
          const room = trackPx - thumbPx
          drag.current = { from: pos(ev), start: e.view, perPx: room > 0 ? (total - e.size) / room : 0 }
        }}
        onPointerMove={(ev) => {
          const d = drag.current
          if (d) scrollTo(editor, axis, d.start + (pos(ev) - d.from) * d.perPx)
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
    </div>
  )
}

export function Scrollbars() {
  return (
    <>
      <Bar axis="y" />
      <Bar axis="x" />
    </>
  )
}
