// `mpm` : les commandes du moteur en ligne de commande, et le serveur MCP (`mpm mcp`) qui les donne à Claude Code.
//
//   mpm                        liste des commandes
//   mpm <commande> --help      aide d'une commande
//   mpm packs list             exemple ; --json pour une sortie lisible par un programme
//   mpm ranger | mpm publier   rangement et publication avec aperçu et confirmation
//   mpm mcp                    serveur MCP (stdio)
//
// Options communes : --dir <dossier des contenus>, --repo <propriétaire/dépôt>, --yes (pas de confirmation), --json.
// Depuis le dépôt : npm run mpm -- <commande>. Dans l'application installée : mpm.cmd, à côté de l'exécutable.
import { createInterface } from 'node:readline/promises'
import { z } from 'zod'
import { version } from '../../package.json'
import { APP_NAME } from '../shared/config'
import { parseRepo } from '../shared/repo'
import { COMMANDS } from '../core/commands'
import { createCommandRuntime } from '../core/commands/context'
import { printPlan } from '../core/commands/publish'
import type { Command, CommandContext } from '../core/commands/registry'
import { setCurseForgeApiOverride } from '../core/curseforgeAuth'
import { setModrinthApiOverride } from '../core/modrinth'
import { setHangarApiOverride } from '../core/hangar'
import { setGitHubApiOverride } from '../core/githubEnv'
import { describeError, StudioError } from '../core/studio/analyze'
import { startMcpServer } from '../mcp/server'
import { commandHelp, parseParams } from './args'

z.config(z.locales.fr())

const GLOBAL_FLAGS = new Set(['--json', '--yes', '-y', '--help', '-h'])
const GLOBAL_VALUES = new Set(['--dir', '--repo'])

interface Globals {
  json: boolean
  yes: boolean
  help: boolean
  dir?: string
  repo?: string
}

function splitGlobals(argv: string[]): { globals: Globals; rest: string[] } {
  const globals: Globals = { json: false, yes: false, help: false }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const [name, inline] = argv[i].split(/=(.*)/s, 2)
    if (GLOBAL_FLAGS.has(name)) {
      if (name === '--json') globals.json = true
      else if (name === '--yes' || name === '-y') globals.yes = true
      else globals.help = true
    } else if (GLOBAL_VALUES.has(name)) {
      const value = inline ?? argv[++i]
      if (value === undefined) throw new StudioError(`${name} attend une valeur.`)
      globals[name === '--dir' ? 'dir' : 'repo'] = value
    } else rest.push(argv[i])
  }
  return { globals, rest }
}

/** La commande dont le nom correspond au plus grand nombre de mots en tête des arguments. */
function findCommand(args: string[]): { command: Command; rest: string[] } | null {
  for (let words = Math.min(3, args.length); words > 0; words--) {
    const name = args.slice(0, words).join(' ')
    const command = COMMANDS.find((c) => c.name === name)
    if (command) return { command, rest: args.slice(words) }
  }
  return null
}

function mainHelp(): string {
  const width = Math.max(...COMMANDS.map((c) => c.name.length)) + 2
  return [
    `${APP_NAME} ${version} — commandes`,
    '',
    ...COMMANDS.map((c) => `  ${c.name.padEnd(width)}${c.summary}`),
    '',
    `  ${'ranger'.padEnd(width)}Aperçu puis numérotation des zips déposés (ranger plan + ranger apply).`,
    `  ${'publier'.padEnd(width)}Aperçu puis publication sur GitHub (publish plan + publish apply).`,
    `  ${'mcp'.padEnd(width)}Serveur MCP pour Claude Code (stdio).`,
    '',
    'Options : --json, --yes, --dir <dossier des contenus>, --repo <propriétaire/dépôt>.',
    'Aide d’une commande : mpm <commande> --help'
  ].join('\n')
}

async function confirm(question: string, globals: Globals): Promise<boolean> {
  if (globals.yes) return true
  if (!process.stdin.isTTY) throw new StudioError(`${question} Ajoute --yes pour confirmer sans question.`)
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    return /^(o|oui|y|yes)$/i.test((await rl.question(`${question} (o/N) `)).trim())
  } finally {
    rl.close()
  }
}

/** Avancement sur stderr (stdout reste au résultat), au plus toutes les 100 ms. */
function progressPrinter(): { progress: CommandContext['progress']; end(): void } {
  let last = 0
  let shown = false
  return {
    progress(message, done, total) {
      if (!process.stderr.isTTY) return
      const now = Date.now()
      if (now - last < 100 && !(total && done === total)) return
      last = now
      const ratio = total ? Math.min(1, (done ?? 0) / total) : null
      const bar = ratio === null ? '' : ` ${'█'.repeat(Math.round(ratio * 24)).padEnd(24, '░')} ${Math.round(ratio * 100)} %`
      process.stderr.write(`\r${message.slice(0, 40).padEnd(40)}${bar}   `)
      shown = true
    },
    end() {
      if (shown) process.stderr.write('\n')
      shown = false
    }
  }
}

