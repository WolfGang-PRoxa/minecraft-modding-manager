import { app } from 'electron'
import { execFile } from 'node:child_process'
import { APP_NAME } from '../shared/config'

/**
 * Lancement au démarrage de Windows (valeur de la clé Run) : selon le réglage launchMode, l'application reste en
 * arrière-plan (icône de la zone de notification seulement) ou ouvre sa fenêtre réduite dans la barre des tâches.
 * Aussi passé par l'installeur à l'application qu'il relance après une mise à jour, si sa fenêtre était réduite.
 */
export const MINIMIZED_SWITCH = '--minimized'

/** Relancée par l'installeur après une mise à jour alors qu'elle tournait en arrière-plan : elle y reste. */
export const BACKGROUND_SWITCH = '--background'

/** Comment la fenêtre s'ouvre au lancement : affichée, réduite dans la barre des tâches, ou cachée (arrière-plan). */
export type LaunchWindow = 'shown' | 'minimized' | 'hidden'

export function launchWindow(argv: readonly string[], launchMode: 'background' | 'window'): LaunchWindow {
  if (argv.includes(BACKGROUND_SWITCH)) return 'hidden'
  if (argv.includes(MINIMIZED_SWITCH)) return launchMode === 'background' ? 'hidden' : 'minimized'
  return 'shown'
}

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'

/** La commande de la valeur « Modding Manager » de la clé Run, ou null si elle n'existe pas. */
function registeredCommand(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', RUN_KEY, '/v', APP_NAME], { windowsHide: true }, (err, stdout) => {
      // Valeur absente : reg répond par une erreur.
      if (err) return resolve(null)
      resolve(/REG_(?:EXPAND_)?SZ\s+(.+)$/m.exec(stdout)?.[1].trim() ?? null)
    })
  })
}

/**
 * Lancement avec Windows (réglage launchAtStartup) : une valeur « Modding Manager » de la clé Run de l'utilisateur,
 * qui lance l'exécutable avec --minimized (la même quel que soit launchMode, lu au lancement). L'installeur la retire
 * à la désinstallation.
 *
 * Elle n'est écrite que si elle manque ou ne lance plus cet exécutable ainsi, et retirée seulement si elle existe : la
 * réécrire à chaque lancement réactiverait l'application que l'utilisateur a désactivée dans les applications de
 * démarrage de Windows. Electron ne la retrouve pas lui-même (getLoginItemSettings ne la liste pas) : elle est relue
 * avec reg. Rien en développement, qui inscrirait electron.exe.
 */
export async function syncLaunchAtStartup(enabled: boolean): Promise<void> {
  if (!app.isPackaged || process.platform !== 'win32') return
  const args = [MINIMIZED_SWITCH]
  const registered = await registeredCommand()
  // Écrite par Electron sous cette forme : chemin entre guillemets, puis les arguments.
  const expected = `"${process.execPath}" ${args.join(' ')}`
  if (enabled ? registered?.toLowerCase() === expected.toLowerCase() : registered === null) return
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args, name: APP_NAME })
}
