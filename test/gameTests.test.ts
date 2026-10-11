// Lecture des métadonnées des mods et vérification d'un profil sans lancer le jeu.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { guessMajor } from '../src/core/gameTests/java'
import { parseToml, readModJar } from '../src/core/gameTests/modMetadata'
import { parseLoader, serverKey } from '../src/core/gameTests/serverInstall'
import { checkProfileFiles } from '../src/core/gameTests/staticChecks'
import { makeInstance, tempDir } from './support/fixtures'
import { fabricJar, forgeToml, makeJar } from './support/jars'

describe('métadonnées des mods', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  before(async () => (root = await tempDir()))
  after(() => root.cleanup())

  it('lit un mods.toml, chaînes sur plusieurs lignes comprises', () => {
    const tables = parseToml(forgeToml('alpha', [{ modId: 'forge', mandatory: true }, { modId: 'jei', mandatory: false }]))
    assert.equal(tables.mods[0].modId, 'alpha')
    assert.equal(tables.mods[0].description, 'Un mod\nsur plusieurs lignes')
    assert.deepEqual(tables['dependencies.alpha'].map((d) => [d.modId, d.mandatory]), [['forge', true], ['jei', false]])
  })

  it('lit un mod Fabric, ses mods embarqués et son côté', async () => {
    const inner = await fabricJar('fabric-api-base')
    const file = join(root.dir, 'api.jar')
    await writeFile(
      file,
      await fabricJar('fabric-api', { fabricloader: '*' }, { jars: [{ file: 'META-INF/jars/base.jar' }], provides: ['fabric'] }, {
        'META-INF/jars/base.jar': inner
      })
    )
    const meta = await readModJar(file)
    assert.equal(meta?.loader, 'fabric')
    assert.deepEqual(meta?.mods.map((m) => [m.id, m.side, m.requires]), [['fabric-api', 'both', ['fabricloader']]])
    assert.deepEqual(meta?.nested.map((m) => m.id).sort(), ['fabric', 'fabric-api-base'])

    const sodium = join(root.dir, 'sodium.jar')
    await writeFile(sodium, await fabricJar('sodium', {}, { environment: 'client' }))
    assert.equal((await readModJar(sodium))?.mods[0].side, 'client')
  })

  it('lit un jar multi-chargeurs selon le chargeur du profil, et reconnaît une bibliothèque', async () => {
    const file = join(root.dir, 'multi.jar')
    await writeFile(file, await makeJar({ 'fabric.mod.json': JSON.stringify({ id: 'multi', depends: { fabric: '*' } }), 'META-INF/mods.toml': forgeToml('multi') }))
    assert.equal((await readModJar(file, 'forge'))?.loader, 'forge')
    assert.equal((await readModJar(file, 'fabric'))?.loader, 'fabric')
    const lib = join(root.dir, 'kotlin.jar')
    await writeFile(lib, await makeJar({ 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nFMLModType: LANGPROVIDER\n' }))
    assert.equal((await readModJar(lib))?.library, true)
  })
})

describe('vérification d’un profil', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let profile: string

  before(async () => {
    root = await tempDir()
    profile = await makeInstance(join(root.dir, 'Instances'), 'Profil Forge', { loader: 'forge-47.4.18', mods: [] })
    await mkdir(join(profile, 'mods'), { recursive: true })
    const jar = (name: string, data: Buffer) => writeFile(join(profile, 'mods', name), data)
    await jar('alpha.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('alpha', [{ modId: 'forge', mandatory: true }, { modId: 'geckolib', mandatory: true }, { modId: 'jei', mandatory: false }]) }))
    await jar('caves-1.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('cave_dweller') }))
    await jar('caves-2.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('cave_dweller') }))
    await jar('neo.jar', await makeJar({ 'META-INF/neoforge.mods.toml': forgeToml('neo', [{ modId: 'beta', type: 'required' }]) }))
    await jar('beta.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('beta') }))
    await jar('fabric-only.jar', await fabricJar('fabriconly'))
    await jar('shader.jar', await makeJar({ 'META-INF/mods.toml': forgeToml('oculus') }))
    await jar('kotlin.jar', await makeJar({ 'META-INF/MANIFEST.MF': 'FMLModType: LANGPROVIDER\n' }))
    // CurseForge dit d'oculus qu'il ne sert que côté client.
    const instanceFile = join(profile, 'minecraftinstance.json')
    const instance = JSON.parse(await readFile(instanceFile, 'utf8'))
    instance.installedAddons = [{ addonID: 5, fileNameOnDisk: 'shader.jar', installedFile: { id: 1, gameVersion: ['1.20.1', 'Forge', 'Client'] } }]
    await writeFile(instanceFile, JSON.stringify(instance))
  })
  after(() => root.cleanup())

  it('trouve les doublons, les dépendances manquantes, le mauvais chargeur et les mods du client', async () => {
    const report = await checkProfileFiles(profile)
    assert.equal(report.jars, 8)
    const byMessage = (pattern: RegExp) => report.findings.find((f) => pattern.test(f.message))
    assert.deepEqual([byMessage(/cave_dweller/)?.severity, byMessage(/cave_dweller/)?.files], ['warning', ['caves-1.jar', 'caves-2.jar']])
    assert.deepEqual(byMessage(/geckolib/)?.files, ['alpha.jar'])
    assert.ok(!byMessage(/« jei »/), 'une dépendance facultative ne manque pas')
    assert.ok(!byMessage(/« beta »/), 'beta est présent')
    assert.deepEqual(byMessage(/faits pour Fabric/)?.files, ['fabric-only.jar'])
    assert.deepEqual(report.clientOnly, ['shader.jar'])
    assert.ok(!report.findings.some((f) => f.files.includes('kotlin.jar')), 'une bibliothèque n’est pas signalée')
  })
})

describe('serveur de test', () => {
  it('reconnaît le chargeur d’un profil et le Java attendu', () => {
    assert.deepEqual(parseLoader('forge-47.4.18', '1.20.1'), { kind: 'forge', version: '47.4.18', minecraftVersion: '1.20.1' })
    assert.deepEqual(parseLoader('fabric-0.19.5-26.3', '26.3'), { kind: 'fabric', version: '0.19.5', minecraftVersion: '26.3' })
    assert.equal(serverKey(parseLoader('neoforge-21.1.215', '1.21.1')!), 'neoforge-1.21.1-21.1.215')
    assert.equal(parseLoader('quilt-0.26', '1.20.1'), null)
    assert.deepEqual(['1.16.5', '1.18.2', '1.20.1', '1.20.6', '1.21.1', '26.3'].map(guessMajor), [8, 17, 17, 21, 21, 25])
  })
})
