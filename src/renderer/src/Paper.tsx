import { createContext, useContext, useId } from 'react'
import { useEditor, useValue } from 'tldraw'
import type { Paper } from '../../shared/pages'

/** Spacing in canvas units: ruled lines, and graph-paper squares. */
const LINE_GAP = 36
const GRID_GAP = 24
/** Lines never drawn closer than this on screen; zoomed far out, every other line drops. */
const MIN_SCREEN_GAP = 10

export const PaperContext = createContext<Paper>('plain')

/**
 * tldraw's background, with ruled lines or graph paper that pan and zoom with the ink. It's
 * only the background, so it never appears in the image Claude reads.
 */
export function PaperBackground() {
  const paper = useContext(PaperContext)
  const editor = useEditor()
  const camera = useValue('camera', () => editor.getCamera(), [editor])
  // useId's characters aren't all safe inside url(#…).
  const id = `paper${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  if (paper === 'plain') return <div className="tl-background" />

  let gap = paper === 'lined' ? LINE_GAP : GRID_GAP
  while (gap * camera.z < MIN_SCREEN_GAP) gap *= 2
  // A canvas point p shows on screen at (p + camera) * zoom.
  const step = gap * camera.z
  const x = mod(camera.x * camera.z, step)
  const y = mod(camera.y * camera.z, step)
  return (
    <div className="tl-background">
      <svg className={`paper paper-${paper}`} aria-hidden="true">
        <defs>
          <pattern id={id} width={step} height={step} x={x} y={y} patternUnits="userSpaceOnUse">
            {paper === 'lined' ? (
              <line x1={0} y1={0.5} x2={step} y2={0.5} />
            ) : (
              <path d={`M ${step} 0.5 H 0.5 V ${step}`} fill="none" />
            )}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  )
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m
}
