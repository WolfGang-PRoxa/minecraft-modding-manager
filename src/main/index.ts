import { app, BrowserWindow, Menu, protocol, session, shell, type Session } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '../shared/config'
import { cleanAppUpdateDownloads, noteRunningVersion } from './appUpdate'
import { setCurseForgeApiOverride } from '../core/curseforgeAuth'
import { setModrinthApiOverride } from '../core/modrinth'
import { setHangarApiOverride } from '../core/hangar'
import { setGitHubApiOverride } from '../core/githubEnv'
import { registerIpc } from './ipc'
import { MAINTENANCE_SWITCH, runScheduledMaintenance } from './maintenance'
import { getSettings, useSettingsFile } from '../core/settings'
import { findTheme, windowBackground } from '../shared/appearance'
import { enablePreviousIdentityMigration, migrateDataDir } from '../core/previousIdentity'
import { migratePreviousInstallation } from './previousIdentity'
import { WINDOWS_APP_ID } from './shortcut'
import { COVER_SCHEME, registerStudio, stopStudioTasks } from './studioIpc'
import { applyInterfaceScale, MIN_WINDOW_SIZE, toggleFullScreen, watchWindowState } from './windowState'

let mainWindow: BrowserWindow | null = null

// Seule permission dont la page a besoin : écrire dans le presse-papiers (bouton « Copier » du code de connexion
// GitHub). Caméra, micro, position, notifications de la page, accès aux périphériques… sont tous refusés.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write'])

function restrictPermissions(target: Session): void {
  target.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
  target.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
  target.setDevicePermissionHandler(() => false)
}

async function createWindow(): Promise<void> {
  const { appearance } = await getSettings()
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 900,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    frame: false,
    show: false,
    // Déjà aux couleurs du style choisi, avant que la page ne s'affiche.
    backgroundColor: windowBackground(findTheme(appearance)),
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
  // Taille de l'interface : le zoom est réappliqué à chaque chargement de la page (Chromium le retient par origine).
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) void getSettings().then((s) => mainWindow && applyInterfaceScale(mainWindow, s.appearance.scale))
  })

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

// En développement, MM_GITHUB_API et MM_CURSEFORGE_API permettent de pointer vers de faux serveurs.
setGitHubApiOverride(app.isPackaged ? null : process.env.MM_GITHUB_API)
setCurseForgeApiOverride(app.isPackaged ? null : process.env.MM_CURSEFORGE_API)
setModrinthApiOverride(app.isPackaged ? null : process.env.MM_MODRINTH_API)
setHangarApiOverride(app.isPackaged ? null : process.env.MM_HANGAR_API)

// Images des modpacks de la vue Studio : le protocole doit être déclaré avant `ready`.
protocol.registerSchemesAsPrivileged([{ scheme: COVER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])

// Données dans %APPDATA%\Modding Manager, que les commandes lisent aussi, repris au besoin du dossier de l'ancien nom
// (previousIdentity.ts). --user-data-dir (tests) garde la priorité.
enablePreviousIdentityMigration(app.isPackaged)
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', migrateDataDir(app.getPath('appData')))
}

if (process.argv.includes(MAINTENANCE_SWITCH)) {
  // Passage de la tâche planifiée : sans fenêtre ni verrou d'instance (la fenêtre peut être ouverte), avec ses
  // propres données de Chromium ; les réglages, jetons et journal restent ceux de l'application.
  useSettingsFile(join(app.getPath('userData'), 'settings.json'))
  app.setPath('userData', join(app.getPath('userData'), 'maintenance-session'))
  void app.whenReady().then(() => {
    app.setAppUserModelId(WINDOWS_APP_ID)
    return runScheduledMaintenance()
  })
} else if (!app.requestSingleInstanceLock()) {
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
    app.setAppUserModelId(WINDOWS_APP_ID)
    Menu.setApplicationMenu(null)
    restrictPermissions(session.defaultSession)
    const launch = await noteRunningVersion()
    cleanAppUpdateDownloads()
    void migratePreviousInstallation()
    registerIpc(() => mainWindow, launch)
    await registerStudio(() => mainWindow)
    await createWindow()
  })

  app.on('window-all-closed', () => app.quit())
}
