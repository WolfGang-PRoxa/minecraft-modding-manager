import { z } from 'zod'
import type { MaintenanceRecord, MaintenanceStatus, MaintenanceTask, PackUpdates, UpdateFrequency } from '../../shared/studio'
import { CurseForgeClient } from '../curseforgeApi'
import { discardPending, finishPending, maintenanceStatus, runMaintenance, type MaintenanceOptions } from '../maintenance/pipeline'
import { FREQUENCY_LABELS } from '../maintenance/schedule'
import { installMaintenanceTask, readMaintenanceTask, removeMaintenanceTask } from '../maintenance/scheduledTask'
import { describeError, StudioError } from '../studio/analyze'
import { packOf, packParam } from './refs'
import { command, type CommandContext } from './registry'

const OUTCOME: Record<MaintenanceRecord['outcome'], string> = {
  'up-to-date': '✔ à jour',
  manual: '⚠ à faire dans CurseForge',
  ready: '★ prête, à valider',
  failed: '✖ échec',
  created: '✔ version créée',
  published: '✔ publiée',
  skipped: '· remis à plus tard'
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

const options = (ctx: CommandContext): MaintenanceOptions => ({
  service: ctx.service,
  lock: ctx.maintenanceLock,
  onStep: (text) => ctx.progress(text),
  signal: ctx.signal
})

async function task(ctx: CommandContext): Promise<MaintenanceTask | null> {
  return process.platform === 'win32' ? readMaintenanceTask(ctx.launcher).catch(() => null) : null
}

const printRecord = (r: MaintenanceRecord) =>
  [
    `${r.name} — ${OUTCOME[r.outcome]} : ${r.message}`,
    ...r.changes.map((c) => `    ~ ${c}`),
    ...r.manual.map((c) => `    ⚠ ${c}`),
    ...(r.trialPath ? [`    Essai : ${r.trialPath}`] : []),
    ...(r.claude ? [`    Claude : ${r.claude}`] : [])
  ].join('\n')

function printTask(t: MaintenanceTask | null): string {
  if (!t) return 'Tâche planifiée : inconnue (Windows seulement).'
  if (!t.installed) return 'Tâche planifiée : aucune (les passages ne se font qu’à la demande).'
  return [
    `Tâche planifiée : chaque jour à ${t.time ?? '?'}${t.wake ? ', réveille le PC' : ''} · dernier passage ${date(t.lastRunAt)} · prochain ${date(t.nextRunAt)}`,
    ...(t.foreign ? ['  ⚠ Elle lance une autre installation de l’application : recrée-la depuis celle-ci.'] : [])
  ].join('\n')
}

export const maintenanceStatusCommand = command({
  name: 'maintenance status',
  summary: 'Mises à jour automatiques : réglages de chaque modpack, dernier passage, prochain, et la tâche planifiée.',
  description:
    'Un passage = recherche des mises à jour du profil source, copie d’essai, vérification des fichiers, test du serveur, ' +
    'puis version « prête, à valider » (ready) ou, si autoPublish, version créée et publiée. last.outcome failed : ' +
    'message et trialPath disent quoi regarder (tests check / tests server sur l’essai).',
  params: z.object({}),
  kind: 'read',
  async run(_params, ctx) {
    return maintenanceStatus(ctx.service, ctx.maintenanceLock, await task(ctx))
  },
  print: (status: MaintenanceStatus) =>
    [
      printTask(status.task),
      ...(status.running ? [`Passage en cours (${status.running}).`] : []),
      '',
      ...status.packs.map((p) => {
        const u = p.updates
        const head = `${p.name} (${p.folder}) — ${FREQUENCY_LABELS[u.frequency]}${u.channel === 'beta' ? ', bêtas comprises' : ''}${u.autoPublish ? ', publication automatique' : ''}`
        const lines = [`  Dernière recherche : ${date(p.checkedAt)} · prochaine : ${p.dueAt ? date(p.dueAt) : '—'}`]
        if (u.pinned.length) lines.push(`  Figés : ${u.pinned.map((x) => `${x.name} (${x.projectId})`).join(', ')}`)
        if (p.last) lines.push(printRecord(p.last).replace(/^/gm, '  '))
        return [head, ...lines].join('\n')
      })
    ].join('\n')
})

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'manual', 'never'] as const satisfies readonly UpdateFrequency[]

export const maintenanceConfigure = command({
  name: 'maintenance configure',
  summary: 'Règle les mises à jour automatiques d’un modpack : fréquence, bêtas, publication automatique, mods figés.',
  description:
    'frequency : weekly, biweekly, monthly, manual (seulement à la demande, réglage par défaut) ou never. autoPublish : ' +
    'une version qui passe les tests est publiée seule sur les cibles du modpack (GitHub, CurseForge) ; sinon elle attend ' +
    'd’être validée (maintenance validate). Ne l’active qu’à la demande explicite du publieur. pin / unpin : projets ' +
    'CurseForge (projectId de « updates check ») à ne plus mettre à jour, ou à nouveau.',
  params: z.object({
    pack: packParam,
    frequency: z.enum(FREQUENCIES).optional().describe('Rythme des passages automatiques.'),
    beta: z.boolean().optional().describe('Accepter aussi les versions bêta des mods.'),
    autoPublish: z.boolean().optional().describe('Publier seul une version qui passe les tests.'),
    pin: z.array(z.number().int().positive()).optional().describe('Projets CurseForge à figer.'),
    unpin: z.array(z.number().int().positive()).optional().describe('Projets CurseForge à ne plus figer.')
  }),
  kind: 'write',
  async run({ pack: ref, frequency, beta, autoPublish, pin, unpin }, ctx) {
    const pack = await packOf(ctx, ref)
    const pinned = new Map(pack.updates.pinned.map((p) => [p.projectId, p.name]))
    const added = (pin ?? []).filter((id) => !pinned.has(id))
    if (added.length) {
      const names = await CurseForgeClient.create({ dotenvDir: process.cwd() })
        .then((client) => client.getMods(added))
        .then((mods) => new Map(mods.map((m) => [m.id, m.name])))
        .catch(() => new Map<number, string>())
      for (const id of added) pinned.set(id, names.get(id) ?? `Projet ${id}`)
    }
    for (const id of unpin ?? []) pinned.delete(id)
    const changes: Partial<PackUpdates> = { pinned: [...pinned].map(([projectId, name]) => ({ projectId, name })) }
    if (frequency) changes.frequency = frequency
    if (beta !== undefined) changes.channel = beta ? 'beta' : 'release'
    if (autoPublish !== undefined) changes.autoPublish = autoPublish
    return { pack: pack.folder, updates: await ctx.service.updatePackUpdates(pack.folder, changes) }
  },
  print: ({ pack, updates }) =>
    `${pack} : ${FREQUENCY_LABELS[updates.frequency]}${updates.channel === 'beta' ? ', bêtas comprises' : ''}, ` +
    `${updates.autoPublish ? 'publication automatique' : 'version à valider'}` +
    `${updates.pinned.length ? `, figés : ${updates.pinned.map((p) => p.name).join(', ')}` : ''}.`
})

