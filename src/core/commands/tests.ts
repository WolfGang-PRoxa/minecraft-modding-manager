import { z } from 'zod'
import type { LogIssue, PlayerTestReport, ServerTestReport, StaticCheckReport } from '../../shared/studio'
import { describeIssue } from '../gameTests/logIssues'
import { MAX_TEST_PLAYERS } from '../gameTests/playerTest'
import { profileFor, target } from './refs'
import { command } from './registry'

const SEVERITY = { error: '✖', warning: '⚠', info: '·' } as const

const playersParam = z
  .number()
  .int()
  .min(1)
  .max(MAX_TEST_PLAYERS)
  .optional()
  .describe(`Nombre de joueurs (1 à ${MAX_TEST_PLAYERS}, 2 par défaut ; moins si la mémoire libre manque).`)

const printFiles = (r: StaticCheckReport) =>
  [
    `${r.profile} — ${r.jars} mods vérifiés`,
    ...(r.findings.filter((f) => f.severity !== 'info').length ? [] : ['  Aucun problème trouvé.']),
    ...r.findings.map((f) => `  ${SEVERITY[f.severity]} ${f.message}\n      ${f.files.join(', ')}`)
  ].join('\n')

const printIssues = (title: string, issues: LogIssue[] | undefined) => {
  const errors = (issues ?? []).filter((i) => i.level === 'error')
  if (!issues?.length) return []
  return [`  ${title} : ${errors.length} erreur(s), ${issues.length - errors.length} avertissement(s)`, ...errors.slice(0, 10).map((i) => `    ✖ ${describeIssue(i)}`)]
}

const printServer = (r: ServerTestReport) =>
  [
    `${r.profile} — ${r.outcome === 'started' ? '✔' : '✖'} ${r.message} (${Math.round(r.durationMs / 1000)} s)`,
    ...(r.clientOnly.length ? [`  Laissés de côté (client) : ${r.clientOnly.join(', ')}`] : []),
    ...(r.crashReport ? [`  Rapport de plantage : ${r.crashReport.file}`] : []),
    ...printIssues('Journal du serveur', r.logIssues),
    ...(r.outcome === 'started' ? [] : ['  Fin du journal :', ...r.logTail.slice(-20).map((l) => `    ${l}`)])
  ].join('\n')

const printPlayers = (r: PlayerTestReport) =>
  [
    `${r.profile} — ${r.outcome === 'passed' ? '✔' : '✖'} ${r.message} (${Math.round(r.durationMs / 1000)} s)`,
    ...r.players.map((p) => `  ${p.outcome === 'played' ? '✔' : '✖'} ${p.name} : ${p.message}${p.crashReport ? `\n      Rapport de plantage : ${p.crashReport.file}` : ''}`),
    ...(r.server ? printIssues('Journal du serveur', r.server.logIssues) : []),
    ...printIssues('Journal du jeu', r.clientIssues),
    ...r.players.filter((p) => p.outcome !== 'played' && p.logTail.length).flatMap((p) => [`  Fin du journal de ${p.name} :`, ...p.logTail.slice(-15).map((l) => `    ${l}`)])
  ].join('\n')

export const testsCheck = command({
  name: 'tests check',
  summary: 'Vérifie les fichiers d’un profil sans lancer le jeu : doublons, dépendances manquantes ou dans la mauvaise version, incompatibilités, mauvais chargeur.',
  description:
    'Quelques secondes. Une erreur (error) empêche presque toujours le jeu de démarrer : dépendance absente, version ' +
    'refusée par un mod (de Minecraft, du chargeur ou d’un autre mod), incompatibilité déclarée. Le profil peut être une ' +
    'copie d’essai (« <profil> (essai) ») : c’est elle qu’il faut tester avant de garder un essai.',
  params: z.object(target),
  kind: 'read',
  async run({ pack, profile }, ctx) {
    return ctx.service.checkProfile(await profileFor(ctx, pack, profile))
  },
  print: printFiles
})

export const testsServer = command({
  name: 'tests server',
  summary: 'Démarre un serveur dédié avec les mods du profil jusqu’au bout, puis l’arrête : détecte la plupart des incompatibilités.',
  description:
    'Quelques minutes, sans fenêtre ni compte. La première fois pour une version du chargeur, le serveur est téléchargé ' +
    '(en cache ensuite). Les mods réservés au client sont laissés de côté. outcome « started » = réussi ; sinon, ' +
    'crashReport (description, mods suspectés) et logTail expliquent l’échec. logIssues : erreurs du journal même quand ' +
    'il démarre (beaucoup sont sans gravité : compare avec le test du profil d’origine). Ne teste pas les mods du client : ' +
    'tests players le fait.',
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
  print: printServer
})

export const testsPlayers = command({
  name: 'tests players',
  summary: 'Partie de test : le serveur démarre, puis de vrais clients Minecraft (tous les mods du profil) le rejoignent et jouent.',
  description:
    'Quelques minutes. Les joueurs (Testeur1, Testeur2…) sont des clients hors ligne, sans compte, qui ne se connectent ' +
    'qu’au serveur de test local ; leurs fenêtres peuvent s’ouvrir pendant le test. Une fois connectés, ils sont ' +
    'dispersés loin les uns des autres, de nuit, puis on vérifie qu’aucun jeu n’a planté ni n’a été déconnecté. outcome ' +
    '« passed » = réussi ; « unavailable » = test impossible ici (profil jamais lancé depuis CurseForge, mémoire ' +
    'insuffisante) ; sinon players dit qui a échoué et pourquoi (crashReport, logTail). Le test du serveur est compris.',
  params: z.object({
    ...target,
    players: playersParam,
    playSeconds: z.number().int().min(10).max(1800).optional().describe('Temps de jeu une fois tout le monde connecté (90 s par défaut).')
  }),
  kind: 'write',
  async run({ pack, profile, players, playSeconds }, ctx) {
    return ctx.service.testPlayers(await profileFor(ctx, pack, profile), (text) => ctx.progress(text), {
      signal: ctx.signal,
      players,
      playMs: playSeconds ? playSeconds * 1000 : undefined
    })
  },
  print: printPlayers
})

export const testsAll = command({
  name: 'tests all',
  summary: 'Tous les tests d’un profil à la suite : fichiers, puis partie avec des joueurs (serveur compris).',
  description: 'Ce que fait le bouton « Tout tester » et ce que font les mises à jour automatiques. Quelques minutes.',
  params: z.object({ ...target, players: playersParam }),
  kind: 'write',
  async run({ pack, profile, players }, ctx) {
    return ctx.service.testAll(await profileFor(ctx, pack, profile), (text) => ctx.progress(text), { signal: ctx.signal, players })
  },
  print: (r) => [r.files && printFiles(r.files), r.players && printPlayers(r.players)].filter(Boolean).join('\n\n')
})
