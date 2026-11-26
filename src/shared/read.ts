// Reading handwriting: the renderer sends a PNG of the ink, main asks Claude for Markdown.
// Checking work: the renderer sends a PNG of an area the writer boxed with the Check work tool,
// main asks Claude to mark it.

export type ReadResult = { ok: true; markdown: string } | { ok: false; error: string }

export interface ReadApi {
  /** `pngBase64` is the exported ink, base64 without a data: prefix. */
  read(pngBase64: string): Promise<ReadResult>
  /**
   * Claude checks the worked problem in `region` of a page: right or wrong, what went right,
   * what went wrong, and where each mistake is. Kept with the page; see pages.loadChecks.
   * `transcript` is the page's transcript, so corrections can point at its lines.
   */
  check(pageId: string, pngBase64: string, transcript: string, size: ImageSize, region: PageRegion): Promise<CheckReply>
}

/** The checked image's size in pixels. */
export interface ImageSize {
  width: number
  height: number
}

/** An area of the page, in page units. */
export interface PageRegion {
  x: number
  y: number
  w: number
  h: number
}

/**
 * One mark Claude puts on the page: a mistake, a correct final answer, or (by a "?" where the
 * working should be) a pointer to the walkthrough.
 */
export interface CheckMark {
  kind: 'wrong' | 'right' | 'help'
  /** Where it is in the checked area: [x0, y0, x1, y1], each 0–1000 of its width or height. */
  box: number[]
  /** A margin note beside it on the page: a few words, plain text. */
  note: string
  /** What's wrong and the fix, in a sentence (Markdown, LaTeX math), for the transcript. */
  correction: string
  /** The transcript line it belongs after, copied exactly; empty if it's in none. */
  transcriptLine: string
}

/** One check: of the area of the page the writer boxed. */
export interface CheckResult {
  id: string
  region: PageRegion
  /** The feedback: verdict, what went right, what went wrong, a correct solution. */
  markdown: string
  marks: CheckMark[]
  checkedAt: string
}

export type CheckReply = { ok: true; check: CheckResult } | { ok: false; error: string }

/** Two checked areas are the same problem if they mostly overlap: checking it again replaces the first. */
export function sameArea(a: PageRegion, b: PageRegion): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return false
  return (w * h) / Math.min(a.w * a.h, b.w * b.h) > 0.5
}
