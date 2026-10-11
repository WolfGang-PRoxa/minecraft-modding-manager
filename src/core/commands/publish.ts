import { z } from 'zod'
import { formatBytes } from '../../shared/format'
import type { SyncPlan } from '../../shared/studio'
import { StudioError } from '../studio/analyze'
import { command } from './registry'

const KIND_SIGNS = { create: '+', update: '~', delete: '−' } as const

export function printPlan(plan: SyncPlan): string {
  const lines: string[] = []
  if (plan.pendingZips) lines.push(`⚠ ${plan.pendingZips} zip(s) pas encore rangé(s), ignoré(s) : « ranger apply ».`)
  lines.push(...plan.warnings.map((w) => `⚠ ${w}`))
  if (!plan.actions.length) return [...lines, 'GitHub est déjà à jour.'].join('\n')
  for (const action of plan.actions) {
    lines.push(`${KIND_SIGNS[action.kind]} ${action.label}`)
    lines.push(...action.details.map((d) => `    ${d}`), ...action.warnings.map((w) => `    ⚠ ${w}`))
  }
  lines.push(`${plan.actions.length} changement(s) · ${formatBytes(plan.uploadBytes)} à envoyer`, `Empreinte : ${plan.fingerprint}`)
  return lines.join('\n')
}

export const publishPlan = command({
  name: 'publish plan',
  summary: 'Compare le dossier des modpacks avec GitHub et liste ce qu’une publication changerait.',
  description:
    'Le dossier fait foi : une version sans zip local est supprimée de GitHub. Renvoie une empreinte (fingerprint) à ' +
    'passer à « publish apply » : la publication est refusée si le dossier ou GitHub change entre-temps.',
  params: z.object({}),
  kind: 'read',
  async run(_params, ctx) {
    const { view } = await ctx.service.freshPlan()
    return view
  },
  print: printPlan
})

export const publishApply = command({
  name: 'publish apply',
  summary: 'Publie sur GitHub le plan obtenu par « publish plan » (création, mise à jour et suppression de releases).',
  description: 'Montre toujours le plan au publieur avant : les suppressions de releases sont définitives.',
  params: z.object({ fingerprint: z.string().min(1).describe('Empreinte renvoyée par « publish plan ».') }),
  kind: 'destructive',
  async run({ fingerprint }, ctx) {
    const result = await ctx.service.publish(
      fingerprint,
      (progress) => {
        if (progress.current) ctx.progress(progress.current.text, progress.current.done, progress.current.total)
      },
      ctx.signal
    )
    if (!result.ok) throw new StudioError(result.error)
    return { changes: result.done }
  },
  print: ({ changes }) => `GitHub est à jour (${changes} changement(s)).`
})

export const releasesDelete = command({
  name: 'releases delete',
  summary: 'Retire tout de suite de GitHub des releases dont le zip n’est plus dans le dossier.',
  description: 'Refusé pour une release dont le zip est encore là : supprime plutôt la version (« versions delete »).',
  params: z.object({ tags: z.array(z.string().min(1)).min(1).describe('Tags des releases (pack-<id>-v<N>).') }),
  kind: 'destructive',
  async run({ tags }, ctx) {
    const result = await ctx.service.deleteReleases(tags)
    if (!result.ok) throw new StudioError(result.error)
    return { removed: result.done }
  },
  print: ({ removed }) => `${removed} release(s) retirée(s) de GitHub.`
})

export const rangerPlan = command({
  name: 'ranger plan',
  summary: 'Liste les zips déposés à la main qui seraient numérotés (Dossier-vN.zip) par « ranger apply ».',
  params: z.object({}),
  kind: 'read',
  run: (_params, ctx) => ctx.service.rangerPlan(),
  print: (plan) =>
    plan.total || plan.packs.some((p) => p.errors.length)
      ? plan.packs
          .flatMap((p) => [
            p.name,
            ...p.errors.map((e) => `  ✖ ${e}`),
            ...p.renames.map((r) => `  ${r.from} → ${r.to}${r.warning ? `  ⚠ ${r.warning}` : ''}`)
          ])
          .join('\n')
      : 'Tout est déjà rangé.'
})

export const rangerApply = command({
  name: 'ranger apply',
  summary: 'Numérote les zips déposés à la main dans le dossier de chaque modpack.',
  params: z.object({}),
  kind: 'write',
  async run(_params, ctx) {
    return { renamed: await ctx.service.applyRanger() }
  },
  print: ({ renamed }) => `${renamed} fichier(s) renommé(s).`
})
