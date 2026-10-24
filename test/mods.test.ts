// Les mods dans le Studio : dossier lié au projet du mod, import des versions, publication sur GitHub (mod-<id>-v…,
// content.json), suppression d'une version.
import assert from 'node:assert/strict'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { ContentManifest } from '../src/shared/content'
import { CurseForgeClient } from '../src/core/curseforgeApi'
import { setCurseForgeApiOverride } from '../src/core/curseforgeAuth'
import { CurseForgeUploader } from '../src/core/curseforgeUpload'
import { checkModrinthToken, ModrinthClient, setModrinthApiOverride } from '../src/core/modrinth'
import { setGitHubApiOverride } from '../src/core/githubEnv'
import { minecraftVersionsOf } from '../src/core/studio/mods'
import { StudioService } from '../src/core/studio/service'
import { startFakeCurseForge, VALID_API_KEY, VALID_UPLOAD_TOKEN, type FakeCurseForge } from './support/fakeCurseForge'
import { startFakeGitHub, type FakeGitHub } from './support/fakeGitHub'
import { startFakeModrinth, VALID_MODRINTH_TOKEN, type FakeModrinth } from './support/fakeModrinth'
import { tempDir } from './support/fixtures'
import { makeJar } from './support/jars'

const noProgress = () => {}
const signal = () => new AbortController().signal

const lmaJar = (version: string) =>
  makeJar({
    'fabric.mod.json': JSON.stringify({
      schemaVersion: 1,
      id: 'lma',
      version: `${version}-26.3`,
      name: 'LMA',
      description: 'Un mod de test',
      environment: '*',
      icon: 'assets/lma/icon.png',
      depends: { fabricloader: '>=0.19.5', minecraft: '~26.3', java: '>=25', 'fabric-api': '*', 'fabric-language-kotlin': '>=1.14.2' }
    }),
    'com/exemple/Lma.class': `classe ${version}`,
    'assets/lma/icon.png': Buffer.from('89504e470d0a1a0a', 'hex')
  })

describe('versions de Minecraft d’un jar', () => {
  it('ne retient que des versions précises', () => {
    assert.deepEqual(minecraftVersionsOf('~26.3'), ['26.3'])
    assert.deepEqual(minecraftVersionsOf('1.21.1'), ['1.21.1'])
    assert.deepEqual(minecraftVersionsOf(['1.21', '1.21.1']), ['1.21', '1.21.1'])
    assert.deepEqual(minecraftVersionsOf('[1.20.1]'), ['1.20.1'])
    assert.deepEqual(minecraftVersionsOf('[1.20.1,1.20.2)'), ['1.20.1'])
    assert.deepEqual(minecraftVersionsOf('[1.20.1,1.21)'), [])
    assert.deepEqual(minecraftVersionsOf('*'), [])
    assert.deepEqual(minecraftVersionsOf(null), [])
  })
})

