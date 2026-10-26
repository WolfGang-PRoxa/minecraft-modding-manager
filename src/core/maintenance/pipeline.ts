// Passage automatique d'un modpack : recherche des mises à jour de son profil source, copie d'essai, tests, puis
// version « prête, à valider » ou, si le modpack le permet, version créée et publiée. Chaque étape est une opération
// du StudioService (verrou, journal) : le passage ne fait rien que la fenêtre ou une commande ne sache faire.
import type { MaintenanceRecord, MaintenanceStatus, MaintenanceTask, PackView, ProfileView } from '../../shared/studio'
import type { OperationLock } from '../lock'
import { describeError, StudioError } from '../studio/analyze'
import type { StudioService } from '../studio/service'
import { parseVersionNumber } from '../studio/workspace'
import { pathExists } from '../fsutil'
import { describeIssue, newIssues } from '../gameTests/logIssues'
import { changeLine, versionNotes } from './notes'
import { dueAt, isDue } from './schedule'
import { currentRecord, readMaintenanceState, saveRecord } from './state'

export interface MaintenanceOptions {
  service: StudioService
  /** Un seul passage à la fois, tous processus confondus (maintenance.lock). */
  lock: OperationLock
  onStep?(text: string): void
  signal?: AbortSignal
}

/** Les modpacks à passer : ceux donnés (dossiers), ceux dont le tour est venu (`due`), ou tous sauf `never`. */
export interface MaintenanceRequest {
  folders?: string[]
  due?: boolean
}

const RUN_LABEL = 'les mises à jour automatiques'

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

function recordFor(pack: PackView, outcome: MaintenanceRecord['outcome'], message: string, extra: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
  return {
    packId: pack.id,
    folder: pack.folder,
    name: pack.name,
    at: new Date().toISOString(),
    outcome,
    message,
    changes: [],
    manual: [],
    profilePath: null,
    trialPath: null,
    version: null,
    claude: null,
    warnings: [],
    ...extra
  }
}

/** Le profil source enregistré du modpack : un lien seulement deviné ne suffit pas pour travailler seul. */
async function sourceProfile(service: StudioService, folder: string): Promise<ProfileView | null> {
  const library = await service.library()
  if (library.error) throw new StudioError(library.error)
  return library.folders.flatMap((f) => f.profiles).find((p) => p.pack?.folder === folder && p.link === 'saved') ?? null
}

