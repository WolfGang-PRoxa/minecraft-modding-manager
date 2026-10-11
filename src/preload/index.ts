import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { StudioApi } from '../shared/studio'
import type { RendererApi } from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: RendererApi = {
  getCatalog: (force) => ipcRenderer.invoke('catalog:get', force),
  getInstalled: () => ipcRenderer.invoke('installed:list'),
  getProfiles: () => ipcRenderer.invoke('curseforge:profiles'),
  install: (version) => ipcRenderer.invoke('install:start', version),
  cancelInstall: (id) => ipcRenderer.invoke('install:cancel', id),
  onInstallProgress: (listener) => subscribe('install:progress', listener),
  getCurseForgeStatus: () => ipcRenderer.invoke('curseforge:status'),
  launchCurseForge: () => ipcRenderer.invoke('curseforge:launch'),
  restartCurseForge: () => ipcRenderer.invoke('curseforge:restart'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  pickInstancesDir: () => ipcRenderer.invoke('settings:pickInstancesDir'),
  becomeReceiver: (repo) => ipcRenderer.invoke('role:receiver', repo),
  becomePublisher: (repo) => ipcRenderer.invoke('role:publisher', repo),
  getLaunchInfo: () => ipcRenderer.invoke('app:launchInfo'),
  onActivated: (listener) => subscribe('app:activated', listener),
  getAuthStatus: () => ipcRenderer.invoke('auth:status'),
  startDeviceLogin: () => ipcRenderer.invoke('auth:startDevice'),
  waitDeviceLogin: () => ipcRenderer.invoke('auth:waitDevice'),
  cancelDeviceLogin: () => ipcRenderer.invoke('auth:cancelDevice'),
  loginWithToken: (token) => ipcRenderer.invoke('auth:loginWithToken', token),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getShortcutStatus: () => ipcRenderer.invoke('shortcut:status'),
  getClaudeCodeStatus: () => ipcRenderer.invoke('claude:status'),
  connectClaudeCode: () => ipcRenderer.invoke('claude:connect'),
  createShortcut: (location) => ipcRenderer.invoke('shortcut:create', location),
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  getReportInfo: () => ipcRenderer.invoke('report:info'),
  submitReport: (report) => ipcRenderer.invoke('report:submit', report),
  openReportInBrowser: (report) => ipcRenderer.invoke('report:browser', report),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  installAppUpdate: () => ipcRenderer.invoke('app:update'),
  cancelAppUpdate: () => ipcRenderer.invoke('app:cancelUpdate'),
  onAppUpdateProgress: (listener) => subscribe('app:update-progress', listener),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onWindowStateChange: (listener) => subscribe('window:state', listener)
}

// Vue Studio (publieurs) : ranger les zips et publier les releases.
const studio: StudioApi = {
  getOverview: (options) => ipcRenderer.invoke('studio:overview', options),
  onChanged: (listener) => subscribe('studio:changed', listener),
  onAnalyzing: (listener) => subscribe('studio:analyzing', listener),

  pickWorkspaceDir: () => ipcRenderer.invoke('studio:pickWorkspace'),
  useDefaultWorkspace: () => ipcRenderer.invoke('studio:useDefaultWorkspace'),

  createPack: (name) => ipcRenderer.invoke('studio:createPack', name),
  updatePackInfo: (folder, info) => ipcRenderer.invoke('studio:updatePackInfo', folder, info),
  updatePackSettings: (folder, settings) => ipcRenderer.invoke('studio:updatePackSettings', folder, settings),
  pickCover: (folder) => ipcRenderer.invoke('studio:pickCover', folder),
  removeCover: (folder) => ipcRenderer.invoke('studio:removeCover', folder),
  setNotes: (folder, version, notes) => ipcRenderer.invoke('studio:setNotes', folder, version, notes),
  importFiles: (folder, paths) => ipcRenderer.invoke('studio:importFiles', folder, paths),

  getRangerPlan: (orders) => ipcRenderer.invoke('studio:rangerPlan', orders),
  applyRanger: (orders) => ipcRenderer.invoke('studio:applyRanger', orders),

  publish: (fingerprint) => ipcRenderer.invoke('studio:publish', fingerprint),
  cancelPublish: () => ipcRenderer.invoke('studio:cancelPublish'),
  onPublishProgress: (listener) => subscribe('studio:publish-progress', listener),

  deleteVersion: (folder, version) => ipcRenderer.invoke('studio:deleteVersion', folder, version),
  deletePack: (folder) => ipcRenderer.invoke('studio:deletePack', folder),
  deleteReleases: (tags) => ipcRenderer.invoke('studio:deleteReleases', tags),

  listInstances: () => ipcRenderer.invoke('studio:listInstances'),
  zipInstance: (folder, instancePath, includeSaves) =>
    ipcRenderer.invoke('studio:zipInstance', folder, instancePath, includeSaves),
  stripExcluded: (folder, fileName) => ipcRenderer.invoke('studio:stripExcluded', folder, fileName),
  cancelZip: () => ipcRenderer.invoke('studio:cancelZip'),
  onZipProgress: (listener) => subscribe('studio:zip-progress', listener),

  getZipContents: (folder, fileName) => ipcRenderer.invoke('studio:zipContents', folder, fileName),
  previewZipEntry: (folder, fileName, path) => ipcRenderer.invoke('studio:zipEntry', folder, fileName, path),

  openPath: (path) => ipcRenderer.invoke('studio:openPath', path),
  getPathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('studio', studio)
