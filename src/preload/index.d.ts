import type { LifelineApi } from '../shared/lifeline'
import type { PagesApi } from '../shared/pages'
import type { ReadApi } from '../shared/read'

declare global {
  interface Window {
    quill: {
      pages: PagesApi
      ink: ReadApi
      lifeline: LifelineApi
      /** Register a save to finish before the window closes. Returns an unsubscribe. */
      onFlushRequest(fn: () => Promise<void>): () => void
    }
  }
}

export {}
