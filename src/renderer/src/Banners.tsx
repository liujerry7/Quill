import { useEffect, useState } from 'react'
import type { SetupStatus } from '../../shared/app'

const appApi = window.quill.app

/** Floating notes along the top: an update waiting for a restart, or keys still to fill in. */
export function Banners() {
  const [update, setUpdate] = useState<string | null>(null)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    appApi.updateReady().then((v) => v && setUpdate(v))
    appApi.setup().then(setSetup)
    return appApi.onUpdateReady(setUpdate)
  }, [])

  const openEnv = () => appApi.openEnv().catch((err: Error) => setError(err.message))
  const install = () => {
    setInstalling(true)
    appApi.installUpdate()
  }

  const needsKeys = (setup?.missing.length ?? 0) > 0
  if (!update && !needsKeys) return null
  return (
    <div className="banners">
      {update && (
        <div className="banner">
          <span>Quill {update} is ready.</span>
          <button className="primary" onClick={install} disabled={installing}>
            {installing ? 'Restarting…' : 'Restart to update'}
          </button>
        </div>
      )}
      {needsKeys && (
        <div className="banner">
          <span title={setup!.envPath}>
            To read handwriting, add <code>{setup!.missing.join(', ')}</code> to Quill's .env, save it, then restart.
          </span>
          <button onClick={openEnv}>Open .env</button>
          <button className="primary" onClick={() => appApi.restart()}>Restart</button>
          {error && <span className="error-text">{error}</span>}
        </div>
      )}
    </div>
  )
}
