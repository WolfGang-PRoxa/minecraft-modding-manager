// Mises à jour automatiques, de bout en bout sur un faux CurseForge et un faux GitHub : passage, essai prêt, validation
// et publication, échec des tests, abandon, publication automatique. Le test du serveur et la fermeture de CurseForge
// sont remplacés (ils lanceraient Java et fermeraient le vrai CurseForge).
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { CurseForgeClient, type CfFile } from '../src/core/curseforgeApi'
import { setCurseForgeApiOverride } from '../src/core/curseforgeAuth'
import { setGitHubApiOverride } from '../src/core/githubEnv'
import { discardPending, finishPending, maintenanceStatus, runMaintenance, type MaintenanceOptions } from '../src/core/maintenance/pipeline'
import { dueAt, isDue } from '../src/core/maintenance/schedule'
import { readMaintenanceState } from '../src/core/maintenance/state'
import { maintenanceLock } from '../src/core/operations'
import { useSettingsFile } from '../src/core/settings'
import { StudioService } from '../src/core/studio/service'
import { promoteTrial, trialPathOf } from '../src/core/trialUpdates'
import { DEFAULT_PACK_UPDATES, type ServerTestReport } from '../src/shared/studio'
import { startFakeCurseForge, VALID_API_KEY, type FakeCurseForge } from './support/fakeCurseForge'
import { startFakeGitHub, type FakeGitHub } from './support/fakeGitHub'
import { makeInstance, tempDir } from './support/fixtures'

/** Le service, sans Java ni CurseForge réel : le serveur « démarre » selon `serverStarts`. */
class TestService extends StudioService {
  serverStarts = true

  override async testServer(profilePath: string): Promise<ServerTestReport> {
    return {
      profile: 'essai',
      profilePath,
      startedAt: new Date().toISOString(),
      durationMs: 1,
      outcome: this.serverStarts ? 'started' : 'crashed',
      message: this.serverStarts ? 'Le serveur a démarré.' : 'Le serveur a planté : Alpha',
      minecraftVersion: '1.20.1',
      modLoader: 'forge',
      clientOnly: [],
      crashReport: null,
      logTail: []
    } as ServerTestReport
  }

  override async promoteTrial(profilePath: string): Promise<string[]> {
    const changed = await promoteTrial(profilePath)
    await rm(trialPathOf(profilePath), { recursive: true, force: true })
    return changed
  }
}

