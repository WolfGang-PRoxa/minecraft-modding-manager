// Plugins de serveur dans le Studio : plugin.yml, dossier lié, publication sur GitHub, Modrinth et Hangar.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { CurseForgeClient } from '../src/core/curseforgeApi'
import { setCurseForgeApiOverride } from '../src/core/curseforgeAuth'
import { CurseForgeUploader } from '../src/core/curseforgeUpload'
import { setGitHubApiOverride } from '../src/core/githubEnv'
import { checkHangarKey, HangarClient, setHangarApiOverride } from '../src/core/hangar'
import { ModrinthClient, setModrinthApiOverride } from '../src/core/modrinth'
import { parsePluginYml } from '../src/core/studio/pluginFiles'
import { StudioService } from '../src/core/studio/service'
import { startFakeCurseForge, VALID_API_KEY, VALID_UPLOAD_TOKEN, type FakeCurseForge } from './support/fakeCurseForge'
import { startFakeGitHub, type FakeGitHub } from './support/fakeGitHub'
import { startFakeHangar, VALID_HANGAR_KEY, type FakeHangar } from './support/fakeHangar'
import { startFakeModrinth, VALID_MODRINTH_TOKEN, type FakeModrinth } from './support/fakeModrinth'
import { tempDir } from './support/fixtures'
import { makeJar } from './support/jars'

const noProgress = () => {}
const signal = () => new AbortController().signal

const pluginJar = (version: string, extra = '') =>
  makeJar({
    'plugin.yml': `name: OutilsPlus\nversion: '${version}'\nmain: fr.exemple.Outils\napi-version: "1.21"\ndescription: Des outils pour le serveur\ndepend: [Vault]\nsoftdepend:\n  - PlaceholderAPI\n${extra}`,
    'fr/exemple/Outils.class': `classe ${version}`
  })

describe('plugin.yml', () => {
  it('lit les clés de premier niveau et les listes', () => {
    const yml = parsePluginYml(`# commentaire
name: "Mon Plugin"
version: 1.0.0 # la version
depend: [Vault, LuckPerms]
softdepend:
  - PlaceholderAPI
  - 'ProtocolLib'
commands:
  outil:
    description: Une commande
api-version: '1.20'`)
    assert.equal(yml.name, 'Mon Plugin')
    assert.equal(yml.version, '1.0.0')
    assert.deepEqual(yml.depend, ['Vault', 'LuckPerms'])
    assert.deepEqual(yml.softdepend, ['PlaceholderAPI', 'ProtocolLib'])
    assert.equal(yml['api-version'], '1.20')
  })
})

