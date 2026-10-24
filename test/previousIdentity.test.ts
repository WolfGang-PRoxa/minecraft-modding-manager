// Reprise des identités d'avant la 2.0.0 (« Modpack Manager », « Modpack Downloader ») : dossiers des données,
// marqueur des profils installés, nom du dépôt. Dans l'application installée seulement ; en développement, l'ancien nom est lu sans rien
// déplacer (l'application installée, peut-être encore ancienne, se sert des mêmes fichiers).
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, afterEach, before, describe, it } from 'node:test'
import {
  currentRepoName,
  enablePreviousIdentityMigration,
  migrateDataDir,
  migrateLocalDataDir,
  readInstanceMarker
} from '../src/core/previousIdentity'
import { APP_NAME, APP_REPO, INSTANCE_MARKER_FILE } from '../src/shared/config'
import { PREVIOUS_IDENTITIES, PREVIOUS_PRODUCT } from '../src/shared/previousIdentity'
import { tempDir } from './support/fixtures'

describe('reprise de l’ancienne identité', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let n = 0
  const fresh = async () => {
    const dir = join(root.dir, `cas-${n++}`)
    await mkdir(dir, { recursive: true })
    return dir
  }
  before(async () => (root = await tempDir()))
  after(() => root.cleanup())
  afterEach(() => enablePreviousIdentityMigration(false))

  for (const identity of PREVIOUS_IDENTITIES) {
    it(`déplace le dossier des données « ${identity.dataDir} » sous le nouveau nom, sans rien écraser`, async () => {
      enablePreviousIdentityMigration(true)
      const appData = await fresh()
      const previous = join(appData, identity.dataDir)
      await mkdir(join(previous, 'Local Storage'), { recursive: true })
      await writeFile(join(previous, 'settings.json'), '{"role":"publisher"}')
      await writeFile(join(previous, 'github-auth.json'), '{"secret":"chiffré"}')
      const current = migrateDataDir(appData)
      assert.equal(current, join(appData, APP_NAME))
      assert.equal(await readFile(join(current, 'settings.json'), 'utf8'), '{"role":"publisher"}')
      assert.ok(existsSync(join(current, 'github-auth.json')) && existsSync(join(current, 'Local Storage')))
      assert.ok(!existsSync(previous))
      assert.equal(migrateDataDir(appData), current, 'une seule fois')

      // Un dossier au nouveau nom existe déjà, sans réglages : ce qui manque y est rangé, rien n'est écrasé.
      const other = await fresh()
      await mkdir(join(other, identity.dataDir), { recursive: true })
      await writeFile(join(other, identity.dataDir, 'settings.json'), '{"role":"receiver"}')
      await writeFile(join(other, identity.dataDir, 'journal.jsonl'), 'ancien')
      await mkdir(join(other, APP_NAME), { recursive: true })
      await writeFile(join(other, APP_NAME, 'journal.jsonl'), 'nouveau')
      assert.equal(migrateDataDir(other), join(other, APP_NAME))
      assert.equal(await readFile(join(other, APP_NAME, 'settings.json'), 'utf8'), '{"role":"receiver"}')
      assert.equal(await readFile(join(other, APP_NAME, 'journal.jsonl'), 'utf8'), 'nouveau')
    })
  }

  it('reprend le dossier de l’identité la plus récente quand plusieurs restent', async () => {
    enablePreviousIdentityMigration(true)
    const appData = await fresh()
    for (const [n, identity] of PREVIOUS_IDENTITIES.entries()) {
      await mkdir(join(appData, identity.dataDir), { recursive: true })
      await writeFile(join(appData, identity.dataDir, 'settings.json'), `{"n":${n}}`)
    }
    assert.equal(await readFile(join(migrateDataDir(appData), 'settings.json'), 'utf8'), '{"n":0}')
  })

  it('en développement, lit l’ancien dossier sans le déplacer', async () => {
    const appData = await fresh()
    const [latest] = PREVIOUS_IDENTITIES
    await mkdir(join(appData, latest.dataDir), { recursive: true })
    await writeFile(join(appData, latest.dataDir, 'settings.json'), '{}')
    assert.equal(migrateDataDir(appData), join(appData, latest.dataDir))
    assert.ok(existsSync(join(appData, latest.dataDir, 'settings.json')))
    assert.equal(migrateDataDir(await fresh()).endsWith(APP_NAME), true, 'sans ancien dossier : le nouveau')
  })

  it('déplace les données locales (tests) sous le nouveau nom', async () => {
    const local = await fresh()
    const previous = join(local, PREVIOUS_PRODUCT.localDataDir)
    await mkdir(join(previous, 'test-reports'), { recursive: true })
    await writeFile(join(previous, 'test-reports', 'profil.json'), '{}')
    assert.equal(migrateLocalDataDir(local), previous, 'en développement, l’ancien dossier est lu tel quel')

    enablePreviousIdentityMigration(true)
    assert.equal(migrateLocalDataDir(local), join(local, APP_NAME))
    assert.ok(existsSync(join(local, APP_NAME, 'test-reports', 'profil.json')) && !existsSync(previous))
    const empty = await fresh()
    assert.equal(migrateLocalDataDir(empty), join(empty, APP_NAME), 'sans ancien dossier : le nouveau')
  })

  it('renomme le marqueur d’un profil installé en le lisant (application installée seulement)', async () => {
    for (const { instanceMarker } of PREVIOUS_IDENTITIES) {
      const dev = await fresh()
      await writeFile(join(dev, instanceMarker), '{"id":"lma","version":"3"}')
      assert.deepEqual(await readInstanceMarker(dev), { id: 'lma', version: '3' })
      assert.ok(existsSync(join(dev, instanceMarker)), 'en développement, rien n’est renommé')

      enablePreviousIdentityMigration(true)
      const profile = await fresh()
      await writeFile(join(profile, instanceMarker), '{"id":"lma","version":"3"}')
      assert.deepEqual(await readInstanceMarker(profile), { id: 'lma', version: '3' })
      assert.ok(existsSync(join(profile, INSTANCE_MARKER_FILE)) && !existsSync(join(profile, instanceMarker)))
      assert.deepEqual(await readInstanceMarker(profile), { id: 'lma', version: '3' })
      enablePreviousIdentityMigration(false)
    }
    assert.equal(await readInstanceMarker(await fresh()), null)
  })

  it('le dépôt de l’application sous un ancien nom devient le dépôt actuel', () => {
    assert.equal(APP_REPO.name, 'minecraft-modding-manager')
    assert.equal(currentRepoName('WolfGang-PRoxa', 'minecraft-modpack-manager', APP_REPO), 'minecraft-modding-manager')
    assert.equal(currentRepoName('WolfGang-PRoxa', 'minecraft-modpack-downloader', APP_REPO), 'minecraft-modding-manager')
    assert.equal(currentRepoName('wolfgang-proxa', 'Minecraft-Modpack-Downloader', APP_REPO), 'minecraft-modding-manager')
    assert.equal(currentRepoName('quelquun', 'minecraft-modpack-manager', APP_REPO), 'minecraft-modpack-manager')
    assert.equal(currentRepoName('WolfGang-PRoxa', 'autre', APP_REPO), 'autre')
  })
})
