import { app } from 'electron'
import { execFile } from 'node:child_process'
import { APP_NAME } from '../shared/config'

/** Lancement au démarrage de Windows : la fenêtre s'ouvre réduite dans la barre des tâches. */
export const MINIMIZED_SWITCH = '--minimized'

/** Lancée réduite (démarrage de Windows, ou relancée ainsi par l'installeur après une mise à jour). */
export const startsMinimized = (): boolean => process.argv.includes(MINIMIZED_SWITCH)

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
 * qui lance l'exécutable avec --minimized. L'installeur la retire à la désinstallation.
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
