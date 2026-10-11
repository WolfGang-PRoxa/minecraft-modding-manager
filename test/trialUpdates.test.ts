// Mise à jour d'un profil par une copie d'essai : appliquer à l'essai, puis reporter dans le profil d'origine.
import assert from 'node:assert/strict'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { CfFile, CfMod } from '../src/core/curseforgeApi'
import { applyToTrial, promoteTrial, trialPathOf, type TrialSource } from '../src/core/trialUpdates'
import type { UpdatePlan } from '../src/shared/studio'
import { makeInstance, tempDir } from './support/fixtures'

const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf8')) as Record<string, any>

function file(id: number, modId: number, fileName: string, downloadable = true): CfFile {
  return {
    id,
    modId,
    displayName: fileName,
    fileName,
    releaseType: 1,
    fileDate: '2026-10-01T00:00:00Z',
    fileLength: 10,
    downloadUrl: downloadable ? `https://cdn/files/${id}` : null,
    isAvailable: true,
    gameVersions: ['1.20.1', 'Forge'],
    hashes: [],
    dependencies: []
  }
}

const update = (projectId: number, name: string, from: number | null, to: CfFile) => ({
  projectId,
  name,
  kind: 'mod' as const,
  from: from === null ? null : { fileId: from, fileName: `${name.toLowerCase()}-old.jar`, date: null, releaseType: 1 },
  to: { fileId: to.id, fileName: to.fileName, date: to.fileDate, releaseType: 1 },
  requiredBy: from === null ? ['Alpha'] : [],
  url: null,
  downloadable: Boolean(to.downloadUrl)
})

describe('mises à jour par une copie d’essai', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let profile: string
  const files = [file(101, 1, 'alpha-new.jar'), file(201, 2, 'beta-new.jar'), file(301, 3, 'gamma-new.jar', false), file(901, 9, 'lib-new.jar')]
  const lib: CfMod = {
    id: 9,
    name: 'Lib',
    slug: 'lib',
    classId: 6,
    isAvailable: true,
    allowModDistribution: true,
    links: { websiteUrl: 'https://www.curseforge.com/minecraft/mc-mods/lib' },
    latestFilesIndexes: [],
    authors: [{ id: 5, name: 'auteur' }]
  }
  const source: TrialSource = {
    getFiles: async (ids) => files.filter((f) => ids.includes(f.id)),
    getMods: async (ids) => (ids.includes(9) ? [lib] : []),
    download: async (f, destination) => writeFile(destination, `contenu de ${f.fileName}`)
  }
  let plan: UpdatePlan

  before(async () => {
    root = await tempDir()
    profile = await makeInstance(join(root.dir, 'Instances'), 'Mon Profil', {
      mods: [
        { file: 'alpha-old.jar', addonId: 1, name: 'Alpha' },
        { file: 'beta-old.jar', addonId: 2, name: 'Beta', disabled: true },
        { file: 'gamma-old.jar', addonId: 3, name: 'Gamma' }
      ],
      files: { 'saves/Monde/level.dat': 'mon monde', 'config/alpha.toml': 'réglage du publieur' }
    })
    const instance = await readJson(join(profile, 'minecraftinstance.json'))
    instance.guid = 'guid-original'
    instance.installedAddons.forEach((a: any, i: number) => (a.installedFile.id = [100, 200, 300][i]))
    await writeFile(join(profile, 'minecraftinstance.json'), JSON.stringify(instance))
    plan = {
      profile: 'Mon Profil',
      profilePath: profile,
      minecraftVersion: '1.20.1',
      modLoader: 'forge-47.4.0',
      channel: 'release',
      checked: 3,
      updates: [update(1, 'Alpha', 100, files[0]), update(2, 'Beta', 200, files[1]), update(3, 'Gamma', 300, files[2]), update(9, 'Lib', null, files[3])],
      pinned: [],
      untracked: [],
      warnings: []
    }
  })

  after(() => root.cleanup())

  it('applique les mises à jour à l’essai, sans toucher l’original', async () => {
    const result = await applyToTrial(plan, source)
    assert.equal(result.trialPath, trialPathOf(profile))
    assert.deepEqual(result.applied.map((u) => u.name), ['Alpha', 'Beta', 'Lib'])
    assert.deepEqual(result.skipped.map((s) => [s.update.name, /CurseForge/.test(s.reason)]), [['Gamma', true]])
    assert.deepEqual((await readdir(join(result.trialPath, 'mods'))).sort(), ['alpha-new.jar', 'beta-new.jar.disabled', 'gamma-old.jar', 'lib-new.jar'])
    const trial = await readJson(join(result.trialPath, 'minecraftinstance.json'))
    const libEntry = trial.installedAddons.find((a: any) => a.addonID === 9)
    assert.deepEqual([libEntry.name, libEntry.gameInstanceID, libEntry.installedFile.id, libEntry.primaryAuthor], ['Lib', trial.guid, 901, 'auteur'])
    assert.deepEqual((await readdir(join(profile, 'mods'))).sort(), ['alpha-old.jar', 'beta-old.jar.disabled', 'gamma-old.jar'], 'original intact')
    await assert.rejects(applyToTrial(plan, source), /existe déjà/)
  })

  it('reporte l’essai dans l’original en gardant ses choix et ses données', async () => {
    const changed = await promoteTrial(profile)
    assert.deepEqual(changed.sort(), ['Alpha', 'Beta', 'Lib'])
    assert.deepEqual((await readdir(join(profile, 'mods'))).sort(), ['alpha-new.jar', 'beta-new.jar.disabled', 'gamma-old.jar', 'lib-new.jar'])
    const original = await readJson(join(profile, 'minecraftinstance.json'))
    assert.equal(original.guid, 'guid-original')
    const lib = original.installedAddons.find((a: any) => a.addonID === 9)
    assert.deepEqual([lib.gameInstanceID, lib.filePaths[0]], ['guid-original', join(profile, 'mods', 'lib-new.jar')])
    const beta = original.installedAddons.find((a: any) => a.addonID === 2)
    assert.deepEqual([beta.installedFile.id, beta.isEnabled, beta.fileNameOnDisk], [201, false, 'beta-new.jar.disabled'])
    assert.equal(await readFile(join(profile, 'saves', 'Monde', 'level.dat'), 'utf8'), 'mon monde')
    assert.equal(await readFile(join(profile, 'config', 'alpha.toml'), 'utf8'), 'réglage du publieur')
  })
})