describe('mods dans le Studio', () => {
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
    // Le projet du mod existe sur CurseForge, avec une version mise en ligne depuis le site ; et ses dépendances.
    const project = (id: number, name: string, slug: string) => ({ id, name, slug, classId: 6, isAvailable: true, allowModDistribution: true, links: { websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/${slug}` }, latestFilesIndexes: [] })
    curseforge.catalog.mods.push(project(1599334, 'LMA', 'lma'), project(306612, 'Fabric API', 'fabric-api'), project(308769, 'Fabric Language Kotlin', 'fabric-language-kotlin'))
    curseforge.catalog.files.push({ id: 9169792, modId: 1599334, displayName: 'lma-26.3-1.1.0', fileName: 'lma-26.3-1.1.0.jar', releaseType: 1, fileStatus: 4, fileDate: '2026-10-14T00:00:00Z', fileLength: 10, downloadUrl: null, isAvailable: true, gameVersions: ['26.3', 'Fabric'], hashes: [], dependencies: [] } as never)
    modrinth = await startFakeModrinth()
    setModrinthApiOverride(modrinth.url)
    // Le projet du mod sur Modrinth (le slug « lma » est pris : « lma-mod »), avec une version mise en ligne depuis le site.
    const mr = (id: string, slug: string, title: string, type = 'mod') => ({ id, slug, title, project_type: type, status: 'approved' })
    modrinth.projects.push(mr('AbCd1234', 'lma-mod', 'LMA'), mr('P7dR8mSH', 'fabric-api', 'Fabric API'), mr('Ha28R6CL', 'fabric-language-kotlin', 'Fabric Language Kotlin'), mr('ZmrsPQI7', 'lma', 'LMA', 'modpack'))
    modrinth.versions.push({ id: 'old1', project_id: 'AbCd1234', name: 'LMA 1.1.0', version_number: '1.1.0', version_type: 'release', status: 'listed', date_published: '2026-10-14T00:00:00Z', game_versions: ['26.3'], loaders: ['fabric'], files: [{ filename: 'lma-26.3-1.1.0.jar', hashes: {}, primary: true }] })
    root = await tempDir()
    workspace = join(root.dir, 'Modpacks')
    source = join(root.dir, 'lma', 'releases')
    await mkdir(workspace, { recursive: true })
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'lma-26.3-1.1.0.jar'), await lmaJar('1.1.0'))
    await writeFile(join(source, 'lma-26.3-1.2.0.jar'), await lmaJar('1.2.0'))
    // Copie du dernier jar sous un autre nom, comme le fait le script de release du mod.
    await copyFile(join(source, 'lma-26.3-1.2.0.jar'), join(source, 'lma-latest.jar'))
    await writeFile(join(source, 'notes.txt'), 'pas un jar')
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
    await curseforge.close()
    await modrinth.close()
    await github.close()
    await root.cleanup()
  })

  it('crée le mod depuis le dossier de son projet, avec sa version la plus récente', async () => {
    const folder = await service.createModFromSource(source)
    assert.equal(folder, 'LMA')
    assert.deepEqual(await readdir(join(workspace, folder)), ['cover.png', 'lma-26.3-1.2.0.jar', 'pack.json'])
    const saved = JSON.parse(await readFile(join(workspace, folder, 'pack.json'), 'utf8')) as Record<string, unknown>
    assert.equal(saved.type, 'mod')
    assert.equal(saved.id, 'lma')
    assert.equal(saved.description, 'Un mod de test')
    assert.equal(saved.source, source)

    const mod = (await service.overview()).packs.find((p) => p.folder === folder)!
    assert.deepEqual(mod.errors, [])
    assert.equal(mod.contentVersions.length, 1)
    const [file] = mod.contentVersions[0].files
    assert.equal(mod.contentVersions[0].version, '1.2.0-26.3')
    assert.deepEqual(file.loaders, ['fabric'])
    assert.deepEqual(file.minecraftVersions, ['26.3'])
    assert.deepEqual(file.dependencies, ['fabric-api', 'fabric-language-kotlin'])
  })

  it('propose les versions du dossier lié qui manquent, sans compter la copie « latest »', async () => {
    const available = await service.availableModVersions('LMA')
    assert.deepEqual(
      available.map((v) => [v.version, v.files.map((f) => f.fileName)]),
      [['1.1.0-26.3', ['lma-26.3-1.1.0.jar']]]
    )
    assert.deepEqual(await service.importModVersions('LMA'), ['1.1.0-26.3'])
    await assert.rejects(() => service.importModVersions('LMA'), /Aucune nouvelle version/)
  })

  it('publie chaque version comme une release mod-<id>-v<version> avec son content.json', async () => {
    await service.setNotes('LMA', '1.2.0-26.3', 'Particules des armures.')
    const plan = (await service.freshPlan()).view
    assert.deepEqual(plan.actions.map((a) => [a.kind, a.tag]), [
      ['create', 'mod-lma-v1.1.0-26.3'],
      ['create', 'mod-lma-v1.2.0-26.3']
    ])
    const result = await service.publish(plan.fingerprint, noProgress, signal())
    assert.ok(result.ok, result.ok ? '' : result.error)

    const release = github.releases.find((r) => r.tag_name === 'mod-lma-v1.2.0-26.3')!
    assert.equal(release.name, 'LMA 1.2.0-26.3')
    assert.equal(release.draft, false)
    assert.match(release.body ?? '', /Particules des armures\.\n\n---\n_Minecraft 26\.3 · Fabric_/)
    assert.deepEqual(release.assets.map((a) => a.name).sort(), ['content.json', 'cover.png', 'lma-26.3-1.2.0.jar'])
    const manifest = JSON.parse(github.file(release.tag_name, 'content.json')!.toString('utf8')) as ContentManifest
    assert.equal(manifest.type, 'mod')
    assert.equal(manifest.version, '1.2.0-26.3')
    assert.deepEqual(manifest.minecraftVersions, ['26.3'])
    assert.equal(manifest.files[0].sha256.length, 64)
    assert.ok(!github.releases.some((r) => r.tag_name.startsWith('pack-')), 'rien sous pack- pour un mod')

    assert.deepEqual((await service.freshPlan()).view.actions, [])
    const mod = (await service.overview()).packs.find((p) => p.folder === 'LMA')!
    assert.deepEqual(mod.contentVersions.map((v) => v.remote), ['published', 'published'])
  })

  it('ne renvoie que le texte de la release quand les notes changent', async () => {
    await service.setNotes('LMA', '1.1.0-26.3', 'Heure réelle dans le chat.')
    const plan = (await service.freshPlan()).view
    assert.deepEqual(plan.actions.map((a) => [a.kind, a.tag, a.uploadBytes]), [['update', 'mod-lma-v1.1.0-26.3', 0]])
    assert.ok((await service.publish(plan.fingerprint, noProgress, signal())).ok)
    assert.match(github.releases.find((r) => r.tag_name === 'mod-lma-v1.1.0-26.3')!.body ?? '', /Heure réelle/)
  })

  it('supprime une version : ses jars et sa release', async () => {
    const result = await service.deleteModVersion('LMA', '1.1.0-26.3')
    assert.ok(result.ok, result.ok ? '' : result.error)
    assert.ok(!github.releases.some((r) => r.tag_name === 'mod-lma-v1.1.0-26.3'))
    assert.deepEqual(await readdir(join(workspace, 'LMA')), ['cover.png', 'lma-26.3-1.2.0.jar', 'pack.json'])
    // Elle redevient importable depuis le dossier lié.
    assert.deepEqual((await service.availableModVersions('LMA')).map((v) => v.version), ['1.1.0-26.3'])
  })

  it('lie le mod à son projet CurseForge et reconnaît les versions mises en ligne depuis le site', async () => {
    await assert.rejects(() => service.linkCurseForge('LMA', 'fabric-api-inconnu'), /Aucun mod CurseForge/)
    const linked = await service.linkCurseForge('LMA', 'https://www.curseforge.com/minecraft/mc-mods/lma')
    assert.equal(linked.projectId, 1599334)
    await service.importModVersions('LMA', ['1.1.0-26.3'])
    const versions = await service.curseForgeVersions('LMA')
    assert.deepEqual(versions.map((v) => [v.displayName, v.version]), [['lma-26.3-1.1.0', '1.1.0-26.3']])
    await service.deleteModVersion('LMA', '1.1.0-26.3')
  })

  it('met une version en ligne sur CurseForge, avec Minecraft, Fabric, client, serveur et dépendances', async () => {
    const result = await service.publishModToCurseForge('LMA', '1.2.0-26.3', 'release', noProgress)
    assert.equal(result.fileIds.length, 1)
    assert.deepEqual(result.unknownDependencies, [])
    const upload = curseforge.catalog.uploads.at(-1)!
    assert.equal(upload.projectId, 1599334)
    assert.equal(upload.fileName, 'lma-26.3-1.2.0.jar')
    assert.equal(upload.metadata.displayName, 'lma-26.3-1.2.0')
    assert.deepEqual(upload.metadata.gameVersions, [12600, 7499, 9638, 9639])
    assert.deepEqual(upload.metadata.relations, {
      projects: [
        { slug: 'fabric-api', type: 'requiredDependency' },
        { slug: 'fabric-language-kotlin', type: 'requiredDependency' }
      ]
    })
    const saved = JSON.parse(await readFile(join(workspace, 'LMA', 'pack.json'), 'utf8')) as { curseforge: { files: Record<string, number> } }
    assert.equal(saved.curseforge.files['1.2.0-26.3'], result.fileIds[0])
    await assert.rejects(() => service.publishModToCurseForge('LMA', '1.2.0-26.3', 'release', noProgress), /déjà sur CurseForge/)
    const mod = (await service.overview()).packs.find((p) => p.folder === 'LMA')!
    assert.equal(mod.contentVersions[0].curseforgeFileId, result.fileIds[0])
  })

  it('vérifie le jeton Modrinth', async () => {
    assert.deepEqual(await checkModrinthToken(VALID_MODRINTH_TOKEN), { valid: true, username: 'WolfGang', error: null })
    assert.equal((await checkModrinthToken('mrp_faux')).valid, false)
  })

  it('lie le mod à son projet Modrinth, mais pas à un modpack du même nom', async () => {
    await assert.rejects(() => service.linkModrinth('LMA', 'https://modrinth.com/modpack/lma'), /n’est pas un mod sur Modrinth/)
    const linked = await service.linkModrinth('LMA', 'https://modrinth.com/mod/lma-mod')
    assert.deepEqual(linked, { projectId: 'AbCd1234', slug: 'lma-mod', url: 'https://modrinth.com/mod/lma-mod' })
    await service.importModVersions('LMA', ['1.1.0-26.3'])
    const versions = await service.modrinthVersions('LMA')
    assert.deepEqual(versions.map((v) => [v.versionNumber, v.version, v.sentByApp]), [['1.1.0', '1.1.0-26.3', false]])
    await service.deleteModVersion('LMA', '1.1.0-26.3')
  })

  it('met une version en ligne sur Modrinth, avec Minecraft, Fabric et ses dépendances', async () => {
    const result = await service.publishModToModrinth('LMA', '1.2.0-26.3', 'release', noProgress)
    assert.deepEqual(result.unknownDependencies, [])
    const sent = modrinth.created.at(-1)!
    assert.equal(sent.data.project_id, 'AbCd1234')
    assert.equal(sent.data.version_number, '1.2.0-26.3')
    assert.equal(sent.data.name, 'LMA 1.2.0-26.3')
    assert.equal(sent.data.changelog, 'Particules des armures.')
    assert.deepEqual(sent.data.game_versions, ['26.3'])
    assert.deepEqual(sent.data.loaders, ['fabric'])
    assert.deepEqual(sent.data.dependencies, [
      { project_id: 'P7dR8mSH', dependency_type: 'required' },
      { project_id: 'Ha28R6CL', dependency_type: 'required' }
    ])
    assert.deepEqual(sent.files.map((f) => f.name), ['lma-26.3-1.2.0.jar'])
    await assert.rejects(() => service.publishModToModrinth('LMA', '1.2.0-26.3', 'release', noProgress), /déjà sur Modrinth/)
    const mod = (await service.overview()).packs.find((p) => p.folder === 'LMA')!
    assert.equal(mod.contentVersions[0].modrinthVersionId, result.versionId)
    assert.equal((await service.modrinthVersions('LMA'))[0].version, '1.2.0-26.3')
  })

  it('signale deux jars de la même version', async () => {
    await copyFile(join(workspace, 'LMA', 'lma-26.3-1.2.0.jar'), join(workspace, 'LMA', 'lma-copie.jar'))
    const mod = (await service.overview()).packs.find((p) => p.folder === 'LMA')!
    assert.match(mod.errors.join(' '), /Deux jars pour la version 1\.2\.0-26\.3/)
    // Mod en erreur : ses releases ne sont pas touchées.
    assert.ok(!(await service.freshPlan()).view.actions.some((a) => a.kind === 'delete'))
    await rm(join(workspace, 'LMA', 'lma-copie.jar'))
  })
})
