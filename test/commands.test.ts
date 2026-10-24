// Les commandes du moteur : options de la ligne de commande, scénario complet par le registre, et serveur MCP piloté
// par un vrai client MCP (comme Claude Code).
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { parseParams } from '../src/cli/args'
import { COMMANDS } from '../src/core/commands'
import { createCommandRuntime } from '../src/core/commands/context'
import type { Command } from '../src/core/commands/registry'
import { setGitHubApiOverride } from '../src/core/githubEnv'
import { useSettingsFile } from '../src/core/settings'
import { startFakeGitHub, type FakeGitHub } from './support/fakeGitHub'
import { makeInstance, tempDir } from './support/fixtures'

const byName = (name: string): Command => COMMANDS.find((c) => c.name === name)!

describe('options de la ligne de commande', () => {
  it('lit options, négations, listes et paramètres dans l’ordre', () => {
    assert.deepEqual(parseParams(byName('packs settings'), ['Mon_Pack', '--exclude', 'saves', '--exclude=logs', '--no-keep-player-configs']), {
      pack: 'Mon_Pack',
      exclude: ['saves', 'logs'],
      keepPlayerConfigs: false
    })
    assert.deepEqual(parseParams(byName('packs notes'), ['--pack', 'A', '--version', '3', '--notes', 'Texte']), {
      pack: 'A',
      version: 3,
      notes: 'Texte'
    })
    assert.throws(() => parseParams(byName('packs show'), ['--inconnue', 'x']), /Option inconnue/)
    assert.throws(() => parseParams(byName('packs notes'), ['--version', 'trois']), /attend un nombre/)
  })

  it('chaque commande a un nom unique, une description, et figure dans la documentation', async () => {
    const names = COMMANDS.map((c) => c.name)
    assert.equal(new Set(names).size, names.length)
    const docs = await readFile(join('docs', 'commandes.md'), 'utf8')
    for (const command of COMMANDS) {
      assert.ok(command.summary.length > 10, command.name)
      assert.ok(docs.includes(`\`${command.name}\``), `${command.name} manque dans docs/commandes.md`)
    }
  })
})

describe('commandes', () => {
  let github: FakeGitHub
  let root: { dir: string; cleanup: () => Promise<void> }
  let env: Record<string, string>

  before(async () => {
    github = await startFakeGitHub()
    setGitHubApiOverride(github.apiBase)
    root = await tempDir()
    const appData = join(root.dir, 'AppData')
    const instances = join(root.dir, 'Instances')
    const workspace = join(root.dir, 'Modpacks')
    await mkdir(join(appData, 'Modding Manager'), { recursive: true })
    await mkdir(workspace)
    const settings = join(appData, 'Modding Manager', 'settings.json')
    await writeFile(settings, JSON.stringify({ instancesDir: instances, workspaceDir: workspace, repo: { owner: 'o', name: 'r' } }))
    useSettingsFile(settings)
    await makeInstance(instances, 'Mon Profil', {
      mods: [
        { file: 'sodium-1.0.jar', addonId: 394468, name: 'Sodium' },
        { file: 'lithium-1.0.jar', addonId: 360438, name: 'Lithium' }
      ]
    })
    process.env.GITHUB_TOKEN = 'jeton-de-test'
    env = { APPDATA: appData, MPD_GITHUB_API: github.apiBase, GITHUB_TOKEN: 'jeton-de-test' }
  })

  after(async () => {
    delete process.env.GITHUB_TOKEN
    setGitHubApiOverride(null)
    await github.close()
    await root.cleanup()
  })

  it('crée, règle et publie un modpack par les commandes, et le journal le raconte', async () => {
    const runtime = await createCommandRuntime({ holder: 'la ligne de commande' })
    const ctx = runtime.context({ progress: () => {}, signal: new AbortController().signal })
    const run = (name: string, params: Record<string, unknown>) => byName(name).run(byName(name).params.parse(params), ctx)

    assert.deepEqual(await run('packs create', { name: 'Mon Pack' }), { folder: 'Mon_Pack', file: null })
    const created = (await run('versions create', { pack: 'mon pack', profile: 'mon profil' })) as { file: string }
    assert.equal(created.file, 'Mon_Pack-v1.zip')
    const settings = (await run('packs settings', { pack: 'Mon_Pack', disabledMods: ['Sodium'] })) as { disabledMods: unknown[] }
    assert.deepEqual(settings.disabledMods, [{ addonId: 394468, file: 'sodium-1.0.jar', name: 'Sodium' }])
    await run('packs notes', { pack: 'Mon_Pack', version: 1, notes: 'Première version.' })

    const plan = (await run('publish plan', {})) as { actions: Array<{ kind: string }>; fingerprint: string }
    assert.deepEqual(
      plan.actions.map((a) => a.kind),
      ['create']
    )
    await assert.rejects(run('publish apply', { fingerprint: 'autre' }), /a changé depuis l’aperçu/)
    assert.deepEqual(await run('publish apply', { fingerprint: plan.fingerprint }), { changes: 1 })
    assert.equal(github.releases.length, 1)
    assert.match(github.releases[0].body ?? '', /Première version/)

    const entries = (await run('journal', {})) as Array<{ operation: string; ok: boolean; source: string }>
    assert.ok(entries.every((e) => e.source === 'la ligne de commande'))
    assert.deepEqual(
      entries.map((e) => [e.operation, e.ok]),
      [
        ['la publication', true],
        ['la publication', false],
        ['les notes de la v1 de Mon_Pack', true],
        ['les réglages des versions de Mon_Pack', true],
        ['la création d’une version de Mon_Pack', true],
        ['la création du modpack Mon Pack', true]
      ]
    )
  })

  it('expose les commandes comme outils MCP', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', join('src', 'cli', 'index.ts'), 'mcp'],
      env: { ...process.env, ...env } as Record<string, string>,
      stderr: 'pipe'
    })
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(transport)
    try {
      assert.match(client.getInstructions() ?? '', /publish_plan/)
      const { tools } = await client.listTools()
      assert.equal(tools.length, COMMANDS.length)
      const remove = tools.find((t) => t.name === 'packs_delete')!
      assert.equal(remove.annotations?.destructiveHint, true)
      assert.ok(remove.inputSchema.required?.includes('pack'))

      const listed = await client.callTool({ name: 'packs_list', arguments: {} })
      const packs = JSON.parse((listed.content as Array<{ text: string }>)[0].text) as Array<{ folder: string }>
      assert.deepEqual(
        packs.map((p) => p.folder),
        ['Mon_Pack']
      )
      const failed = await client.callTool({ name: 'packs_show', arguments: { pack: 'inconnu' } })
      assert.equal(failed.isError, true)
      assert.match((failed.content as Array<{ text: string }>)[0].text, /Modpack introuvable/)
    } finally {
      await client.close()
    }
  })
})
