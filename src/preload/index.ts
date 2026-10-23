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
  getCurseForgeAuth: () => ipcRenderer.invoke('cfauth:status'),
  saveCurseForgeSecret: (kind, value) => ipcRenderer.invoke('cfauth:save', kind, value),
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
  deleteModVersion: (folder, version) => ipcRenderer.invoke('studio:deleteModVersion', folder, version),
  createModFromSource: () => ipcRenderer.invoke('studio:createModFromSource'),
  availableModVersions: (folder) => ipcRenderer.invoke('studio:availableModVersions', folder),
  importModVersions: (folder, versions) => ipcRenderer.invoke('studio:importModVersions', folder, versions),
  linkModSource: (folder, mode) => ipcRenderer.invoke('studio:linkModSource', folder, mode),
  publishModCurseForge: (folder, version, releaseType) => ipcRenderer.invoke('studio:publishModCurseForge', folder, version, releaseType),
  deletePack: (folder) => ipcRenderer.invoke('studio:deletePack', folder),
  deleteReleases: (tags) => ipcRenderer.invoke('studio:deleteReleases', tags),

  listInstances: () => ipcRenderer.invoke('studio:listInstances'),
  getLibrary: () => ipcRenderer.invoke('studio:library'),
  checkUpdates: (profilePath, channel) => ipcRenderer.invoke('studio:checkUpdates', profilePath, channel),
  applyUpdates: (profilePath, channel, only) => ipcRenderer.invoke('studio:applyUpdates', profilePath, channel, only),
  onUpdateProgress: (listener) => subscribe('studio:update-progress', listener),
  promoteTrial: (profilePath) => ipcRenderer.invoke('studio:promoteTrial', profilePath),
  checkProfile: (profilePath) => ipcRenderer.invoke('studio:checkProfile', profilePath),
  linkCurseForge: (folder, ref) => ipcRenderer.invoke('studio:linkCurseForge', folder, ref),
  maintenanceStatus: () => ipcRenderer.invoke('maintenance:status'),
  configureUpdates: (folder, changes) => ipcRenderer.invoke('maintenance:configure', folder, changes),
  runMaintenance: (folders) => ipcRenderer.invoke('maintenance:run', folders),
  cancelMaintenance: () => ipcRenderer.invoke('maintenance:cancel'),
  onMaintenanceProgress: (listener) => subscribe('maintenance:progress', listener),
  validateUpdate: (folder, publish) => ipcRenderer.invoke('maintenance:validate', folder, publish),
  discardUpdate: (folder) => ipcRenderer.invoke('maintenance:discard', folder),
  scheduleMaintenance: (schedule) => ipcRenderer.invoke('maintenance:schedule', schedule),
  setMaintenanceClaude: (enabled) => ipcRenderer.invoke('maintenance:setClaude', enabled),
  updatePublishTargets: (folder, changes) => ipcRenderer.invoke('studio:updatePublishTargets', folder, changes),
  publishCurseForge: (folder, version, releaseType) => ipcRenderer.invoke('studio:publishCurseForge', folder, version, releaseType),
  onCurseForgeProgress: (listener) => subscribe('studio:curseforge-progress', listener),
  curseForgeVersions: (folder) => ipcRenderer.invoke('studio:curseForgeVersions', folder),
  testServer: (profilePath) => ipcRenderer.invoke('studio:testServer', profilePath),
  testPlayers: (profilePath, players) => ipcRenderer.invoke('studio:testPlayers', profilePath, players),
  testAll: (profilePath, players) => ipcRenderer.invoke('studio:testAll', profilePath, players),
  onTestProgress: (listener) => subscribe('studio:test-progress', listener),
  cancelTest: () => ipcRenderer.invoke('studio:cancelTest'),
  lastTests: (profilePath) => ipcRenderer.invoke('studio:lastTests', profilePath),
  discardTrial: (profilePath) => ipcRenderer.invoke('studio:discardTrial', profilePath),
  linkProfile: (folder, profilePath) => ipcRenderer.invoke('studio:linkProfile', folder, profilePath),
  createPackFromProfile: (name, profilePath, includeSaves) =>
    ipcRenderer.invoke('studio:createPackFromProfile', name, profilePath, includeSaves),
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
