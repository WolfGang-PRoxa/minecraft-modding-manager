// Mise à jour d'un profil par une copie d'essai : appliquer à l'essai, puis reporter dans le profil d'origine.
import assert from 'node:assert/strict'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { CfFile, CfMod } from '../src/core/curseforgeApi'
import { applyToTrial, PROMOTE_WORK_DIR, promoteTrial, trialPathOf, type TrialSource } from '../src/core/trialUpdates'
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

describe('report d’un essai quand un fichier est verrouillé', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let instances: string
  const files = [file(101, 1, 'alpha-new.jar'), file(201, 2, 'beta-new.jar'), file(301, 3, 'gamma-new.jar')]
  const source: TrialSource = {
    getFiles: async (ids) => files.filter((f) => ids.includes(f.id)),
    getMods: async () => [],
    download: async (f, destination) => writeFile(destination, `contenu de ${f.fileName}`)
  }

  before(async () => {
    root = await tempDir()
    instances = join(root.dir, 'Instances')
  })
  after(() => root.cleanup())

  /** Un profil de trois mods et son essai qui les met tous à jour. */
  async function profileWithTrial(name: string): Promise<string> {
    const profile = await makeInstance(instances, name, {
      mods: [
        { file: 'alpha-old.jar', addonId: 1, name: 'Alpha' },
        { file: 'beta-old.jar', addonId: 2, name: 'Beta' },
        { file: 'gamma-old.jar', addonId: 3, name: 'Gamma' }
      ]
    })
    const instance = await readJson(join(profile, 'minecraftinstance.json'))
    instance.installedAddons.forEach((a: any, i: number) => (a.installedFile.id = [100, 200, 300][i]))
    await writeFile(join(profile, 'minecraftinstance.json'), JSON.stringify(instance))
    const plan: UpdatePlan = {
      profile: name,
      profilePath: profile,
      minecraftVersion: '1.20.1',
      modLoader: 'forge-47.4.0',
      channel: 'release',
      checked: 3,
      updates: [update(1, 'Alpha', 100, files[0]), update(2, 'Beta', 200, files[1]), update(3, 'Gamma', 300, files[2])],
      pinned: [],
      untracked: [],
      warnings: []
    }
    await applyToTrial(plan, source)
    return profile
  }

  /** Le profil tel que CurseForge le lit : chaque fichier du dossier mods et son entrée. */
  async function snapshot(profile: string) {
    const instance = await readJson(join(profile, 'minecraftinstance.json'))
    const mods: Record<string, string> = {}
    for (const name of await readdir(join(profile, 'mods'))) mods[name] = await readFile(join(profile, 'mods', name), 'utf8')
    const tracked = instance.installedAddons.map((a: any) => a.fileNameOnDisk).sort()
    return { mods, tracked, ids: instance.installedAddons.map((a: any) => a.installedFile.id) }
  }

  const busy = (path: string) => Object.assign(new Error(`EBUSY: resource busy or locked, rename '${path}'`), { code: 'EBUSY', path })

  it('annule tout, sans rien laisser derrière, si un fichier reste verrouillé', async () => {
    const profile = await profileWithTrial('Verrou')
    const before = await snapshot(profile)
    let moves = 0
    // Le 4e déplacement (en plein milieu des mods) échoue, comme un fichier tenu par CurseForge.
    const move = async (from: string, to: string) => {
      if (++moves === 4) throw busy(from)
      await rename(from, to)
    }
    await assert.rejects(promoteTrial(profile, { move }), /utilisé par un autre programme.*Verrou est resté comme avant/)
    assert.deepEqual(await snapshot(profile), before, 'profil inchangé')
    assert.deepEqual(await readdir(trialPathOf(profile)).then((n) => n.includes(PROMOTE_WORK_DIR)), false)

    // Le fichier libéré, le report réussit en entier.
    assert.deepEqual((await promoteTrial(profile)).sort(), ['Alpha', 'Beta', 'Gamma'])
    const after = await snapshot(profile)
    assert.deepEqual(Object.keys(after.mods).sort(), ['alpha-new.jar', 'beta-new.jar', 'gamma-new.jar'])
    assert.deepEqual(after.tracked, Object.keys(after.mods).sort(), 'chaque fichier suivi par CurseForge')
    assert.deepEqual(after.ids, [101, 201, 301])
  })

  it('défait au report suivant un report interrompu', async () => {
    const profile = await profileWithTrial('Interrompu')
    const before = await snapshot(profile)
    let moves = 0
    // Après 3 déplacements, plus rien ne bouge : le report ne peut même pas être défait (processus tué…).
    const move = async (from: string, to: string) => {
      if (++moves > 3) throw new Error('arrêt')
      await rename(from, to)
    }
    await assert.rejects(promoteTrial(profile, { move }), /n’a pas pu être défait/)
    assert.notDeepEqual(await snapshot(profile), before, 'profil à moitié mis à jour')

    assert.deepEqual((await promoteTrial(profile)).sort(), ['Alpha', 'Beta', 'Gamma'])
    const after = await snapshot(profile)
    assert.deepEqual(Object.keys(after.mods).sort(), ['alpha-new.jar', 'beta-new.jar', 'gamma-new.jar'])
    assert.deepEqual(after.tracked, Object.keys(after.mods).sort())
    assert.equal(after.mods['beta-new.jar'], 'contenu de beta-new.jar')
  })

  it('remplace un fichier laissé à la place du nouveau par une tentative précédente', async () => {
    const profile = await profileWithTrial('Reste')
    await writeFile(join(profile, 'mods', 'alpha-new.jar'), 'copie partielle')
    await promoteTrial(profile)
    const after = await snapshot(profile)
    assert.deepEqual(Object.keys(after.mods).sort(), ['alpha-new.jar', 'beta-new.jar', 'gamma-new.jar'])
    assert.equal(after.mods['alpha-new.jar'], 'contenu de alpha-new.jar')
    assert.deepEqual(after.tracked, Object.keys(after.mods).sort())
  })
})