describe('plugins dans le Studio', () => {
  let github: FakeGitHub
  let curseforge: FakeCurseForge
  let modrinth: FakeModrinth
  let hangar: FakeHangar
  let root: { dir: string; cleanup: () => Promise<void> }
  let workspace: string
  let source: string
  let service: StudioService

  before(async () => {
    github = await startFakeGitHub()
    setGitHubApiOverride(github.apiBase)
    curseforge = await startFakeCurseForge()
    setCurseForgeApiOverride(curseforge.url)
    modrinth = await startFakeModrinth()
    setModrinthApiOverride(modrinth.url)
    modrinth.projects.push({ id: 'Pl000001', slug: 'outilsplus', title: 'OutilsPlus', project_type: 'plugin', status: 'approved' })
    hangar = await startFakeHangar()
    setHangarApiOverride(hangar.url)
    hangar.projects.push({ id: 7, name: 'OutilsPlus', namespace: { owner: 'WolfGang', slug: 'OutilsPlus' } })
    root = await tempDir()
    workspace = join(root.dir, 'Modpacks')
    source = join(root.dir, 'outils', 'build', 'libs')
    await mkdir(workspace, { recursive: true })
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'OutilsPlus-2.0.0.jar'), await pluginJar('2.0.0'))
    await writeFile(join(source, 'OutilsPlus-2.1.0.jar'), await pluginJar('2.1.0', 'folia-supported: true\n'))
    // Un jar dont la version n'a pas été remplie au build : ignoré.
    await writeFile(join(source, 'OutilsPlus-dev.jar'), await pluginJar('${project.version}'))
    service = new StudioService({
      getWorkspaceDir: () => workspace,
      defaultWorkspaceDir: workspace,
      getAppSettings: async () => ({ role: 'publisher', repo: { owner: 'o', name: 'r' } }),
      getCredential: async () => ({ token: 'jeton-de-test', source: 'env' }),
      getCurseForgeClient: async () => new CurseForgeClient(VALID_API_KEY),
      getCurseForgeUploader: async () => new CurseForgeUploader(VALID_UPLOAD_TOKEN),
      getModrinthClient: async () => new ModrinthClient(VALID_MODRINTH_TOKEN),
      getHangarClient: async () => new HangarClient(VALID_HANGAR_KEY),
      trashItem: (path) => rm(path, { recursive: true, force: true })
    })
  })

  after(async () => {
    setGitHubApiOverride(null)
    setCurseForgeApiOverride(null)
    setModrinthApiOverride(null)
    setHangarApiOverride(null)
    await Promise.all([github.close(), curseforge.close(), modrinth.close(), hangar.close()])
    await root.cleanup()
  })

  it('crée le plugin depuis le dossier de ses builds, avec sa version la plus récente', async () => {
    const folder = await service.createModFromSource(source, undefined, 'plugin')
    assert.equal(folder, 'OutilsPlus')
    const saved = JSON.parse(await readFile(join(workspace, folder, 'pack.json'), 'utf8')) as Record<string, unknown>
    assert.equal(saved.type, 'plugin')
    assert.equal(saved.id, 'outilsplus')
    const plugin = (await service.overview()).packs.find((p) => p.folder === folder)!
    assert.deepEqual(plugin.errors, [])
    const [file] = plugin.contentVersions[0].files
    assert.equal(plugin.contentVersions[0].version, '2.1.0')
    assert.deepEqual(file.loaders, ['paper', 'spigot', 'bukkit', 'purpur', 'folia'])
    assert.deepEqual(file.minecraftVersions, ['1.21'])
    assert.deepEqual(file.dependencies, ['Vault'])
    assert.deepEqual((await service.availableModVersions(folder)).map((v) => v.version), ['2.0.0'])
  })

  it('prend les versions de Minecraft données à la main, et publie sur GitHub', async () => {
    await service.setMinecraftVersions('OutilsPlus', ['1.21.4', '1.21.8'])
    const plugin = (await service.overview()).packs.find((p) => p.folder === 'OutilsPlus')!
    assert.deepEqual(plugin.contentVersions[0].files[0].minecraftVersions, ['1.21.4', '1.21.8'])
    const plan = (await service.freshPlan()).view
    assert.deepEqual(plan.actions.map((a) => a.tag), ['plugin-outilsplus-v2.1.0'])
    assert.ok((await service.publish(plan.fingerprint, noProgress, signal())).ok)
  })

  it('refuse CurseForge, et publie sur Modrinth pour Paper, Spigot, Bukkit, Purpur et Folia', async () => {
    await assert.rejects(() => service.linkCurseForge('OutilsPlus', '123'), /plugins ne se publient pas encore sur CurseForge/)
    await service.linkModrinth('OutilsPlus', 'https://modrinth.com/plugin/outilsplus')
    await service.publishModToModrinth('OutilsPlus', '2.1.0', 'release', noProgress)
    const sent = modrinth.created.at(-1)!
    assert.equal(sent.data.name, 'OutilsPlus 2.1.0')
    assert.deepEqual(sent.data.loaders, ['paper', 'spigot', 'bukkit', 'purpur', 'folia'])
    assert.deepEqual(sent.data.game_versions, ['1.21.4', '1.21.8'])
  })

  it('vérifie la clé Hangar', async () => {
    assert.deepEqual(await checkHangarKey(VALID_HANGAR_KEY), { valid: true, username: 'WolfGang', error: null })
    assert.equal((await checkHangarKey('mauvaise')).valid, false)
  })

  it('publie sur Hangar pour Paper, une seule fois par version', async () => {
    await assert.rejects(() => service.linkHangar('OutilsPlus', 'Inconnu'), /Aucun projet Hangar/)
    const link = await service.linkHangar('OutilsPlus', 'https://hangar.papermc.io/WolfGang/OutilsPlus')
    assert.deepEqual(link, { slug: 'OutilsPlus', owner: 'WolfGang', url: 'https://hangar.papermc.io/WolfGang/OutilsPlus' })
    await service.setNotes('OutilsPlus', '2.1.0', 'Prise en charge de Folia.')
    await service.publishToHangar('OutilsPlus', '2.1.0', 'release', noProgress)
    const upload = hangar.uploads.at(-1)!
    assert.deepEqual(upload.versionUpload, {
      version: '2.1.0',
      channel: 'Release',
      description: 'Prise en charge de Folia.',
      platformDependencies: { PAPER: ['1.21.4', '1.21.8'] },
      pluginDependencies: {},
      files: [{ platforms: ['PAPER'] }]
    })
    assert.deepEqual(upload.files.map((f) => f.name), ['OutilsPlus-2.1.0.jar'])
    await assert.rejects(() => service.publishToHangar('OutilsPlus', '2.1.0', 'release', noProgress), /déjà sur Hangar/)
    const versions = await service.hangarVersions('OutilsPlus')
    assert.deepEqual(versions.map((v) => [v.name, v.version, v.sentByApp]), [['2.1.0', '2.1.0', true]])
  })
})