describe('mises à jour automatiques', () => {
  let curseforge: FakeCurseForge
  let github: FakeGitHub
  let root: { dir: string; cleanup: () => Promise<void> }
  let profile: string
  let service: TestService
  let options: MaintenanceOptions
  let nextFile = 1101

  /** Publie sur le faux CurseForge un fichier plus récent d'Alpha. */
  function releaseAlpha(): CfFile {
    const id = nextFile++
    const file: CfFile = {
      id,
      modId: 11,
      displayName: `alpha-${id}.jar`,
      fileName: `alpha-${id}.jar`,
      releaseType: 1,
      fileDate: '2026-10-01T00:00:00Z',
      fileLength: 5,
      downloadUrl: `${curseforge.url}/files/${id}`,
      isAvailable: true,
      gameVersions: ['1.20.1', 'Forge'],
      hashes: [],
      dependencies: []
    }
    curseforge.catalog.files.push(file)
    curseforge.catalog.downloads[id] = Buffer.from(`alpha ${id}`)
    curseforge.catalog.mods[0].latestFilesIndexes = [{ gameVersion: '1.20.1', fileId: id, filename: file.fileName, releaseType: 1, modLoader: 1 }]
    return file
  }

  const status = async () => (await maintenanceStatus(service, options.lock, null)).packs[0]

  before(async () => {
    curseforge = await startFakeCurseForge()
    setCurseForgeApiOverride(curseforge.url)
    github = await startFakeGitHub()
    setGitHubApiOverride(github.apiBase)
    root = await tempDir()
    useSettingsFile(join(root.dir, 'Réglages', 'settings.json'))
    const workspace = join(root.dir, 'Modpacks')
    await mkdir(workspace)
    profile = await makeInstance(join(root.dir, 'Instances'), 'Mon Pack', { mods: [{ file: 'alpha-1100.jar', addonId: 11, name: 'Alpha' }] })
    const instanceFile = join(profile, 'minecraftinstance.json')
    const instance = JSON.parse(await readFile(instanceFile, 'utf8'))
    instance.guid = 'guid-mon-pack'
    Object.assign(instance.installedAddons[0], { categoryClassID: 6 })
    Object.assign(instance.installedAddons[0].installedFile, { id: 1100, releaseType: 1, gameVersion: ['1.20.1', 'Forge'] })
    await writeFile(instanceFile, JSON.stringify(instance))
    curseforge.catalog.mods.push({
      id: 11,
      name: 'Alpha',
      slug: 'alpha',
      classId: 6,
      isAvailable: true,
      allowModDistribution: true,
      links: { websiteUrl: 'https://www.curseforge.com/minecraft/mc-mods/alpha' },
      latestFilesIndexes: [],
      authors: [{ id: 5, name: 'auteur' }]
    })

    service = new TestService({
      getWorkspaceDir: () => workspace,
      defaultWorkspaceDir: workspace,
      getAppSettings: async () => ({ role: 'publisher', repo: { owner: 'o', name: 'r' } }),
      getCredential: async () => ({ token: 'jeton', source: 'env' }),
      getInstancesDir: async () => join(root.dir, 'Instances'),
      getCurseForgeClient: async () => new CurseForgeClient(VALID_API_KEY),
      trashItem: (path) => rm(path, { recursive: true, force: true })
    })
    options = { service, lock: maintenanceLock('les tests') }
    await service.createPackFromProfile('Mon Pack', profile, false, () => {}, new AbortController().signal)
  })

  after(async () => {
    setCurseForgeApiOverride(null)
    setGitHubApiOverride(null)
    await curseforge.close()
    await github.close()
    await root.cleanup()
  })

  it('calcule le tour de chaque modpack', () => {
    const weekly = { ...DEFAULT_PACK_UPDATES, frequency: 'weekly' as const }
    const now = new Date('2026-10-20T04:00:00Z')
    assert.equal(isDue(weekly, null, now), true)
    assert.equal(isDue(weekly, '2026-10-13T04:05:00Z', now), true, 'quelques minutes d’avance ne font pas sauter un jour')
    assert.equal(isDue(weekly, '2026-10-15T04:00:00Z', now), false)
    assert.equal(isDue(DEFAULT_PACK_UPDATES, null, now), false, 'à la demande : jamais seul')
    assert.equal(dueAt({ ...weekly, frequency: 'monthly' }, '2026-10-01T00:00:00Z')?.toISOString(), '2026-10-31T00:00:00.000Z')
  })

  it('enregistre les réglages seulement s’ils servent', async () => {
    const packFile = join(root.dir, 'Modpacks', 'Mon_Pack', 'pack.json')
    assert.equal(JSON.parse(await readFile(packFile, 'utf8')).updates, undefined)
    const updates = await service.updatePackUpdates('Mon_Pack', { frequency: 'weekly' })
    assert.deepEqual(updates, { ...DEFAULT_PACK_UPDATES, frequency: 'weekly' })
    assert.deepEqual(JSON.parse(await readFile(packFile, 'utf8')).updates, updates)
  })

  it('rien à faire : le modpack est à jour', async () => {
    const [record] = await runMaintenance({ due: true }, options)
    assert.equal(record.outcome, 'up-to-date')
    assert.deepEqual(await runMaintenance({ due: true }, options), [], 'son tour ne revient que dans une semaine')
  })

  it('une mise à jour testée attend d’être validée', async () => {
    releaseAlpha()
    const [record] = await runMaintenance({ folders: ['Mon_Pack'] }, options)
    assert.equal(record.outcome, 'ready', record.message)
    assert.deepEqual(record.changes, ['Alpha : alpha-1100.jar → alpha-1101.jar'])
    assert.equal(record.trialPath, trialPathOf(profile))
    const [again] = await runMaintenance({ folders: ['Mon_Pack'] }, options)
    assert.equal(again.outcome, 'skipped')
    assert.equal((await status()).last?.outcome, 'ready', 'un passage remis à plus tard ne fait pas oublier l’essai')
  })

  it('valider crée la version suivante, avec ses notes, et la publie', async () => {
    const record = await finishPending((await service.overview()).packs[0], true, options)
    assert.equal(record.outcome, 'published', record.message)
    assert.equal(record.version, 2)
    const pack = (await service.overview()).packs[0]
    assert.match(pack.versions[0].notes, /Alpha : alpha-1100\.jar → alpha-1101\.jar/)
    assert.ok(github.releases.some((r) => r.tag_name === 'pack-mon-pack-v2'))
    assert.ok(github.releases.some((r) => r.tag_name === 'pack-mon-pack-v1'), 'la v1 part avec : rien n’est retiré')
    const [next] = await runMaintenance({ folders: ['Mon_Pack'] }, options)
    assert.equal(next.outcome, 'up-to-date', 'le profil source a reçu la mise à jour')
  })

  it('un essai qui échoue aux tests reste à regarder, puis s’abandonne', async () => {
    releaseAlpha()
    service.serverStarts = false
    const [record] = await runMaintenance({ folders: ['Mon_Pack'] }, options)
    assert.equal(record.outcome, 'failed')
    assert.match(record.message, /Test du serveur : Le serveur a planté/)
    const discarded = await discardPending((await service.overview()).packs[0], options)
    assert.equal(discarded.message, 'Essai abandonné.')
    assert.equal((await readMaintenanceState())['mon-pack'].last?.trialPath, null)
    service.serverStarts = true
  })

  it('publie seul quand le modpack le permet', async () => {
    await service.updatePackUpdates('Mon_Pack', { autoPublish: true })
    const [record] = await runMaintenance({ folders: ['Mon_Pack'] }, options)
    assert.equal(record.outcome, 'published', record.message)
    assert.equal(record.version, 3)
    assert.ok(github.releases.some((r) => r.tag_name === 'pack-mon-pack-v3'))
  })

  it('un mod figé n’est plus mis à jour', async () => {
    releaseAlpha()
    await service.updatePackUpdates('Mon_Pack', { pinned: [{ projectId: 11, name: 'Alpha' }] })
    const [record] = await runMaintenance({ folders: ['Mon_Pack'] }, options)
    assert.equal(record.outcome, 'up-to-date')
  })

  it('un seul passage à la fois', async () => {
    const release = await maintenanceLock('un autre passage').acquire('les mises à jour automatiques')
    try {
      await assert.rejects(runMaintenance({}, options), /Patiente/)
    } finally {
      await release()
    }
  })
})