/** Recherche, essai et tests d'un modpack ; publie si le modpack le permet. Ne lève pas : l'échec est un résultat. */
export async function maintainPack(pack: PackView, options: MaintenanceOptions): Promise<MaintenanceRecord> {
  const { service } = options
  const step = (text: string) => options.onStep?.(`${pack.name} : ${text}`)
  let base: Partial<MaintenanceRecord> = {}
  try {
    if (pack.errors.length) return recordFor(pack, 'failed', pack.errors[0])
    const profile = await sourceProfile(service, pack.folder)
    if (!profile) return recordFor(pack, 'skipped', 'Aucun profil CurseForge lié : lie le modpack à son profil source.')
    base = { profilePath: profile.path }
    if (profile.trialPath) {
      return recordFor(pack, 'skipped', 'Un essai des mises à jour attend déjà : garde-le ou abandonne-le.', {
        ...base,
        trialPath: profile.trialPath
      })
    }

    step('recherche des mises à jour')
    const { channel, pinned } = pack.updates
    const pinnedIds = pinned.map((p) => p.projectId)
    const plan = await service.checkUpdates(profile.path, channel, pinnedIds)
    const manual = plan.updates.filter((u) => !u.downloadable).map(changeLine)
    if (!plan.updates.some((u) => u.downloadable)) {
      return manual.length
        ? recordFor(pack, 'manual', `${plural(manual.length, 'mise à jour', 'mises à jour')} à faire dans CurseForge.`, { ...base, manual })
        : recordFor(pack, 'up-to-date', `Tout est à jour (${plural(plan.checked, 'projet vérifié', 'projets vérifiés')}).`, base)
    }

    step('copie d’essai')
    const trial = await service.applyUpdatesToTrial(profile.path, { channel, pinned: pinnedIds }, (done, total, name) =>
      step(name ? `mise à jour de ${name} (${done}/${total})` : 'mises à jour appliquées')
    )
    base = {
      ...base,
      trialPath: trial.trialPath,
      changes: trial.applied.map(changeLine),
      manual: [...manual, ...trial.skipped.filter((s) => s.update.downloadable).map((s) => `${changeLine(s.update)} (${s.reason})`)]
    }

    step('vérification des fichiers')
    const files = await service.checkProfile(trial.trialPath)
    const error = files.findings.find((f) => f.severity === 'error')
    if (error) return recordFor(pack, 'failed', `Vérification des fichiers : ${error.message}`, base)

    // Référence : les tests du profil d'origine (ses mods actuels), pour ne relever que les erreurs nouvelles.
    const warnings: string[] = []
    let reference = await service.currentTests(profile.path)
    if (!reference.players && !reference.server) {
      step('test de référence du profil d’origine')
      const players = await service.testPlayers(profile.path, step, { signal: options.signal })
      reference = players.outcome === 'unavailable' ? { ...reference, server: await service.testServer(profile.path, step, { signal: options.signal }) } : { ...reference, players, server: players.server }
    }

    step('partie de test')
    const players = await service.testPlayers(trial.trialPath, step, { signal: options.signal })
    let server = players.server
    let played = `${plural(players.players.length, 'joueur a', 'joueurs ont')} joué`
    if (players.outcome === 'unavailable') {
      warnings.push(`Partie avec des joueurs impossible : ${players.message} Seul le serveur a été testé.`)
      step('test du serveur')
      server = await service.testServer(trial.trialPath, step, { signal: options.signal })
      played = 'pas de partie avec des joueurs'
    }
    if (!server || server.outcome !== 'started') return recordFor(pack, 'failed', `Test du serveur : ${server?.message ?? players.message}`, base)
    if (players.outcome === 'failed') return recordFor(pack, 'failed', `Partie de test : ${players.message}`, base)

    // Seules les erreurs comptent : les avertissements changent trop d'un lancement à l'autre.
    const errorsOnly = (issues: ReturnType<typeof newIssues>) => issues.filter((i) => i.level === 'error')
    const freshErrors = [
      ...errorsOnly(newIssues(server.logIssues, reference.players?.server?.logIssues ?? reference.server?.logIssues)).map((i) => `Serveur : ${describeIssue(i)}`),
      ...(reference.players && players.outcome === 'passed'
        ? errorsOnly(newIssues(players.clientIssues, reference.players.clientIssues)).map((i) => `Jeu : ${describeIssue(i)}`)
        : [])
    ]
    if (freshErrors.length) {
      warnings.push(`${plural(freshErrors.length, 'nouvelle erreur', 'nouvelles erreurs')} dans les journaux depuis le profil d’origine :`, ...freshErrors.slice(0, 8))
    }

    const ready = recordFor(
      pack,
      'ready',
      `${plural(base.changes!.length, 'mise à jour testée', 'mises à jour testées')} : le serveur démarre, ${played}.`,
      { ...base, warnings }
    )
    if (!pack.updates.autoPublish) return ready
    if (warnings.length) return { ...ready, message: `${ready.message} Publication automatique retenue : regarde les points signalés.` }
    await saveRecord(ready)
    return await createVersion(pack, ready, { ...options, publish: true })
  } catch (err) {
    return recordFor(pack, 'failed', describeError(err), base)
  }
}

/**
 * Valide un essai prêt : il est reporté dans le profil source (CurseForge fermé le temps de l'écriture), qui devient
 * la version suivante du modpack, avec ses notes ; `publish` la publie sur les cibles du modpack.
 */
