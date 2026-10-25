// Packs de ressources et shaders dans le Studio : versions de Minecraft d'après pack.mcmeta, création depuis un dossier
// lié ou un zip, versions suivantes, rangement, publication sur GitHub, CurseForge et Modrinth.
import assert from 'node:assert/strict'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { ContentManifest } from '../src/shared/content'
import { CurseForgeClient } from '../src/core/curseforgeApi'
import { setCurseForgeApiOverride } from '../src/core/curseforgeAuth'
import { CurseForgeUploader } from '../src/core/curseforgeUpload'
import { setGitHubApiOverride } from '../src/core/githubEnv'
import { ModrinthClient, setModrinthApiOverride } from '../src/core/modrinth'
import { minecraftVersionsForFormats, packFormats } from '../src/core/studio/packFiles'
import { StudioService } from '../src/core/studio/service'
import { startFakeCurseForge, VALID_API_KEY, VALID_UPLOAD_TOKEN, type FakeCurseForge } from './support/fakeCurseForge'
import { startFakeGitHub, type FakeGitHub } from './support/fakeGitHub'
import { startFakeModrinth, VALID_MODRINTH_TOKEN, type FakeModrinth } from './support/fakeModrinth'
import { tempDir } from './support/fixtures'
import { makeJar } from './support/jars'

const noProgress = () => {}
const signal = () => new AbortController().signal
const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

describe('versions de Minecraft d’un pack de ressources', () => {
  it('lit pack_format, supported_formats et min_format / max_format', () => {
    assert.deepEqual(packFormats({ pack_format: 15 }), { min: 15, max: 15 })
    assert.deepEqual(packFormats({ pack_format: 15, supported_formats: [15, 18] }), { min: 15, max: 18 })
    assert.deepEqual(packFormats({ supported_formats: { min_inclusive: 34, max_inclusive: 46 } }), { min: 34, max: 46 })
    assert.deepEqual(packFormats({ min_format: [88, 0], max_format: [97, 1] }), { min: 88, max: 97 })
    assert.equal(packFormats({}), null)
  })

  it('traduit les formats en versions de Minecraft', () => {
    assert.deepEqual(minecraftVersionsForFormats(15, 15), ['1.20', '1.20.1'])
    assert.deepEqual(minecraftVersionsForFormats(88, 97.1), ['26.2', '26.3'])
    assert.deepEqual(minecraftVersionsForFormats(2, 3), [])
  })
})

