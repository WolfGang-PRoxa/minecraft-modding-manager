// État des mises à jour automatiques dans la fenêtre : réglages et derniers passages de chaque modpack, passage en
// cours depuis cette fenêtre. Relu avec la vue Studio, et au retour sur la fenêtre (un passage de la tâche planifiée a
// pu avoir lieu pendant ce temps).
import { create } from 'zustand'
import type { MaintenanceRecord, MaintenanceStatus } from '../../../shared/studio'
import { useStore } from '../store'
import { useStudio } from './store'

interface MaintenanceState {
  status: (MaintenanceStatus & { claude: boolean }) | null
  /** Modpack passé depuis cette fenêtre (un seul à la fois), et son étape. */
  running: string | null
  step: string | null
  refresh(): Promise<void>
  run(folder: string): Promise<void>
  validate(folder: string, publish: boolean): Promise<boolean>
  discard(folder: string): Promise<boolean>
}

const toast = (toast: Parameters<ReturnType<typeof useStore.getState>['pushToast']>[0]) => useStore.getState().pushToast(toast)

/** Notification d'un passage, d'après son résultat. */
function announce(record: MaintenanceRecord): void {
  const title = `${record.name} : ${
    {
      'up-to-date': 'à jour',
      manual: 'mises à jour à faire dans CurseForge',
      ready: 'mise à jour prête, à valider',
      failed: 'échec',
      created: 'version créée',
      published: 'version publiée',
      skipped: 'passage remis à plus tard'
    }[record.outcome]
  }`
  toast({ kind: record.outcome === 'failed' ? 'error' : 'success', title, message: record.message })
}

let listening = false

export const useMaintenance = create<MaintenanceState>((set, get) => ({
  status: null,
  running: null,
  step: null,

  async refresh() {
    if (!listening) {
      listening = true
      window.studio.onMaintenanceProgress((step) => set({ step }))
      window.addEventListener('focus', () => void get().refresh())
    }
    try {
      set({ status: await window.studio.maintenanceStatus() })
    } catch {
      // Lecture impossible (dossier absent…) : la vue Studio l'explique déjà.
    }
  },

  async run(folder) {
    if (get().running) return
    set({ running: folder, step: null })
    try {
      const result = await window.studio.runMaintenance([folder])
      if (!result.ok) toast({ kind: 'error', title: 'Passage impossible', message: result.error })
      else result.records.forEach(announce)
    } finally {
      set({ running: null, step: null })
      await refreshAll()
    }
  },

  async validate(folder, publish) {
    set({ running: folder, step: null })
    try {
      const result = await window.studio.validateUpdate(folder, publish)
      if (!result.ok) toast({ kind: 'error', title: 'Validation impossible', message: result.error })
      else announce(result.record)
      return result.ok
    } finally {
      set({ running: null, step: null })
      await refreshAll()
    }
  },

  async discard(folder) {
    const result = await window.studio.discardUpdate(folder)
    if (!result.ok) toast({ kind: 'error', title: 'Abandon impossible', message: result.error })
    await refreshAll()
    return result.ok
  }
}))

/** Relit la vue Studio (versions créées, essais retirés), qui relit aussi les mises à jour automatiques. */
async function refreshAll(): Promise<void> {
  await useStudio.getState().refresh()
}
