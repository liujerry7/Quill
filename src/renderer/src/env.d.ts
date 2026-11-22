/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** tldraw's license key, baked in at build time (CI reads it from the TLDRAW_LICENSE_KEY secret). */
  readonly RENDERER_VITE_TLDRAW_LICENSE_KEY?: string
}
