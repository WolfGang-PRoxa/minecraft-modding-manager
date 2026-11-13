// Mise à jour régulière de l'application qui tourne en arrière-plan. Fermer la fenêtre ne quitte plus l'application :
// sans cela, elle ne se mettrait à jour qu'au démarrage du PC. Toutes les 6 heures (et au réveil du PC), elle relit
// les releases ; une nouvelle version s'installe d'elle-même dès que la fenêtre est cachée et que rien n'est en cours,
// puis l'application est relancée en arrière-plan. Fenêtre affichée, rien n'est imposé : la version est proposée en
// haut de la fenêtre (relecture du catalogue par la fenêtre), et s'installera une fois la fenêtre refermée.
import { powerMonitor, type BrowserWindow } from 'electron'
import { getSettings } from '../core/settings'
import type { AppUpdateResult } from '../shared/types'
import { getCatalog } from './github'

/** Intervalle entre deux relectures des releases. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60_000
/** Intervalle entre deux examens : une relecture est-elle due, une version attend-elle que la fenêtre se cache ? */
const TICK_MS = 15 * 60_000
/** Après le réveil du PC ou la fermeture de la fenêtre : le temps que le réseau revienne, que la fenêtre se cache. */
const SOON_MS = 60_000

export interface BackgroundUpdateOptions {
  getWindow: () => BrowserWindow | null
  /** La mise à jour peut-elle se faire seule ? (réglage autoUpdate, application installée) */
  enabled: () => Promise<boolean>
  /** Lance la mise à jour (téléchargement, vérification, installeur, fermeture). */
  install: () => Promise<AppUpdateResult>
  now?: () => number
}

/** Ce qu'un examen décide : rien, relire les releases, ou installer la version trouvée. */
export function nextStep(state: { lastCheck: number; pending: boolean; hidden: boolean; now: number }): 'wait' | 'check' | 'install' {
  if (state.pending) return state.hidden ? 'install' : 'wait'
  return state.now - state.lastCheck >= CHECK_INTERVAL_MS ? 'check' : 'wait'
}

export function startBackgroundUpdates(options: BackgroundUpdateOptions): { soon(): void } {
  const now = options.now ?? Date.now
  // Le lancement vient de vérifier (et d'installer si le réglage le permet).
  let lastCheck = now()
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
      if (!(await options.enabled())) return
      let step = nextStep({ lastCheck, pending, hidden: hidden(), now: now() })
      if (step === 'check') {
        lastCheck = now()
        const catalog = await getCatalog(true)
        pending = !catalog.error && catalog.appUpdate !== null
        step = nextStep({ lastCheck, pending, hidden: hidden(), now: now() })
      }
      if (step !== 'install') return
      const result = await options.install()
      // Réussite : l'application se ferme. Occupée (installation, publication…) : réessayé au prochain examen.
      // Échec (réseau, empreinte) : la version reste à installer, réessayée plus tard.
      if (!result.ok && result.reason === 'failed') {
        console.warn('Mise à jour en arrière-plan impossible :', result.error)
        pending = false
      }
    } catch (err) {
      console.warn('Recherche de mise à jour en arrière-plan impossible :', err)
    } finally {
      running = false
    }
  }

  setInterval(() => void tick(), TICK_MS).unref?.()
  // PC réveillé : il a pu dormir toute la nuit, la relecture est due tout de suite.
  powerMonitor.on('resume', () => {
    lastCheck = 0
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
