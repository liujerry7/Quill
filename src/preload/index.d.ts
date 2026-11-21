import type { PagesApi } from '../shared/pages'

declare global {
  interface Window {
    quill: {
      pages: PagesApi
      /** Register a save to finish before the window closes. Returns an unsubscribe. */
      onFlushRequest(fn: () => Promise<void>): () => void
    }
  }
}

export {}
