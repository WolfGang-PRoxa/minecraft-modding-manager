// Publication sur CurseForge, de bout en bout sur un faux CurseForge : lien avec un projet existant, export, envoi,
// modération ; et un modpack publié seulement sur CurseForge n'est jamais touché sur GitHub.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import yauzl from 'yauzl'
import { CurseForgeClient } from '../src/core/curseforgeApi'
import { setCurseForgeApiOverride } from '../src/core/curseforgeAuth'
import { manifestLoaderId } from '../src/core/curseforgeExport'
import { CurseForgeUploader } from '../src/core/curseforgeUpload'
import { setGitHubApiOverride } from '../src/core/githubEnv'
import { StudioService } from '../src/core/studio/service'
import { versionInDisplayName } from '../src/core/studio/curseforgePublish'
import { readEntries } from '../src/core/zip'
import { startFakeCurseForge, VALID_API_KEY, VALID_UPLOAD_TOKEN, type FakeCurseForge } from './support/fakeCurseForge'
import { startFakeGitHub, type FakeGitHub } from './support/fakeGitHub'
import { makeInstance, tempDir } from './support/fixtures'
import { makeJar } from './support/jars'

async function zipEntries(content: Buffer): Promise<Map<string, Buffer>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.fromBuffer(content, { lazyEntries: true, autoClose: false }, (err, z) => (err ? reject(err) : resolve(z)))
  )
  const result = new Map<string, Buffer>()
  for (const entry of await readEntries(zip)) {
    const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(entry, (err, s) => (err ? reject(err) : resolve(s))))
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    result.set(entry.fileName, Buffer.concat(chunks))
  }
  zip.close()
  return result
}

