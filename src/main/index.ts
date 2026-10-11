import { app, BrowserWindow, Menu, protocol, shell } from 'electron'
import { join } from 'node:path'
import { APP_NAME, APP_USER_MODEL_ID, LEGACY_APP_NAME } from '../shared/config'
import { cleanAppUpdateDownloads, noteRunningVersion } from './appUpdate'
import { setGitHubApiOverride } from '../core/githubEnv'
import { registerIpc } from './ipc'
import { useSettingsFile } from '../core/settings'
import { renameLegacyDesktopShortcut } from './shortcut'
import { COVER_SCHEME, registerStudio, stopStudioTasks } from './studioIpc'
import { toggleFullScreen, watchWindowState } from './windowState'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#0a0d12',
    // Une fois packagée, l'application utilise l'icône intégrée à l'exécutable.
    icon: app.isPackaged ? undefined : join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Ouverte en grand, la barre des tâches restant visible : le plein écran est au bout de F11.
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })
  watchWindowState(mainWindow)

  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'application.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Bloque aussi un fichier lâché hors d'une zone de dépôt, qui remplacerait la page.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault()
      toggleFullScreen(mainWindow!)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    stopStudioTasks()
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// En développement, MPD_GITHUB_API permet de pointer vers un faux serveur de releases.
setGitHubApiOverride(app.isPackaged ? null : process.env.MPD_GITHUB_API)

// Images des modpacks de la vue Studio : le protocole doit être déclaré avant `ready`.
protocol.registerSchemesAsPrivileged([{ scheme: COVER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])

// Les données restent dans le dossier de l'ancien nom (%APPDATA%\Modpack Downloader), que les scripts lisent aussi :
// par défaut, Electron le tirerait de productName. --user-data-dir (tests) garde la priorité.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), LEGACY_APP_NAME))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  useSettingsFile(join(app.getPath('userData'), 'settings.json'))

  // Relancée alors qu'elle tourne déjà (raccourci, `--studio`…) : la fenêtre revient au premier plan.
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.send('app:activated', argv.includes('--studio') ? 'studio' : null)
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_USER_MODEL_ID)
    Menu.setApplicationMenu(null)
    const launch = await noteRunningVersion()
    cleanAppUpdateDownloads()
    renameLegacyDesktopShortcut()
    registerIpc(() => mainWindow, launch)
    await registerStudio(() => mainWindow)
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
