// Types de contenu (modpack, mod, pack de ressources…) : tags, pack.json, et garde-fous tant qu'un type n'est pas pris
// en charge. Rien ne doit jamais toucher les releases d'un autre type, ni les faire passer pour des modpacks.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { CONTENT_KINDS, contentTag, parseContentTag } from '../src/shared/content'
import { modpackVersionFromRelease, parseModpackTag, type GhRelease } from '../src/shared/releases'
import { setGitHubApiOverride } from '../src/core/githubEnv'
import { StudioService } from '../src/core/studio/service'
import { startFakeGitHub, type FakeGitHub } from './support/fakeGitHub'
import { tempDir } from './support/fixtures'

const releaseOf = (tag: string, assets: string[]): GhRelease => ({
  id: 900,
  tag_name: tag,
  name: tag,
  body: '',
  draft: false,
  prerelease: false,
  published_at: '2026-10-01T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
  html_url: 'https://example.test/release',
  upload_url: '',
  assets: assets.map((name, i) => ({ id: 900 + i, name, size: 10, browser_download_url: `https://example.test/${name}`, updated_at: '' }))
})

describe('tags des types de contenu', () => {
  it('écrit et relit le tag de chaque type', () => {
    assert.equal(contentTag('modpack', 'aventure', '12'), 'pack-aventure-v12')
    assert.equal(contentTag('mod', 'lma', '1.2.0'), 'mod-lma-v1.2.0')
    assert.deepEqual(parseContentTag('rp-textures-hd-v3'), { kind: 'resourcepack', id: 'textures-hd', version: '3' })
    assert.deepEqual(parseContentTag('mod-lma-v1.2.0+26.3'), { kind: 'mod', id: 'lma', version: '1.2.0+26.3' })
    assert.equal(parseContentTag('app-v1.9.3'), null)
    assert.equal(parseContentTag('autre-chose'), null)
  })

  it('ne prend un tag pour celui d’un modpack que s’il commence par pack-', () => {
    assert.deepEqual(parseModpackTag('pack-aventure-v12'), { id: 'aventure', version: '12' })
    assert.equal(parseModpackTag('mod-lma-v1.2.0'), null)
    assert.equal(parseModpackTag('rp-textures-v1'), null)
  })

  it('n’utilise ni pack- ni modpack.json pour un autre type', () => {
    const prefixes = Object.values(CONTENT_KINDS).map((k) => k.tagPrefix)
    assert.equal(new Set(prefixes).size, prefixes.length)
    for (const [kind, info] of Object.entries(CONTENT_KINDS)) {
      if (kind === 'modpack') continue
      assert.ok(!info.tagPrefix.startsWith('pack-') && !'pack-'.startsWith(info.tagPrefix), kind)
      assert.notEqual(info.manifest, 'modpack.json', kind)
    }
  })

  it('reste invisible pour une application installée qui ne lit que les modpacks', () => {
    // Ce que fait la Bibliothèque des versions déjà installées chez les joueurs : sans modpack.json, il faut un tag pack-.
    for (const tag of ['mod-lma-v1.2.0', 'rp-textures-v1', 'shader-lumiere-v2', 'plugin-outils-v0.3.0']) {
      assert.equal(modpackVersionFromRelease(releaseOf(tag, ['contenu.zip', 'content.json']), null), null, tag)
    }
  })
})

