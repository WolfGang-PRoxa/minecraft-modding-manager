// Le studio de bout en bout, sur un dossier temporaire et un faux GitHub : créer un modpack, zipper une instance,
// ranger, publier, régler, supprimer.
import assert from 'node:assert/strict'
import { readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { setGitHubApiOverride } from '../src/core/githubEnv'
import { StudioService } from '../src/core/studio/service'
import type { ModpackManifest } from '../src/shared/types'
import { startFakeGitHub, type FakeGitHub } from './support/fakeGitHub'
import { makeInstance, tempDir } from './support/fixtures'

const noProgress = () => {}
const signal = () => new AbortController().signal

describe('studio', () => {
  let github: FakeGitHub
  let root: { dir: string; cleanup: () => Promise<void> }
  let workspace: string
  let instances: string
  let service: StudioService

  before(async () => {
    github = await startFakeGitHub()
    setGitHubApiOverride(github.apiBase)
    root = await tempDir()
    workspace = join(root.dir, 'Modpacks')
    instances = join(root.dir, 'Instances')
    await makeInstance(instances, 'Pack A', {
      mods: [
        { file: 'alpha-1.0.jar', addonId: 11, name: 'Alpha' },
        { file: 'beta-2.0.jar', addonId: 22, name: 'Beta' },
        { file: 'local.jar' }
      ],
      files: { 'config/alpha.toml': 'a = 1', 'saves/Monde/level.dat': 'monde', 'options.txt': 'fov:70' }
    })
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

  it('crée un modpack et zippe une instance comme v1', async () => {
    const folder = await service.createPack('Pack A')
    assert.equal(folder, 'Pack_A')
    const fileName = await service.zipInstance(folder, join(instances, 'Pack A'), false, noProgress, signal())
    assert.equal(fileName, 'Pack_A-v1.zip')

    const overview = await service.overview()
    const pack = overview.packs.find((p) => p.folder === folder)!
    assert.equal(pack.versions.length, 1)
    const analysis = pack.versions[0].analysis!
    assert.equal(analysis.minecraftVersion, '1.20.1')
    assert.equal(analysis.modLoader, 'forge-47.4.0')
    assert.equal(analysis.modCount, 3)
    assert.deepEqual(analysis.warnings, [], 'les mondes ne sont pas inclus par défaut')
  })

  it('publie la v1 sur GitHub, puis ne trouve plus rien à publier', async () => {
    const plan = (await service.freshPlan()).view
    assert.deepEqual(
      plan.actions.map((a) => a.kind),
      ['create']
    )
    const result = await service.publish(plan.fingerprint, noProgress, signal())
    assert.ok(result.ok, result.ok ? '' : result.error)

    const release = github.releases.find((r) => r.tag_name.endsWith('-v1'))!
    assert.ok(release, 'release créée')
    assert.equal(release.draft, false)
    const manifest = JSON.parse(github.file(release.tag_name, 'modpack.json')!.toString('utf8')) as ModpackManifest
    assert.equal(manifest.name, 'Pack A')
    assert.equal(manifest.version, '1')
    assert.equal(manifest.modCount, 3)
    assert.ok(manifest.modsSignature)
    assert.equal(manifest.disabledMods, undefined, 'champ facultatif absent quand il ne sert pas')

    assert.equal((await service.freshPlan()).view.actions.length, 0)
  })

  it('refuse de publier un plan périmé', async () => {
    const result = await service.publish('empreinte-perimee', noProgress, signal())
    assert.ok(!result.ok)
    assert.match(result.error, /a changé depuis l’aperçu/)
  })

  it('renvoie seulement modpack.json quand un mod est désactivé chez les joueurs', async () => {
    await service.updatePackSettings('Pack_A', {
      exclude: [],
      disabledMods: [{ addonId: 22, file: 'beta-2.0.jar', name: 'Beta' }],
      keepPlayerConfigs: false
    })
    const plan = (await service.freshPlan()).view
    assert.deepEqual(
      plan.actions.map((a) => a.kind),
      ['update']
    )
    assert.equal(plan.uploadBytes < 10_000, true, 'le zip ne repart pas')
    const result = await service.publish(plan.fingerprint, noProgress, signal())
    assert.ok(result.ok, result.ok ? '' : result.error)
    const tag = github.releases[0].tag_name
    const manifest = JSON.parse(github.file(tag, 'modpack.json')!.toString('utf8')) as ModpackManifest
    assert.deepEqual(manifest.disabledMods, ['beta-2.0.jar'])
  })

  it('range un zip déposé à la main comme version suivante', async () => {
    const dir = join(workspace, 'Pack_A')
    const [v1] = (await readdir(dir)).filter((f) => f.endsWith('-v1.zip'))
    const { copyFile } = await import('node:fs/promises')
    await copyFile(join(dir, v1), join(dir, 'export du jour.zip'))
    const plan = await service.rangerPlan()
    assert.equal(plan.total, 1)
    assert.equal(await service.applyRanger(), 1)
    assert.ok((await readdir(dir)).includes('Pack_A-v2.zip'))
  })

  it('supprime une version : son zip et sa release', async () => {
    const plan = (await service.freshPlan()).view
    assert.equal((await service.publish(plan.fingerprint, noProgress, signal())).ok, true)
    assert.equal(github.releases.length, 2)

    const result = await service.deleteVersion('Pack_A', 2)
    assert.ok(result.ok, result.ok ? '' : result.error)
    assert.equal(github.releases.length, 1)
    assert.ok(!(await readdir(join(workspace, 'Pack_A'))).includes('Pack_A-v2.zip'))
    // Le numéro reste pris : la prochaine version sera la v3.
    const overview = await service.overview()
    assert.equal(overview.packs[0].nextVersion, 3)
  })

  it('signale un zip qui n’est pas une instance CurseForge', async () => {
    await writeFile(join(workspace, 'Pack_A', 'pas-une-instance.zip'), 'pas un zip')
    const overview = await service.overview()
    const pending = overview.packs[0].pending.find((p) => p.fileName === 'pas-une-instance.zip')!
    assert.ok(pending.error)
    await rm(join(workspace, 'Pack_A', 'pas-une-instance.zip'))
  })
})
