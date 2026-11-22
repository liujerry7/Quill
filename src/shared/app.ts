// The app itself: where its keys live, and updates to the installed app.

export interface SetupStatus {
  /** The .env file Quill reads its keys from. */
  envPath: string
  /** Keys it still needs, e.g. ["ANTHROPIC_API_KEY"]. Lifeline's are optional and not listed. */
  missing: string[]
}

export interface AppApi {
  setup(): Promise<SetupStatus>
  /** Opens Quill's .env in the system editor (it's created from a template if absent). */
  openEnv(): Promise<void>
  /** Saves, closes and starts Quill again, e.g. after editing .env. */
  restart(): Promise<void>
  /** The version of an update that has downloaded and is waiting for a restart, if any. */
  updateReady(): Promise<string | null>
  /** Calls `fn` when an update finishes downloading. Returns an unsubscribe function. */
  onUpdateReady(fn: (version: string) => void): () => void
  /** Saves, closes, installs the downloaded update and reopens Quill. */
  installUpdate(): Promise<void>
}
