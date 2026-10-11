import { z } from 'zod'
import type { ServerTestReport, StaticCheckReport } from '../../shared/studio'
import { profileFor, target } from './refs'
import { command } from './registry'

const SEVERITY = { error: '✖', warning: '⚠', info: '·' } as const

export const testsCheck = command({
  name: 'tests check',
  summary: 'Vérifie les fichiers d’un profil sans lancer le jeu : mods en double, dépendances manquantes, mauvais chargeur.',
  description:
    'Quelques secondes. Une erreur (error) empêche presque toujours le jeu de démarrer. Le profil peut être une copie ' +
    'd’essai (« <profil> (essai) ») : c’est elle qu’il faut tester avant de garder un essai.',
  params: z.object(target),
  kind: 'read',
  async run({ pack, profile }, ctx) {
    return ctx.service.checkProfile(await profileFor(ctx, pack, profile))
  },
  print: (r: StaticCheckReport) =>
    [
      `${r.profile} — ${r.jars} mods vérifiés`,
      ...(r.findings.filter((f) => f.severity !== 'info').length ? [] : ['  Aucun problème trouvé.']),
      ...r.findings.map((f) => `  ${SEVERITY[f.severity]} ${f.message}\n      ${f.files.join(', ')}`)
    ].join('\n')
})

export const testsServer = command({
  name: 'tests server',
  summary: 'Démarre un serveur dédié avec les mods du profil jusqu’au bout, puis l’arrête : détecte la plupart des incompatibilités.',
  description:
    'Quelques minutes, sans fenêtre ni compte. La première fois pour une version du chargeur, le serveur est téléchargé ' +
    '(en cache ensuite). Les mods réservés au client sont laissés de côté. outcome « started » = réussi ; sinon, ' +
    'crashReport (description, mods suspectés) et logTail expliquent l’échec. Ne teste pas le rendu ni les mods du client.',
  params: z.object({
    ...target,
    timeoutMinutes: z.number().int().positive().max(60).optional().describe('Délai avant d’abandonner (15 minutes par défaut).')
  }),
  kind: 'write',
  async run({ pack, profile, timeoutMinutes }, ctx) {
    return ctx.service.testServer(await profileFor(ctx, pack, profile), (text) => ctx.progress(text), {
      signal: ctx.signal,
      timeoutMs: timeoutMinutes ? timeoutMinutes * 60_000 : undefined
    })
  },
  print: (r: ServerTestReport) =>
    [
      `${r.profile} — ${r.outcome === 'started' ? '✔' : '✖'} ${r.message} (${Math.round(r.durationMs / 1000)} s)`,
      ...(r.clientOnly.length ? [`  Laissés de côté (client) : ${r.clientOnly.join(', ')}`] : []),
      ...(r.crashReport ? [`  Rapport de plantage : ${r.crashReport.file}`] : []),
      ...(r.outcome === 'started' ? [] : ['  Fin du journal :', ...r.logTail.slice(-20).map((l) => `    ${l}`)])
    ].join('\n')
})
