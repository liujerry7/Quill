import { useCallback, useEffect, useState } from 'react'
import type { PageMeta } from '../../shared/pages'
import { PageCanvas } from './PageCanvas'
import { PageList } from './PageList'

const api = window.quill.pages

// On launch: reopen the last page, or start a first page if there are none.
// Runs once per app load (StrictMode mounts twice in dev; this must not make two pages).
const launch = (async () => {
  let list = await api.list()
  if (list.length === 0) list = [await api.create()]
  const last = await api.getLastOpened()
  return { list, openId: last ?? list[list.length - 1].id }
})()

export function App() {
  const [pages, setPages] = useState<PageMeta[] | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    launch.then(({ list, openId }) => {
      if (cancelled) return
      setPages(list)
      setCurrentId(openId)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (currentId) api.setLastOpened(currentId)
  }, [currentId])

  const createPage = useCallback(async () => {
    const page = await api.create()
    setPages((prev) => [...(prev ?? []), page])
    setCurrentId(page.id)
  }, [])

  const renamePage = useCallback(async (id: string, name: string) => {
    const updated = await api.rename(id, name)
    setPages((prev) => prev?.map((p) => (p.id === id ? updated : p)) ?? null)
  }, [])

  const removePage = useCallback(
    async (id: string) => {
      await api.remove(id)
      let remaining = (pages ?? []).filter((p) => p.id !== id)
      if (remaining.length === 0) remaining = [await api.create()]
      setPages(remaining)
      if (id === currentId) setCurrentId(remaining[remaining.length - 1].id)
    },
    [pages, currentId],
  )

  if (!pages || !currentId) return <div className="loading">Opening Quill…</div>

  return (
    <div className="app">
      <PageList
        pages={pages}
        currentId={currentId}
        onSelect={setCurrentId}
        onCreate={createPage}
        onRename={renamePage}
        onRemove={removePage}
      />
      <main className="canvas">
        {/* Keyed by page so each page gets a fresh editor and store. */}
        <PageCanvas key={currentId} pageId={currentId} />
      </main>
    </div>
  )
}
