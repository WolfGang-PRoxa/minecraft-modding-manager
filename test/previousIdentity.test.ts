// Reprise de l'identité d'avant la 1.9.0 (« Modpack Downloader ») : dossier des données, marqueur des profils
// installés, nom du dépôt. Dans l'application installée seulement ; en développement, l'ancien nom est lu sans rien
// déplacer (l'application installée, peut-être encore ancienne, se sert des mêmes fichiers).
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, afterEach, before, describe, it } from 'node:test'
import { currentRepoName, enablePreviousIdentityMigration, migrateDataDir, readInstanceMarker } from '../src/core/previousIdentity'
import { APP_REPO, INSTANCE_MARKER_FILE } from '../src/shared/config'
import { PREVIOUS_IDENTITY } from '../src/shared/previousIdentity'
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

  it('déplace le dossier des données sous le nouveau nom, sans rien écraser', async () => {
    enablePreviousIdentityMigration(true)
    const appData = await fresh()
    const previous = join(appData, PREVIOUS_IDENTITY.dataDir)
    await mkdir(join(previous, 'Local Storage'), { recursive: true })
    await writeFile(join(previous, 'settings.json'), '{"role":"publisher"}')
    await writeFile(join(previous, 'github-auth.json'), '{"secret":"chiffré"}')
    const current = migrateDataDir(appData)
    assert.equal(current, join(appData, 'Modpack Manager'))
    assert.equal(await readFile(join(current, 'settings.json'), 'utf8'), '{"role":"publisher"}')
    assert.ok(existsSync(join(current, 'github-auth.json')) && existsSync(join(current, 'Local Storage')))
    assert.ok(!existsSync(previous))
    assert.equal(migrateDataDir(appData), current, 'une seule fois')

    // Un dossier au nouveau nom existe déjà, sans réglages : ce qui manque y est rangé, rien n'est écrasé.
    const other = await fresh()
    await mkdir(join(other, PREVIOUS_IDENTITY.dataDir), { recursive: true })
    await writeFile(join(other, PREVIOUS_IDENTITY.dataDir, 'settings.json'), '{"role":"receiver"}')
    await writeFile(join(other, PREVIOUS_IDENTITY.dataDir, 'journal.jsonl'), 'ancien')
    await mkdir(join(other, 'Modpack Manager'), { recursive: true })
    await writeFile(join(other, 'Modpack Manager', 'journal.jsonl'), 'nouveau')
    assert.equal(migrateDataDir(other), join(other, 'Modpack Manager'))
    assert.equal(await readFile(join(other, 'Modpack Manager', 'settings.json'), 'utf8'), '{"role":"receiver"}')
    assert.equal(await readFile(join(other, 'Modpack Manager', 'journal.jsonl'), 'utf8'), 'nouveau')
  })

  it('en développement, lit l’ancien dossier sans le déplacer', async () => {
    const appData = await fresh()
    await mkdir(join(appData, PREVIOUS_IDENTITY.dataDir), { recursive: true })
    await writeFile(join(appData, PREVIOUS_IDENTITY.dataDir, 'settings.json'), '{}')
    assert.equal(migrateDataDir(appData), join(appData, PREVIOUS_IDENTITY.dataDir))
    assert.ok(existsSync(join(appData, PREVIOUS_IDENTITY.dataDir, 'settings.json')))
    assert.equal(migrateDataDir(await fresh()).endsWith('Modpack Manager'), true, 'sans ancien dossier : le nouveau')
  })

  it('renomme le marqueur d’un profil installé en le lisant (application installée seulement)', async () => {
    const dev = await fresh()
    await writeFile(join(dev, PREVIOUS_IDENTITY.instanceMarker), '{"id":"lma","version":"3"}')
    assert.deepEqual(await readInstanceMarker(dev), { id: 'lma', version: '3' })
    assert.ok(existsSync(join(dev, PREVIOUS_IDENTITY.instanceMarker)), 'en développement, rien n’est renommé')

    enablePreviousIdentityMigration(true)
    const profile = await fresh()
    await writeFile(join(profile, PREVIOUS_IDENTITY.instanceMarker), '{"id":"lma","version":"3"}')
    assert.deepEqual(await readInstanceMarker(profile), { id: 'lma', version: '3' })
    assert.ok(existsSync(join(profile, INSTANCE_MARKER_FILE)) && !existsSync(join(profile, PREVIOUS_IDENTITY.instanceMarker)))
    assert.deepEqual(await readInstanceMarker(profile), { id: 'lma', version: '3' })
    assert.equal(await readInstanceMarker(await fresh()), null)
  })

  it('le dépôt de l’application sous son ancien nom devient le dépôt actuel', () => {
    assert.equal(currentRepoName('WolfGang-PRoxa', 'minecraft-modpack-downloader', APP_REPO), 'minecraft-modpack-manager')
    assert.equal(currentRepoName('wolfgang-proxa', 'Minecraft-Modpack-Downloader', APP_REPO), 'minecraft-modpack-manager')
    assert.equal(currentRepoName('quelquun', 'minecraft-modpack-downloader', APP_REPO), 'minecraft-modpack-downloader')
    assert.equal(currentRepoName('WolfGang-PRoxa', 'autre', APP_REPO), 'autre')
  })
})