describe('dossier d’un autre type que le modpack', () => {
  let github: FakeGitHub
  let root: { dir: string; cleanup: () => Promise<void> }
  let workspace: string
  let service: StudioService

  before(async () => {
    github = await startFakeGitHub()
    setGitHubApiOverride(github.apiBase)
    root = await tempDir()
    workspace = join(root.dir, 'Modpacks')
    await mkdir(join(workspace, 'Mon_Mod'), { recursive: true })
    await writeFile(join(workspace, 'Mon_Mod', 'pack.json'), JSON.stringify({ type: 'mod', id: 'mon-mod', name: 'Mon mod', description: '', lastVersion: 0, notes: {} }))
    await writeFile(join(workspace, 'Mon_Mod', 'mon-mod-1.0.0.jar'), 'jar')
    await mkdir(join(workspace, 'Outils'), { recursive: true })
    await writeFile(join(workspace, 'Outils', 'pack.json'), JSON.stringify({ type: 'plugin', id: 'outils', name: 'Outils' }))
    await mkdir(join(workspace, 'Bizarre'), { recursive: true })
    await writeFile(join(workspace, 'Bizarre', 'pack.json'), JSON.stringify({ type: 'datapack', id: 'bizarre', name: 'Bizarre' }))
    // Release d'un mod déjà sur GitHub : la publication des modpacks ne doit jamais la retirer.
    github.releases.push(releaseOf('mod-mon-mod-v1.0.0', ['mon-mod-1.0.0.jar']))
    service = new StudioService({
      getWorkspaceDir: () => workspace,
      defaultWorkspaceDir: workspace,
      getAppSettings: async () => ({ role: 'publisher', repo: { owner: 'o', name: 'r' } }),
      getCredential: async () => ({ token: 'jeton-de-test', source: 'env' }),
      trashItem: (path) => rm(path, { recursive: true, force: true })
    })
  })

  after(async () => {
    setGitHubApiOverride(null)
    await github.close()
    await root.cleanup()
  })

  it('montre le dossier avec son type, sans le publier tant que le type n’est pas pris en charge', async () => {
    const overview = await service.overview({ refreshRemote: true })
    const plugin = overview.packs.find((p) => p.folder === 'Outils')!
    assert.equal(plugin.type, 'plugin')
    assert.match(plugin.errors.join(' '), /plugins ne sont pas encore pris en charge/)

    // Un jar illisible bloque tout le mod : on ne sait pas à quelle version il appartient.
    const mod = overview.packs.find((p) => p.folder === 'Mon_Mod')!
    assert.equal(mod.type, 'mod')
    assert.deepEqual(mod.versions, [])
    assert.match(mod.errors.join(' '), /mon-mod-1\.0\.0\.jar : illisible ou pas un mod/)

    const unknown = overview.packs.find((p) => p.folder === 'Bizarre')!
    assert.match(unknown.errors.join(' '), /Type « datapack » inconnu/)
  })

  it('ne retire pas la release d’un autre type à la publication', async () => {
    const plan = (await service.freshPlan()).view
    assert.deepEqual(plan.actions.filter((a) => a.tag.startsWith('mod-')), [])
    assert.equal(plan.actions.filter((a) => a.kind === 'delete').length, 0)
  })

  it('refuse les opérations propres aux modpacks', async () => {
    await assert.rejects(() => service.updatePackSettings('Mon_Mod', { exclude: [], disabledMods: [], keepPlayerConfigs: true }), /contient des mods, pas un modpack/)
    await assert.rejects(() => service.updatePackUpdates('Mon_Mod', { frequency: 'weekly' }), /pas un modpack/)
  })

  it('garde le type dans pack.json quand la fiche change', async () => {
    await service.updatePackInfo('Mon_Mod', { name: 'Mon mod renommé', description: 'Un mod' })
    const saved = JSON.parse(await readFile(join(workspace, 'Mon_Mod', 'pack.json'), 'utf8')) as Record<string, unknown>
    assert.equal(saved.type, 'mod')
    assert.equal(saved.name, 'Mon mod renommé')
  })

  it('n’écrit pas de type pour un modpack', async () => {
    const folder = await service.createPack('Un modpack')
    const saved = JSON.parse(await readFile(join(workspace, folder, 'pack.json'), 'utf8')) as Record<string, unknown>
    assert.equal('type' in saved, false)
    const library = await service.library()
    assert.ok(!JSON.stringify(library).includes('Mon_Mod'), 'un dossier de mods n’est jamais lié à un profil')
  })
})