async function createVersion(
  pack: PackView,
  ready: MaintenanceRecord,
  options: MaintenanceOptions & { publish: boolean }
): Promise<MaintenanceRecord> {
  const { service } = options
  const step = (text: string) => options.onStep?.(`${pack.name} : ${text}`)
  if (!ready.profilePath || !ready.trialPath) throw new StudioError('Cet essai ne dit pas de quel profil il vient.')

  step('report de l’essai dans le profil')
  await service.promoteTrial(ready.profilePath)
  step('création de la version')
  const fileName = await service.zipInstance(pack.folder, ready.profilePath, false, () => {}, options.signal ?? new AbortController().signal)
  const version = parseVersionNumber(fileName)
  if (!version) throw new StudioError(`Version créée sous un nom inattendu : ${fileName}.`)
  await service.setNotes(pack.folder, version, versionNotes(ready))
  const done = { ...ready, at: new Date().toISOString(), trialPath: null, version }
  if (!options.publish) return { ...done, outcome: 'created', message: `v${version} créée, à publier.` }

  const targets: string[] = []
  const errors: string[] = []
  if (pack.github) {
    step('publication sur GitHub')
    const result = await service.publishPack(pack.folder, () => {}, options.signal ?? new AbortController().signal)
    if (result.ok) targets.push('GitHub')
    else errors.push(`GitHub : ${result.error}`)
  }
  if (pack.curseforge) {
    step('publication sur CurseForge')
    try {
      await service.publishToCurseForge(pack.folder, version, 'release', step)
      targets.push('CurseForge (en modération)')
    } catch (err) {
      errors.push(`CurseForge : ${describeError(err)}`)
    }
  }
  if (errors.length) return { ...done, outcome: 'failed', message: `v${version} créée, mais pas publiée partout. ${errors.join(' ')}` }
  return { ...done, outcome: 'published', message: `v${version} publiée sur ${targets.join(' et ')}.` }
}

async function withRunLock<T>(options: MaintenanceOptions, run: () => Promise<T>): Promise<T> {
  const release = await options.lock.acquire(RUN_LABEL)
  try {
    return await run()
  } finally {
    await release()
  }
}

/** Les modpacks demandés, passés l'un après l'autre ; chaque résultat est enregistré dès qu'il est connu. */
export function runMaintenance(request: MaintenanceRequest, options: MaintenanceOptions): Promise<MaintenanceRecord[]> {
  return withRunLock(options, async () => {
    const overview = await options.service.overview()
    if (!overview.settings.workspaceDir) throw new StudioError('Aucun dossier des contenus : choisis-le dans l’application.')
    const state = await readMaintenanceState()
    const now = new Date()
    const packs = overview.packs.filter((pack) => {
      if (pack.type !== 'modpack') return false
      if (request.folders) return request.folders.includes(pack.folder)
      if (request.due) return isDue(pack.updates, state[pack.id]?.checkedAt ?? null, now)
      return pack.updates.frequency !== 'never'
    })
    const records: MaintenanceRecord[] = []
    for (const pack of packs) {
      if (options.signal?.aborted) break
      const record = await maintainPack(pack, options)
      await saveRecord(record)
      records.push(record)
    }
    return records
  })
}

/**
 * L'essai prêt d'un modpack : le dernier passage, s'il attend encore une décision. Un passage en attente dont l'essai a
 * disparu (reporté ou supprimé à côté) est retiré au passage, et renvoyé dans `cleared`.
 */
async function pendingTrial(pack: PackView): Promise<{ pending: MaintenanceRecord } | { cleared: MaintenanceRecord }> {
  const last = (await readMaintenanceState())[pack.id]?.last ?? null
  const current = await currentRecord(last)
  if (last && current && current !== last) {
    await saveRecord(current, { replace: true })
    return { cleared: current }
  }
  if (!last?.trialPath || (last.outcome !== 'ready' && last.outcome !== 'failed')) {
    throw new StudioError(`${pack.name} n’a pas d’essai des mises à jour en attente.`)
  }
  return { pending: last }
}

