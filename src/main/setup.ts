import { app } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { SetupStatus } from '../shared/app'

// Secrets (ANTHROPIC_API_KEY, LIFELINE_TOKEN) come from a .env file and stay in this process.
// Running from source it's the project's .env; the installed app keeps one in its data folder,
// %APPDATA%\quill\.env, since nothing secret may be built into the installer.

const TEMPLATE = `# Quill's keys. Fill them in, save, then restart Quill.
# Read only by Quill's main process; the window never sees them.
ANTHROPIC_API_KEY=

# Lifeline (optional): Settings > AI access shows the server URL and mints a read-and-write token.
LIFELINE_URL=
LIFELINE_TOKEN=
`

export function envPath(): string {
  return app.isPackaged ? path.join(app.getPath('userData'), '.env') : path.join(app.getAppPath(), '.env')
}

/** Load the keys. Call after userData is settled. */
export function loadEnv(): void {
  try {
    process.loadEnvFile(envPath())
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

/** Make sure the .env exists (from the template) so there's something to open and fill in. */
export function ensureEnvFile(): string {
  const file = envPath()
  if (!existsSync(file)) writeFileSync(file, TEMPLATE, { encoding: 'utf8', flag: 'wx' })
  return file
}

export function setupStatus(): SetupStatus {
  return {
    envPath: envPath(),
    missing: process.env.ANTHROPIC_API_KEY?.trim() ? [] : ['ANTHROPIC_API_KEY'],
  }
}
