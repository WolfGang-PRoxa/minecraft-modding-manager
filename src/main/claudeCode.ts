// Connexion de l'application à Claude Code : son serveur MCP (`mpm mcp`) est enregistré dans la configuration de
// l'utilisateur par la commande `claude mcp add`, pour que Claude gère les modpacks par les commandes du moteur.
// L'exécutable de l'application est lancé en mode Node (ELECTRON_RUN_AS_NODE) sur out/main/cli.js : rien d'autre à
// installer, et le chemin ne change pas d'une mise à jour à l'autre.
import { app, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ClaudeCodeStatus } from '../shared/types'

export const MCP_SERVER_NAME = 'modpack-manager'

/** Commande qui démarre le serveur MCP de cette installation. */
function mcpLaunch(): { command: string; args: string[] } {
  const cli = app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'out', 'main', 'cli.js')
    : join(app.getAppPath(), 'out', 'main', 'cli.js')
  return { command: process.execPath, args: [cli, 'mcp'] }
}

const quote = (arg: string) => (/[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg)

function addArgs(): string[] {
  const { command, args } = mcpLaunch()
  return ['mcp', 'add', '--scope', 'user', MCP_SERVER_NAME, '--env', 'ELECTRON_RUN_AS_NODE=1', '--', command, ...args]
}

/** Le programme `claude` : installation native d'abord, puis le PATH (installation par npm : claude.cmd). */
function findClaude(): Promise<string | null> {
  const native = join(homedir(), '.local', 'bin', 'claude.exe')
  if (existsSync(native)) return Promise.resolve(native)
  return new Promise((resolve) => {
    execFile('where.exe', ['claude'], { windowsHide: true, timeout: 10_000 }, (err, stdout) => {
      const found = err ? [] : stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      resolve(found.find((p) => /\.exe$/i.test(p)) ?? found.find((p) => /\.cmd$/i.test(p)) ?? null)
    })
  })
}

function runClaude(claude: string, args: string[]): Promise<{ code: number; output: string }> {
  // Un .cmd passe par cmd.exe, qui recompose la ligne de commande : chaque argument y est cité.
  const [file, fileArgs, verbatim] = /\.cmd$/i.test(claude)
    ? ['cmd.exe', ['/d', '/s', '/c', `"${[claude, ...args].map(quote).join(' ')}"`], true]
    : [claude, args, false]
  return new Promise((resolve) => {
    execFile(
      file,
      fileArgs,
      { windowsHide: true, timeout: 60_000, windowsVerbatimArguments: verbatim, cwd: dirname(process.execPath) },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0
        resolve({ code, output: `${stdout}${stderr}`.trim() })
      }
    )
  })
}

async function status(): Promise<ClaudeCodeStatus> {
  const manualCommand = ['claude', ...addArgs()].map(quote).join(' ')
  const claude = await findClaude()
  if (!claude) return { installed: false, connected: false, manualCommand }
  const { code, output } = await runClaude(claude, ['mcp', 'get', MCP_SERVER_NAME])
  const { args } = mcpLaunch()
  // Enregistré, et vers cette installation (pas vers un ancien emplacement).
  const connected = code === 0 && output.toLowerCase().includes(args[0].toLowerCase())
  return { installed: true, connected, manualCommand }
}

async function connect(): Promise<{ ok: true } | { ok: false; error: string }> {
  const claude = await findClaude()
  if (!claude) return { ok: false, error: 'Claude Code est introuvable sur ce PC.' }
  // Un enregistrement précédent (autre emplacement) est remplacé.
  await runClaude(claude, ['mcp', 'remove', '--scope', 'user', MCP_SERVER_NAME])
  const { code, output } = await runClaude(claude, addArgs())
  return code === 0 ? { ok: true } : { ok: false, error: output || `claude mcp add a échoué (code ${code}).` }
}

/** Canaux `claude:*`. */
export function registerClaudeCodeIpc(): void {
  ipcMain.handle('claude:status', () => status())
  ipcMain.handle('claude:connect', () => connect())
}