/**
 * Valide l'essai en attente d'un modpack : version créée depuis le profil mis à jour, publiée si `publish`. Un essai
 * qui a échoué aux tests se valide aussi, à la demande (le publieur a vérifié lui-même).
 */
export function finishPending(pack: PackView, publish: boolean, options: MaintenanceOptions): Promise<MaintenanceRecord> {
  return withRunLock(options, async () => {
    const found = await pendingTrial(pack)
    if ('cleared' in found) throw new StudioError(`L’essai de ${pack.name} n’existe plus : la mise à jour en attente est retirée.`)
    const pending = found.pending
    let record: MaintenanceRecord
    try {
      record = await createVersion(pack, pending, { ...options, publish })
    } catch (err) {
      // L'essai a pu être reporté avant l'erreur : ce qui reste à faire se lit dans le message.
      const trialLeft = await pathExists(pending.trialPath!)
      record = { ...pending, at: new Date().toISOString(), outcome: 'failed', message: describeError(err), trialPath: trialLeft ? pending.trialPath : null }
    }
    await saveRecord(record, { replace: true })
    return record
  })
}

/** Abandonne l'essai en attente d'un modpack (corbeille). */
export function discardPending(pack: PackView, options: MaintenanceOptions): Promise<MaintenanceRecord> {
  return withRunLock(options, async () => {
    const found = await pendingTrial(pack)
    // Plus d'essai sur le disque : il n'y a plus rien à abandonner, la section disparaît.
    if ('cleared' in found) return found.cleared
    const pending = found.pending
    await options.service.discardTrial(pending.profilePath!)
    const record: MaintenanceRecord = { ...pending, at: new Date().toISOString(), outcome: 'skipped', message: 'Essai abandonné.', trialPath: null }
    await saveRecord(record, { replace: true })
    return record
  })
}

/** Réglages, dernier passage et prochain passage de chaque modpack. */
export async function maintenanceStatus(service: StudioService, lock: OperationLock, task: MaintenanceTask | null): Promise<MaintenanceStatus> {
  const [overview, state] = await Promise.all([service.overview(), readMaintenanceState()])
  const running = lock.currentSync()
  // Un essai en attente dont le dossier a disparu ne s'affiche plus comme tel.
  const lasts = new Map(await Promise.all(overview.packs.map(async (pack) => [pack.id, await currentRecord(state[pack.id]?.last ?? null)] as const)))
  return {
    packs: overview.packs.filter((pack) => pack.type === 'modpack').map((pack) => {
      const stored = state[pack.id]
      const due = dueAt(pack.updates, stored?.checkedAt ?? null)
      return {
        folder: pack.folder,
        packId: pack.id,
        name: pack.name,
        updates: pack.updates,
        checkedAt: stored?.checkedAt ?? null,
        dueAt: due?.toISOString() ?? null,
        last: lasts.get(pack.id) ?? null
      }
    }),
    task,
    running: running ? running.holder : null
  }
}

/** Résumé d'un passage en une phrase, pour une notification. */
export function summarize(records: MaintenanceRecord[]): string | null {
  const count = (outcome: MaintenanceRecord['outcome']) => records.filter((r) => r.outcome === outcome)
  const parts = [
    ...count('published').map((r) => `${r.name} : ${r.message}`),
    ...count('ready').map((r) => `${r.name} : mise à jour prête, à valider.`),
    ...count('created').map((r) => `${r.name} : ${r.message}`),
    ...count('failed').map((r) => `${r.name} : échec (${r.message})`),
    ...count('manual').map((r) => `${r.name} : ${r.message}`)
  ]
  return parts.length ? parts.join('\n') : null
}
