import type { PagesApi } from '../shared/pages'
import type { ReadApi } from '../shared/read'

declare global {
  interface Window {
    quill: {
      pages: PagesApi
      ink: ReadApi
      /** Register a save to finish before the window closes. Returns an unsubscribe. */
      onFlushRequest(fn: () => Promise<void>): () => void
    }
  }
}

export {}
