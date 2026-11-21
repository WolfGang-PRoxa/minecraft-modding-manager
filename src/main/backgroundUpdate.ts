// Vérifications régulières, que la fenêtre soit ouverte ou cachée (fermer la fenêtre ne quitte pas l'application) :
//  - les modpacks publiés, toutes les `packCheckMinutes` (5 minutes par défaut) : une nouvelle version d'un modpack
//    installé s'installe d'elle-même si le réglage autoUpdatePacks le permet (packAutoUpdate.ts) ;
//  - les versions de l'application, toutes les `appCheckMinutes` (10 minutes par défaut) : une nouvelle version
//    s'installe d'elle-même (réglage autoUpdate) dès que la fenêtre est cachée et que rien n'est en cours, puis
//    l'application est relancée en arrière-plan. Fenêtre affichée, rien n'est imposé : la version est proposée en haut
//    de la fenêtre, et s'installera une fois la fenêtre refermée.
// Chaque catalogue relu est envoyé à la fenêtre. Au réveil du PC, tout est revérifié. Le flux des releases évite de
// consommer le quota de l'API de GitHub à chaque vérification (github.ts).
import { powerMonitor, type BrowserWindow } from 'electron'
import { getSettings } from '../core/settings'
import type { AppUpdateResult } from '../shared/types'
import { getCatalog } from './github'
import { autoUpdatePacks } from './packAutoUpdate'

/** Intervalle entre deux examens : une vérification est-elle due, une version attend-elle que la fenêtre se cache ? */
const TICK_MS = 30_000
/** Après le réveil du PC ou la fermeture de la fenêtre : le temps que le réseau revienne, que la fenêtre se cache. */
const SOON_MS = 60_000

export interface BackgroundUpdateOptions {
  getWindow: () => BrowserWindow | null
  /** Ouvre la fenêtre (clic sur la notification d'un modpack mis à jour). */
  showWindow: () => void
  /** La mise à jour de l'application peut-elle se faire seule ? (réglage autoUpdate, application installée) */
  enabled: () => Promise<boolean>
  /** Lance la mise à jour de l'application (téléchargement, vérification, installeur, fermeture). */
  install: () => Promise<AppUpdateResult>
  now?: () => number
}

/** Ce qu'un examen décide pour l'application : rien, relire les releases, ou installer la version trouvée. */
export function nextStep(state: { lastCheck: number; intervalMs: number; pending: boolean; hidden: boolean; now: number }): 'wait' | 'check' | 'install' {
  if (state.pending && state.hidden) return 'install'
  return state.now - state.lastCheck >= state.intervalMs ? 'check' : 'wait'
}

export function startBackgroundUpdates(options: BackgroundUpdateOptions): { soon(): void } {
  const now = options.now ?? Date.now
  // Le lancement vient de tout relire (et d'installer la nouvelle version de l'application si le réglage le permet).
  let lastAppCheck = now()
  let lastPackCheck = now()
  let pending = false
  let running = false
  let soonTimer: ReturnType<typeof setTimeout> | null = null

  const hidden = () => {
    const win = options.getWindow()
    return !win || win.isDestroyed() || !win.isVisible()
  }

  async function tick(): Promise<void> {
    if (running) return
    running = true
    try {
      const settings = await getSettings()
      const packsDue = now() - lastPackCheck >= settings.packCheckMinutes * 60_000
      let step = nextStep({ lastCheck: lastAppCheck, intervalMs: settings.appCheckMinutes * 60_000, pending, hidden: hidden(), now: now() })
      if (packsDue || step === 'check') {
        const appDue = step === 'check'
        if (packsDue) lastPackCheck = now()
        if (appDue) lastAppCheck = now()
        const catalog = await getCatalog(false, { packs: packsDue, app: appDue })
        const win = options.getWindow()
        if (win && !win.isDestroyed()) win.webContents.send('catalog:changed', catalog)
        if (appDue) pending = !catalog.error && catalog.appUpdate !== null
        if (packsDue) await autoUpdatePacks(catalog, options)
        step = pending && hidden() ? 'install' : 'wait'
      }
      if (step !== 'install' || !(await options.enabled())) return
      const result = await options.install()
      // Réussite : l'application se ferme. Occupée (installation, publication…) : réessayé au prochain examen.
      // Échec (réseau, empreinte) : la version reste à installer, réessayée à la prochaine vérification.
      if (!result.ok && result.reason === 'failed') {
        console.warn('Mise à jour en arrière-plan impossible :', result.error)
        pending = false
      }
    } catch (err) {
      console.warn('Vérification en arrière-plan impossible :', err)
    } finally {
      running = false
    }
  }

  setInterval(() => void tick(), TICK_MS).unref?.()
  // PC réveillé : il a pu dormir toute la nuit, les vérifications sont dues tout de suite.
  powerMonitor.on('resume', () => {
    lastAppCheck = 0
    lastPackCheck = 0
    soon()
  })

  function soon(): void {
    if (soonTimer) clearTimeout(soonTimer)
    soonTimer = setTimeout(() => {
      soonTimer = null
      void tick()
    }, SOON_MS)
  }

  return { soon }
}

/** Le réglage autoUpdate, pour l'application installée (ou en développement avec un faux GitHub). */
export async function backgroundUpdateEnabled(installable: boolean): Promise<boolean> {
  return installable && (await getSettings()).autoUpdate
}
