import { contextBridge, ipcRenderer } from 'electron'
import type { AppApi } from '../shared/app'
import type { LifelineApi } from '../shared/lifeline'
import type { PagesApi } from '../shared/pages'
import type { ReadApi } from '../shared/read'

const pages: PagesApi = {
  list: () => ipcRenderer.invoke('pages:list'),
  create: (projectId, name) => ipcRenderer.invoke('pages:create', projectId, name),
  rename: (id, name) => ipcRenderer.invoke('pages:rename', id, name),
  setProject: (id, projectId) => ipcRenderer.invoke('pages:setProject', id, projectId),
  remove: (id) => ipcRenderer.invoke('pages:remove', id),
  load: (id) => ipcRenderer.invoke('pages:load', id),
  save: (id, content) => ipcRenderer.invoke('pages:save', id, content),
  loadTranscript: (id) => ipcRenderer.invoke('pages:loadTranscript', id),
  saveTranscript: (id, markdown) => ipcRenderer.invoke('pages:saveTranscript', id, markdown),
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

const ink: ReadApi = {
  read: (pngBase64) => ipcRenderer.invoke('ink:read', pngBase64),
}

const lifeline: LifelineApi = {
  isConfigured: () => ipcRenderer.invoke('lifeline:isConfigured'),
  listProjects: () => ipcRenderer.invoke('lifeline:listProjects'),
  listFilters: () => ipcRenderer.invoke('lifeline:listFilters'),
  currentProjectId: () => ipcRenderer.invoke('lifeline:currentProjectId'),
  listDocs: (projectId) => ipcRenderer.invoke('lifeline:listDocs', projectId),
  readDoc: (docId) => ipcRenderer.invoke('lifeline:readDoc', docId),
  savePage: (pageId, opts) => ipcRenderer.invoke('lifeline:savePage', pageId, opts),
}

const appApi: AppApi = {
  setup: () => ipcRenderer.invoke('app:setup'),
  openEnv: () => ipcRenderer.invoke('app:openEnv'),
  restart: () => ipcRenderer.invoke('app:restart'),
  updateReady: () => ipcRenderer.invoke('app:updateReady'),
  onUpdateReady: (fn) => {
    const listener = (_e: Electron.IpcRendererEvent, version: string) => fn(version)
    ipcRenderer.on('app:updateReady', listener)
    return () => {
      ipcRenderer.removeListener('app:updateReady', listener)
    }
  },
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
}

contextBridge.exposeInMainWorld('quill', { app: appApi, pages, ink, lifeline, onFlushRequest })
