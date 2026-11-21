import { contextBridge, ipcRenderer } from 'electron'
import type { PagesApi } from '../shared/pages'

const pages: PagesApi = {
  list: () => ipcRenderer.invoke('pages:list'),
  create: (name) => ipcRenderer.invoke('pages:create', name),
  rename: (id, name) => ipcRenderer.invoke('pages:rename', id, name),
  remove: (id) => ipcRenderer.invoke('pages:remove', id),
  load: (id) => ipcRenderer.invoke('pages:load', id),
  save: (id, content) => ipcRenderer.invoke('pages:save', id, content),
  getLastOpened: () => ipcRenderer.invoke('pages:getLastOpened'),
  setLastOpened: (id) => ipcRenderer.invoke('pages:setLastOpened', id),
}

// Before the window closes, main asks the renderer to finish any pending saves.
const flushHandlers = new Set<() => Promise<void>>()
ipcRenderer.on('app:flush', async () => {
  await Promise.allSettled([...flushHandlers].map((fn) => fn()))
  ipcRenderer.send('app:flushed')
})
function onFlushRequest(fn: () => Promise<void>) {
  flushHandlers.add(fn)
  return () => {
    flushHandlers.delete(fn)
  }
}

contextBridge.exposeInMainWorld('quill', { pages, onFlushRequest })