describe('publication sur CurseForge', () => {
  let curseforge: FakeCurseForge
  let github: FakeGitHub
  let root: { dir: string; cleanup: () => Promise<void> }
  let profile: string
  let service: StudioService

  before(async () => {
    curseforge = await startFakeCurseForge()
    setCurseForgeApiOverride(curseforge.url)
    github = await startFakeGitHub()
    setGitHubApiOverride(github.apiBase)
    root = await tempDir()
    const workspace = join(root.dir, 'Modpacks')
    profile = await makeInstance(join(root.dir, 'Instances'), 'Mon Pack', {
      mods: [
        { file: 'alpha-1.0.jar', addonId: 11, name: 'Alpha' },
        { file: 'beta-1.0.jar', addonId: 22, name: 'Beta', disabled: true }
      ],
      files: { 'shaderpacks/BSL.zip.txt': 'reglages', 'resourcepacks/perso.zip': 'pack', 'config/alpha.toml': 'x' }
    })
    const instanceFile = join(profile, 'minecraftinstance.json')
    const instance = JSON.parse(await readFile(instanceFile, 'utf8'))
    instance.installedAddons.forEach((a: any) => {
      a.installedFile.id = a.addonID * 100
      a.webSiteURL = `https://www.curseforge.com/minecraft/mc-mods/${a.name.toLowerCase()}`
      a.primaryAuthor = 'auteur'
    })
    await writeFile(instanceFile, JSON.stringify(instance))

    // Le projet existe déjà sur CurseForge, avec sa V27 (qui joint les réglages des shaders).
    curseforge.catalog.mods.push({ id: 777, name: 'Mon Pack', slug: 'mon-pack', classId: 4471, isAvailable: true, allowModDistribution: true, links: { websiteUrl: 'https://www.curseforge.com/minecraft/modpacks/mon-pack' }, latestFilesIndexes: [] })
    curseforge.catalog.files.push({ id: 5000, modId: 777, displayName: 'Mon Pack_V27.zip', fileName: 'Mon Pack.zip', releaseType: 1, fileDate: '2026-01-01T00:00:00Z', fileLength: 10, downloadUrl: null, isAvailable: true, gameVersions: ['1.20.1', 'Forge'], hashes: [], dependencies: [] })
    curseforge.catalog.downloads[5000] = await makeJar({ 'manifest.json': '{}', 'overrides/shaderpacks/BSL.zip.txt': 'ancien' })

    service = new StudioService({
      getWorkspaceDir: () => workspace,
      defaultWorkspaceDir: workspace,
      getAppSettings: async () => ({ role: 'publisher', repo: { owner: 'o', name: 'r' } }),
      getCredential: async () => ({ token: 'jeton', source: 'env' }),
      getInstancesDir: async () => join(root.dir, 'Instances'),
      getCurseForgeClient: async () => new CurseForgeClient(VALID_API_KEY),
      getCurseForgeUploader: async () => new CurseForgeUploader(VALID_UPLOAD_TOKEN)
    })
    const { mkdir } = await import('node:fs/promises')
    await mkdir(workspace)
  })

  after(async () => {
    setCurseForgeApiOverride(null)
    setGitHubApiOverride(null)
    await curseforge.close()
    await github.close()
    await root.cleanup()
  })

  it('reconnaît les usages du propriétaire', () => {
    assert.equal(versionInDisplayName('Full Create 6.0.8+ & Horror_V27.zip'), 27)
    assert.equal(versionInDisplayName('~Speedrun Games~ (Server Pack)_V3.zip'), 3)
    assert.equal(versionInDisplayName('Sans numéro.zip'), null)
    assert.equal(manifestLoaderId('fabric-0.19.5-26.3'), 'fabric-0.19.5')
    assert.equal(manifestLoaderId('forge-47.4.18'), 'forge-47.4.18')
  })

  it('lie le modpack au projet et continue sa numérotation', async () => {
    await service.createPack('Mon Pack')
    const link = await service.linkCurseForge('Mon_Pack', 'https://www.curseforge.com/minecraft/modpacks/mon-pack')
    assert.deepEqual([link.projectId, link.highestVersion, link.overrides], [777, 27, ['shaderpacks/BSL.zip.txt']])
    const fileName = await service.zipInstance('Mon_Pack', profile, false, () => {}, new AbortController().signal)
    assert.equal(fileName, 'Mon_Pack-v28.zip')
  })

  it('publie la version au format CurseForge, et suit sa modération', async () => {
    await service.setNotes('Mon_Pack', 28, '- Alpha mis à jour')
    const fileId = await service.publishToCurseForge('Mon_Pack', 28, 'release', () => {})
    const [upload] = curseforge.catalog.uploads
    assert.equal(upload.id, fileId)
    assert.equal(upload.projectId, 777)
    assert.equal(upload.fileName, 'Mon Pack.zip')
    assert.deepEqual(upload.metadata, {
      displayName: 'Mon Pack_V28.zip',
      changelog: '- Alpha mis à jour',
      releaseType: 'release',
      gameVersions: [9990, 7498],
      changelogType: 'markdown'
    })
    const entries = await zipEntries(upload.content)
    assert.deepEqual([...entries.keys()].sort(), ['manifest.json', 'modlist.html', 'overrides/shaderpacks/BSL.zip.txt'])
    const manifest = JSON.parse(entries.get('manifest.json')!.toString('utf8'))
    assert.deepEqual(manifest.minecraft, { version: '1.20.1', modLoaders: [{ id: 'forge-47.4.0', primary: true }] })
    assert.deepEqual(manifest.files, [
      { projectID: 11, fileID: 1100, required: true },
      { projectID: 22, fileID: 2200, required: false }
    ])
    assert.match(entries.get('modlist.html')!.toString('utf8'), /<li><a href="https:\/\/www\.curseforge\.com\/minecraft\/mc-mods\/alpha">Alpha \(by auteur\)<\/a><\/li>/)

    const statuses = await service.curseForgeStatuses('Mon_Pack')
    assert.deepEqual(statuses['28'], { fileId, status: 3, label: 'en cours de modération', displayName: 'Mon Pack_V28.zip' })
    await assert.rejects(service.publishToCurseForge('Mon_Pack', 28, 'release', () => {}), /déjà sur CurseForge/)
  })

  it('un modpack seulement sur CurseForge n’est jamais publié ni retiré sur GitHub', async () => {
    await service.updatePublishTargets('Mon_Pack', { github: false })
    const plan = await service.freshPlan()
    assert.equal(plan.view.actions.length, 0)
    await assert.rejects(service.updatePublishTargets('Mon_Pack', { unlinkCurseForge: true }), /publié quelque part/)
  })
})