describe('packs de ressources et shaders dans le Studio', () => {
  let github: FakeGitHub
  let curseforge: FakeCurseForge
  let modrinth: FakeModrinth
  let root: { dir: string; cleanup: () => Promise<void> }
  let workspace: string
  let source: string
  let service: StudioService

  before(async () => {
    github = await startFakeGitHub()
    setGitHubApiOverride(github.apiBase)
    curseforge = await startFakeCurseForge()
    setCurseForgeApiOverride(curseforge.url)
    curseforge.catalog.mods.push(
      { id: 5001, name: 'Textures HD', slug: 'textures-hd', classId: 12, isAvailable: true, allowModDistribution: true, links: { websiteUrl: 'https://www.curseforge.com/minecraft/texture-packs/textures-hd' }, latestFilesIndexes: [] },
      { id: 5002, name: 'Lumière', slug: 'lumiere', classId: 6552, isAvailable: true, allowModDistribution: true, links: { websiteUrl: 'https://www.curseforge.com/minecraft/shaders/lumiere' }, latestFilesIndexes: [] }
    )
    modrinth = await startFakeModrinth()
    setModrinthApiOverride(modrinth.url)
    modrinth.projects.push(
      { id: 'Rp000001', slug: 'textures-hd', title: 'Textures HD', project_type: 'resourcepack', status: 'approved' },
      { id: 'Sh000001', slug: 'lumiere', title: 'Lumière', project_type: 'shader', status: 'approved' }
    )
    root = await tempDir()
    workspace = join(root.dir, 'Modpacks')
    await mkdir(workspace, { recursive: true })
    // Un pack de ressources en cours de création, dans le dossier resourcepacks d'un profil.
    source = join(root.dir, 'resourcepacks', 'Textures_HD')
    await mkdir(join(source, 'assets', 'minecraft', 'textures'), { recursive: true })
    await writeFile(join(source, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 97, description: '§aDes textures nettes' } }))
    await writeFile(join(source, 'pack.png'), PNG)
    await writeFile(join(source, 'assets', 'minecraft', 'textures', 'pierre.png'), PNG)
    service = new StudioService({
      getWorkspaceDir: () => workspace,
      defaultWorkspaceDir: workspace,
      getAppSettings: async () => ({ role: 'publisher', repo: { owner: 'o', name: 'r' } }),
      getCredential: async () => ({ token: 'jeton-de-test', source: 'env' }),
      getCurseForgeClient: async () => new CurseForgeClient(VALID_API_KEY),
      getCurseForgeUploader: async () => new CurseForgeUploader(VALID_UPLOAD_TOKEN),
      getModrinthClient: async () => new ModrinthClient(VALID_MODRINTH_TOKEN),
      trashItem: (path) => rm(path, { recursive: true, force: true })
    })
  })

  after(async () => {
    setGitHubApiOverride(null)
    setCurseForgeApiOverride(null)
    setModrinthApiOverride(null)
    await Promise.all([github.close(), curseforge.close(), modrinth.close()])
    await root.cleanup()
  })

  it('crée un pack de ressources depuis son dossier, qui reste lié, avec sa v1', async () => {
    const folder = await service.createPackContent('resourcepack', source)
    assert.equal(folder, 'Textures_HD')
    assert.deepEqual((await readdir(join(workspace, folder))).sort(), ['Textures_HD-v1.zip', 'cover.png', 'pack.json'].sort())
    const saved = JSON.parse(await readFile(join(workspace, folder, 'pack.json'), 'utf8')) as Record<string, unknown>
    assert.equal(saved.type, 'resourcepack')
    assert.equal(saved.source, source)
    assert.equal(saved.description, 'Des textures nettes')
    const pack = (await service.overview()).packs.find((p) => p.folder === folder)!
    assert.deepEqual(pack.errors, [])
    assert.deepEqual(pack.contentVersions.map((v) => [v.version, v.files[0].minecraftVersions]), [['1', ['26.3']]])
  })

  it('zippe le dossier lié comme version suivante, et range un zip déposé à la main', async () => {
    await writeFile(join(source, 'assets', 'minecraft', 'textures', 'bois.png'), PNG)
    assert.equal(await service.zipContentVersion('Textures_HD'), 2)
    await writeFile(join(workspace, 'Textures_HD', 'retouche.zip'), await makeJar({ 'pack.mcmeta': JSON.stringify({ pack: { pack_format: 97, description: 'retouche' } }) }))
    assert.equal((await service.overview()).packs.find((p) => p.folder === 'Textures_HD')!.pending.length, 1)
    assert.equal(await service.applyRanger(), 1)
    const pack = (await service.overview()).packs.find((p) => p.folder === 'Textures_HD')!
    assert.deepEqual(pack.contentVersions.map((v) => v.version), ['3', '2', '1'])
    assert.equal(pack.nextVersion, 4)
  })

  it('publie chaque version en rp-<id>-v<N> avec content.json', async () => {
    const plan = (await service.freshPlan()).view
    assert.deepEqual(plan.actions.map((a) => a.tag), ['rp-textures-hd-v1', 'rp-textures-hd-v2', 'rp-textures-hd-v3'])
    assert.ok((await service.publish(plan.fingerprint, noProgress, signal())).ok)
    const release = github.releases.find((r) => r.tag_name === 'rp-textures-hd-v1')!
    assert.equal(release.name, 'Textures HD v1')
    assert.deepEqual(release.assets.map((a) => a.name).sort(), ['Textures_HD-v1.zip', 'content.json', 'cover.png'])
    const manifest = JSON.parse(github.file(release.tag_name, 'content.json')!.toString('utf8')) as ContentManifest
    assert.equal(manifest.type, 'resourcepack')
    assert.deepEqual(manifest.loaders, [])
    assert.deepEqual(manifest.minecraftVersions, ['26.3'])
  })

  it('envoie la dernière version sur CurseForge et Modrinth', async () => {
    await service.linkCurseForge('Textures_HD', 'https://www.curseforge.com/minecraft/texture-packs/textures-hd')
    await service.publishModToCurseForge('Textures_HD', '3', 'release', noProgress)
    const upload = curseforge.catalog.uploads.at(-1)!
    assert.equal(upload.metadata.displayName, 'Textures HD v3')
    assert.deepEqual(upload.metadata.gameVersions, [12600, 9638])
    assert.equal(upload.metadata.relations, undefined)

    await assert.rejects(() => service.linkModrinth('Textures_HD', 'lumiere'), /n’est pas un pack de ressources sur Modrinth/)
    await service.linkModrinth('Textures_HD', 'https://modrinth.com/resourcepack/textures-hd')
    await service.publishModToModrinth('Textures_HD', '3', 'release', noProgress)
    const sent = modrinth.created.at(-1)!
    assert.equal(sent.data.name, 'Textures HD v3')
    assert.equal(sent.data.version_number, '3')
    assert.deepEqual(sent.data.loaders, ['minecraft'])
    assert.deepEqual(sent.data.game_versions, ['26.3'])
  })

  it('refuse un zip qui n’est pas un shader, sans laisser de dossier', async () => {
    const wrong = join(root.dir, 'Pas_un_shader.zip')
    await writeFile(wrong, await makeJar({ 'lisez-moi.txt': 'rien' }))
    await assert.rejects(() => service.createPackContent('shader', wrong), /Pas de dossier shaders\//)
    assert.ok(!(await readdir(workspace)).includes('Pas_un_shader'))
  })

  it('demande les versions de Minecraft d’un shader avant de l’envoyer', async () => {
    const zip = join(root.dir, 'Lumière.zip')
    await writeFile(zip, await makeJar({ 'shaders/composite.fsh': 'void main() {}', 'shaders/shaders.properties': '' }))
    const folder = await service.createPackContent('shader', zip)
    const shader = (await service.overview()).packs.find((p) => p.folder === folder)!
    assert.equal(shader.source, null, 'créé depuis un zip : rien à lier')
    assert.deepEqual(shader.contentVersions[0].files[0].loaders, ['iris', 'optifine'])
    await service.linkCurseForge(folder, 'lumiere')
    await assert.rejects(() => service.publishModToCurseForge(folder, '1', 'release', noProgress), /Versions de Minecraft/)

    assert.deepEqual(await service.setMinecraftVersions(folder, ['26.3', 'pas une version', '26.3']), ['26.3'])
    await service.publishModToCurseForge(folder, '1', 'release', noProgress)
    assert.equal(curseforge.catalog.uploads.at(-1)!.metadata.displayName, 'Lumière v1')
    await service.linkModrinth(folder, 'lumiere')
    await service.publishModToModrinth(folder, '1', 'release', noProgress)
    assert.deepEqual(modrinth.created.at(-1)!.data.loaders, ['iris', 'optifine'])
  })

  it('range des contenus dans un groupe du Studio, sans rien toucher d’autre', async () => {
    const zip = join(root.dir, 'MA3D – Plants.zip')
    await writeFile(zip, await makeJar({ 'pack.mcmeta': JSON.stringify({ pack: { pack_format: 34, description: 'Cultures en 3D' } }) }))
    const folder = await service.createPackContent('resourcepack', zip)
    const packFile = async () => JSON.parse(await readFile(join(workspace, folder, 'pack.json'), 'utf8')) as Record<string, unknown>
    const view = async () => (await service.overview()).packs.find((p) => p.folder === folder)!
    assert.equal((await view()).group, null)
    assert.ok(!('group' in (await packFile())), 'sans groupe, pack.json n’a pas de champ group')

    assert.equal(await service.setPackGroup(folder, '  Mystical   Agriculture 3D '), 'Mystical Agriculture 3D')
    assert.equal((await packFile()).group, 'Mystical Agriculture 3D')
    assert.equal((await view()).group, 'Mystical Agriculture 3D')
    assert.equal((await view()).contentVersions.length, 1, 'ses versions restent là')

    // La fiche garde le groupe quand elle ne le donne pas, et le retire quand il est vide.
    await service.updatePackInfo(folder, { name: 'MA3D – Plants', description: 'Cultures en 3D' })
    assert.equal((await view()).group, 'Mystical Agriculture 3D')
    await service.updatePackInfo(folder, { name: 'MA3D – Plants', description: 'Cultures en 3D', group: '   ' })
    assert.equal((await view()).group, null)
    assert.ok(!('group' in (await packFile())))
    assert.equal(await service.setPackGroup(folder, null), null)
  })
})
