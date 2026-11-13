import { app, BrowserWindow, dialog, Menu, protocol, session, shell, type Session } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '../shared/config'
import { autoUpdateOnLaunch, cleanAppUpdateDownloads, noteRunningVersion } from './appUpdate'
import { setCurseForgeApiOverride } from '../core/curseforgeAuth'
import { setModrinthApiOverride } from '../core/modrinth'
import { setHangarApiOverride } from '../core/hangar'
import { setGitHubApiOverride } from '../core/githubEnv'
import { registerIpc } from './ipc'
import { MAINTENANCE_SWITCH, runScheduledMaintenance } from './maintenance'
import { getSettings, updateSettings, useSettingsFile } from '../core/settings'
import { findTheme, windowBackground } from '../shared/appearance'
import { enablePreviousIdentityMigration, migrateDataDir } from '../core/previousIdentity'
import { migratePreviousInstallation } from './previousIdentity'
import { WINDOWS_APP_ID } from './shortcut'
import { BACKGROUND_SWITCH, launchWindow, MINIMIZED_SWITCH, syncLaunchAtStartup, type LaunchWindow } from './startup'
import { COVER_SCHEME, registerStudio, stopStudioTasks, windowStudioTask } from './studioIpc'
import { announceBackground, createTray, destroyTray } from './tray'
import { applyInterfaceScale, MIN_WINDOW_SIZE, toggleFullScreen, watchWindowState } from './windowState'

let mainWindow: BrowserWindow | null = null

// Fermer la fenêtre la cache : l'application continue en arrière-plan, avec son icône dans la zone de notification,
// et se rouvre aussitôt. Elle ne se ferme vraiment qu'en la quittant (menu de l'icône, mise à jour, fin de session).
let quitting = false
/** La fenêtre n'a encore jamais été montrée (lancement en arrière-plan) : elle s'ouvrira en grand. */
let neverShown = true

/** Montre la fenêtre (icône de la zone de notification, nouveau lancement, notification) et la met au premier plan. */
function showWindow(view: 'library' | 'studio' | null = null): void {
  if (!mainWindow) return
  if (neverShown) {
    neverShown = false
    mainWindow.maximize()
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('app:activated', view)
}

/** Cache la fenêtre ; la première fois, une bulle rappelle que l'application tourne encore. */
async function hideWindow(): Promise<void> {
  mainWindow?.hide()
  const settings = await getSettings()
  if (settings.backgroundHintShown) return
  announceBackground()
  await updateSettings({ backgroundHintShown: true }).catch(() => {})
}

// Seule permission dont la page a besoin : écrire dans le presse-papiers (bouton « Copier » du code de connexion
// GitHub). Caméra, micro, position, notifications de la page, accès aux périphériques… sont tous refusés.
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write'])

function restrictPermissions(target: Session): void {
  target.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
  target.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
  target.setDevicePermissionHandler(() => false)
}

async function createWindow(launch: LaunchWindow): Promise<void> {
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

  // Ouverte en grand, la barre des tâches restant visible : le plein écran est au bout de F11. Lancée avec Windows,
  // elle reste cachée (arrière-plan) ou s'ouvre réduite dans la barre des tâches, selon le réglage launchMode, et en
  // grand la première fois qu'on la rouvre. Cachée, la page est tout de même chargée : la fenêtre s'affiche aussitôt.
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || launch === 'hidden') return
    neverShown = false
    if (launch === 'minimized') {
      mainWindow.minimize()
      // Lancée par l'Explorateur (démarrage de Windows, relance par l'installeur), le premier affichage de la fenêtre
      // suit la façon dont il l'a lancée (fenêtre normale) et non celle demandée : elle est réduite une seconde fois.
      if (!mainWindow.isMinimized()) mainWindow.minimize()
      mainWindow.once('restore', () => mainWindow?.maximize())
    } else {
      mainWindow.maximize()
      mainWindow.show()
    }
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

  // Fermer la fenêtre la cache seulement. En quittant pour de bon, une publication en cours serait interrompue sans
  // que le publieur le voie : elle est d'abord confirmée.
  let closeConfirmed = false
  mainWindow.on('close', (event) => {
    if (!mainWindow) return
    if (!quitting) {
      event.preventDefault()
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false)
      void hideWindow()
      return
    }
    const task = windowStudioTask()
    if (closeConfirmed || !task) return
    event.preventDefault()
    // Quitter est remis à plus tard : la croix doit de nouveau cacher la fenêtre.
    quitting = false
    showWindow()
    void dialog
      .showMessageBox(mainWindow, {
        type: 'warning',
        title: APP_NAME,
        message: `${task.charAt(0).toUpperCase()}${task.slice(1)} est en cours.`,
        detail: 'Fermer l’application l’interrompt proprement : ce qui est déjà fait est conservé, le reste sera repris la prochaine fois.',
        buttons: ['Continuer', 'Fermer quand même'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      .then(({ response }) => {
        if (response !== 1 || !mainWindow) return
        closeConfirmed = true
        app.quit()
      })
  })

  // Fin de la session Windows (déconnexion, arrêt) : l'application se ferme vraiment.
  mainWindow.on('session-end', () => {
    quitting = true
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

  // Relancée alors qu'elle tourne déjà (raccourci, épingle, notification, `--studio`…) : la fenêtre revient au
  // premier plan, même cachée en arrière-plan. Un lancement avec Windows en double ne la montre pas.
  app.on('second-instance', (_event, argv) => {
    if (argv.includes(MINIMIZED_SWITCH) || argv.includes(BACKGROUND_SWITCH)) return
    showWindow(argv.includes('--studio') ? 'studio' : null)
  })

  app.on('before-quit', () => {
    quitting = true
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId(WINDOWS_APP_ID)
    Menu.setApplicationMenu(null)
    restrictPermissions(session.defaultSession)
    const launch = await noteRunningVersion()
    const settings = await getSettings()
    void syncLaunchAtStartup(settings.launchAtStartup)
    cleanAppUpdateDownloads()
    void migratePreviousInstallation()
    registerIpc(() => mainWindow, { ...launch, autoUpdate: autoUpdateOnLaunch(settings.autoUpdate, launch.justUpdated) })
    await registerStudio(() => mainWindow)
    await createWindow(launchWindow(process.argv, settings.launchMode))
    await createTray({ open: showWindow, quit: () => app.quit() }).catch((err) => console.warn('Icône de la zone de notification impossible :', err))
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => destroyTray())
}
