// Reading handwriting: the renderer sends a PNG of the ink, main asks Claude for Markdown.

export type ReadResult = { ok: true; markdown: string } | { ok: false; error: string }

export interface ReadApi {
  /** `pngBase64` is the exported ink, base64 without a data: prefix. */
  read(pngBase64: string): Promise<ReadResult>
}