export const maintenanceRun = command({
  name: 'maintenance run',
  summary: 'Lance un passage : mises à jour, copie d’essai et tests, pour les modpacks donnés, ceux dont le tour est venu, ou tous.',
  description:
    'Sans packs ni due : tous les modpacks sauf ceux réglés sur never. Plusieurs minutes par modpack qui a des mises à ' +
    'jour (test du serveur). Un modpack réglé sur autoPublish est publié s’il passe les tests (irréversible sur ' +
    'CurseForge) : préviens le publieur avant. Un modpack dont un essai attend déjà une décision est laissé de côté.',
  params: z.object({
    packs: z.array(z.string().min(1)).optional().describe('Modpacks à passer (dossier, identifiant ou nom).'),
    due: z.boolean().optional().describe('Seulement ceux dont le tour est venu (ce que fait la tâche planifiée).')
  }),
  kind: 'destructive',
  async run({ packs, due }, ctx) {
    const folders = packs ? await Promise.all(packs.map(async (ref) => (await packOf(ctx, ref)).folder)) : undefined
    return runMaintenance({ folders, due }, options(ctx))
  },
  print: (records: MaintenanceRecord[]) => (records.length ? records.map(printRecord).join('\n') : 'Aucun modpack à passer.')
})

export const maintenanceValidate = command({
  name: 'maintenance validate',
  summary: 'Valide l’essai en attente d’un modpack : il devient la version suivante (notes écrites), publiée sauf --no-publish.',
  description:
    'L’essai est reporté dans le profil source (CurseForge fermé puis rouvert ; refusé si Minecraft tourne depuis l’un ' +
    'des deux), la version est zippée depuis le profil, ses notes listent les mises à jour (à réécrire avec « packs ' +
    'notes » si besoin, avant de publier), puis elle est publiée sur GitHub et sur CurseForge selon les cibles du modpack. ' +
    'Un essai qui a échoué aux tests se valide aussi : seulement si le publieur l’a vérifié lui-même.',
  params: z.object({
    pack: packParam,
    publish: z.boolean().optional().describe('Publier la version créée (oui par défaut).')
  }),
  kind: 'destructive',
  async run({ pack: ref, publish }, ctx) {
    return finishPending(await packOf(ctx, ref), publish !== false, options(ctx))
  },
  print: printRecord
})

export const maintenanceDiscard = command({
  name: 'maintenance discard',
  summary: 'Abandonne l’essai en attente d’un modpack (corbeille) ; son profil source n’est pas touché.',
  params: z.object({ pack: packParam }),
  kind: 'destructive',
  async run({ pack: ref }, ctx) {
    return discardPending(await packOf(ctx, ref), options(ctx))
  },
  print: printRecord
})

export const maintenanceSchedule = command({
  name: 'maintenance schedule',
  summary: 'Crée ou retire la tâche planifiée de Windows qui fait chaque jour les passages dont le tour est venu.',
  description:
    'time : heure du passage quotidien (HH:MM). wake : réveiller le PC en veille (il faut aussi « Autoriser les ' +
    'minuteurs de réveil » dans les options d’alimentation). La tâche ne tourne que si la session du publieur est ouverte ' +
    '(verrouillée suffit). Seulement depuis l’application installée (mpm.cmd ou Claude Code connecté par elle).',
  params: z.object({
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('Heure du passage quotidien, HH:MM.'),
    wake: z.boolean().optional().describe('Réveiller le PC en veille.'),
    off: z.boolean().optional().describe('Retirer la tâche.')
  }),
  kind: 'write',
  async run({ time, wake, off }, ctx) {
    if (process.platform !== 'win32') throw new StudioError('La tâche planifiée n’existe que sous Windows.')
    if (off) {
      await removeMaintenanceTask()
      return readMaintenanceTask(ctx.launcher)
    }
    if (!ctx.launcher) throw new StudioError('La tâche planifiée se crée depuis l’application installée (mpm.cmd, ou ses Paramètres).')
    const current = await readMaintenanceTask(ctx.launcher)
    const at = time ?? current.time ?? '04:00'
    try {
      await installMaintenanceTask(ctx.launcher, { time: at, wake: wake ?? current.wake })
    } catch (err) {
      throw new StudioError(`Windows refuse de créer la tâche : ${describeError(err)}`)
    }
    return readMaintenanceTask(ctx.launcher)
  },
  print: printTask
})