function output(result: unknown, command: Command | null, globals: Globals): void {
  if (globals.json) process.stdout.write(JSON.stringify({ ok: true, result: result ?? null }, null, 2) + '\n')
  else if (command?.print) process.stdout.write(command.print(result as never) + '\n')
  else if (typeof result === 'string') process.stdout.write(result + '\n')
  else process.stdout.write(JSON.stringify(result ?? null, null, 2) + '\n')
}

async function run(command: Command, raw: Record<string, unknown>, runtime: Runtime, globals: Globals): Promise<unknown> {
  const parsed = command.params.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'paramètres'} : ${i.message}`).join(' ; ')
    throw new StudioError(`${issues}. Voir mpm ${command.name} --help.`)
  }
  if (command.kind === 'destructive' && !(await confirm(`« ${command.name} » supprime ou remplace des données.`, globals))) {
    throw new StudioError('Annulé.')
  }
  const printer = progressPrinter()
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  try {
    return await command.run(parsed.data, runtime.context({ progress: printer.progress, signal: controller.signal }))
  } finally {
    printer.end()
  }
}

type Runtime = Awaited<ReturnType<typeof createCommandRuntime>>

/** `mpm ranger` et `mpm publier` : l'aperçu, une confirmation, puis l'opération. */
async function interactive(name: 'ranger' | 'publier', runtime: Runtime, globals: Globals): Promise<void> {
  const byName = (n: string) => COMMANDS.find((c) => c.name === n)!
  if (name === 'ranger') {
    const plan = (await run(byName('ranger plan'), {}, runtime, globals)) as { total: number }
    output(plan, byName('ranger plan'), globals)
    if (plan.total && (await confirm(`Renommer ${plan.total} fichier(s) ?`, globals))) {
      output(await run(byName('ranger apply'), {}, runtime, globals), byName('ranger apply'), globals)
    }
    return
  }
  const plan = (await run(byName('publish plan'), {}, runtime, globals)) as Parameters<typeof printPlan>[0]
  if (!globals.json) process.stdout.write(printPlan(plan) + '\n')
  if (!plan.actions.length) return
  const deletions = plan.actions.filter((a) => a.kind === 'delete').length
  const question = deletions ? `Publier ? (${deletions} release(s) supprimée(s) de GitHub)` : 'Publier ?'
  if (!(await confirm(question, globals))) throw new StudioError('Annulé.')
  output(await run(byName('publish apply'), { fingerprint: plan.fingerprint }, runtime, { ...globals, yes: true }), byName('publish apply'), globals)
}

async function main(): Promise<void> {
  // Le faux GitHub des tests (MM_GITHUB_API) n'est jamais pris en compte dans l'application installée.
  if (!/app\.asar/i.test(process.argv[1] ?? '')) {
    setGitHubApiOverride(process.env.MM_GITHUB_API)
    setCurseForgeApiOverride(process.env.MM_CURSEFORGE_API)
    setModrinthApiOverride(process.env.MM_MODRINTH_API)
    setHangarApiOverride(process.env.MM_HANGAR_API)
  }
  const { globals, rest } = splitGlobals(process.argv.slice(2))
  const repo = globals.repo ? parseRepo(globals.repo) : undefined
  if (globals.repo && !repo) throw new StudioError(`Dépôt invalide : ${globals.repo} (format : propriétaire/dépôt).`)

  if (rest[0] === 'mcp') {
    const runtime = await createCommandRuntime({ holder: 'Claude (MCP)', workspaceDir: globals.dir, repo: repo ?? undefined })
    await startMcpServer(runtime)
    return
  }
  if (!rest.length || rest[0] === 'help') {
    process.stdout.write(mainHelp() + '\n')
    return
  }

  const found = findCommand(rest)
  if (!found && rest[0] !== 'ranger' && rest[0] !== 'publier') {
    throw new StudioError(`Commande inconnue : « ${rest.join(' ')} ». Tape mpm pour la liste.`)
  }
  if (found && globals.help) {
    process.stdout.write(commandHelp(found.command) + '\n')
    return
  }
  const runtime = await createCommandRuntime({
    holder: 'la ligne de commande',
    workspaceDir: globals.dir,
    repo: repo ?? undefined,
    dotenvDir: process.cwd(),
    onAnalyzing: (file) => file && process.stderr.isTTY && process.stderr.write(`Analyse de ${file}…\n`)
  })
  if (!found) return interactive(rest[0] as 'ranger' | 'publier', runtime, globals)
  output(await run(found.command, parseParams(found.command, found.rest), runtime, globals), found.command, globals)
}

main().catch((err: unknown) => {
  const message = describeError(err)
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify({ ok: false, error: message }, null, 2) + '\n')
  else process.stderr.write(`✖ ${message}\n`)
  process.exitCode = 1
})
