// Recherche des mises à jour d'un profil, sur un faux catalogue CurseForge.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { htmlToText } from '../src/core/commands/updates'
import { CurseForgeClient, type CfFile, type CfMod } from '../src/core/curseforgeApi'
import { setCurseForgeApiOverride } from '../src/core/curseforgeAuth'
import { bestFileIndex, checkUpdates, loaderType } from '../src/core/updates'
import { startFakeCurseForge, VALID_API_KEY, type FakeCurseForge } from './support/fakeCurseForge'
import { tempDir } from './support/fixtures'

const FORGE = 1
const FABRIC = 4

function mod(id: number, name: string, indexes: Array<[string, number, number | null, number]>, classId = 6): CfMod {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    classId,
    isAvailable: true,
    allowModDistribution: true,
    links: { websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/${name.toLowerCase()}` },
    latestFilesIndexes: indexes.map(([gameVersion, fileId, modLoader, releaseType]) => ({
      gameVersion,
      fileId,
      filename: `${name}-${fileId}.jar`,
      releaseType,
      modLoader
    }))
  }
}

function file(id: number, modId: number, name: string, dependencies: number[] = [], releaseType = 1): CfFile {
  return {
    id,
    modId,
    displayName: name,
    fileName: name,
    releaseType,
    fileDate: '2026-10-01T00:00:00Z',
    fileLength: 1000,
    downloadUrl: `https://edge.forgecdn.net/files/${id}/${name}`,
    isAvailable: true,
    gameVersions: ['1.20.1', 'Forge'],
    hashes: [{ value: 'abc', algo: 1 }],
    dependencies: dependencies.map((modId) => ({ modId, relationType: 3 }))
  }
}

const addon = (addonID: number, name: string, fileId: number, fileName: string, extra: Record<string, unknown> = {}) => ({
  addonID,
  name,
  categoryClassID: 6,
  isEnabled: true,
  fileNameOnDisk: fileName,
  installedFile: { id: fileId, fileName, fileNameOnDisk: fileName, releaseType: 1, gameVersion: ['1.20.1', 'Forge'] },
  ...extra
})

describe('recherche des mises à jour', () => {
  let curseforge: FakeCurseForge
  let root: { dir: string; cleanup: () => Promise<void> }
  let profile: string
  const client = new CurseForgeClient(VALID_API_KEY)

  before(async () => {
    curseforge = await startFakeCurseForge()
    setCurseForgeApiOverride(curseforge.url)
    root = await tempDir()
    profile = join(root.dir, 'Mon Profil')
    await mkdir(join(profile, 'mods'), { recursive: true })
    for (const jar of ['alpha-100.jar', 'beta-200.jar', 'local.jar']) await writeFile(join(profile, 'mods', jar), jar)
    await writeFile(
      join(profile, 'minecraftinstance.json'),
      JSON.stringify({
        gameVersion: '1.20.1',
        baseModLoader: { name: 'forge-47.4.0' },
        installedAddons: [
          addon(1, 'Alpha', 100, 'alpha-100.jar'),
          addon(2, 'Beta', 200, 'beta-200.jar'),
          addon(3, 'BSL Shaders', 300, 'BSL-300.zip', {
            categoryClassID: 6552,
            installedFile: { id: 300, fileName: 'BSL-300.zip', releaseType: 1, gameVersion: ['1.17.1', '1.16.5'] }
          }),
          addon(4, 'Disparu', 400, 'gone-400.jar')
        ]
      })
    )
    curseforge.catalog.mods.push(
      mod(1, 'Alpha', [
        ['1.20.1', 101, FORGE, 1],
        ['1.20.1', 105, FORGE, 2],
        ['1.21.1', 150, FORGE, 1],
        ['1.20.1', 110, FABRIC, 1]
      ]),
      mod(2, 'Beta', [['1.20.1', 200, FORGE, 1]]),
      mod(3, 'BSL Shaders', [['1.16.5', 310, null, 1]], 6552),
      { ...mod(4, 'Disparu', []), isAvailable: false },
      mod(900, 'Lib', [['1.20.1', 901, FORGE, 1]])
    )
    curseforge.catalog.files.push(
      file(101, 1, 'alpha-101.jar', [900]),
      file(105, 1, 'alpha-105-beta.jar', [900], 2),
      file(310, 3, 'BSL-310.zip'),
      file(901, 900, 'lib-901.jar')
    )
    curseforge.catalog.changelogs[101] = '<p>Correctifs&nbsp;:</p><ul><li>plus de crash</li></ul>'
  })

  after(async () => {
    setCurseForgeApiOverride(null)
    await curseforge.close()
    await root.cleanup()
  })

  it('reconnaît le chargeur d’un profil', () => {
    assert.equal(loaderType('neoforge-21.1.215'), 6)
    assert.equal(loaderType('forge-47.4.0'), 1)
    assert.equal(loaderType('fabric-0.19.5-26.3'), 4)
    assert.equal(loaderType(null), null)
  })

  it('choisit le dernier fichier pour la même version de Minecraft et le même chargeur', () => {
    const alpha = mod(1, 'Alpha', [
      ['1.20.1', 101, FORGE, 1],
      ['1.20.1', 105, FORGE, 2],
      ['1.20.1', 110, FABRIC, 1]
    ])
    const asMod = { kind: 'mod' as const, gameVersions: ['1.20.1'] }
    assert.equal(bestFileIndex(alpha, asMod, '1.20.1', FORGE, 'release')?.fileId, 101)
    assert.equal(bestFileIndex(alpha, asMod, '1.20.1', FORGE, 'beta')?.fileId, 105)
    assert.equal(bestFileIndex(alpha, asMod, '1.20.1', 5, 'release')?.fileId, 110, 'Quilt accepte les mods Fabric')
    assert.equal(bestFileIndex(alpha, asMod, '1.21.1', FORGE, 'release'), null)
  })

  it('propose les mises à jour, les dépendances manquantes, et prévient de ce qu’il ne peut pas faire', async () => {
    const plan = await checkUpdates(profile, client)
    assert.equal(plan.minecraftVersion, '1.20.1')
    assert.equal(plan.checked, 4)
    assert.deepEqual(
      plan.updates.map((u) => [u.name, u.from?.fileId ?? null, u.to.fileId, u.requiredBy]),
      [
        ['Alpha', 100, 101, []],
        ['BSL Shaders', 300, 310, []],
        ['Lib', null, 901, ['Alpha']]
      ]
    )
    assert.ok(plan.updates.every((u) => u.downloadable))
    assert.deepEqual(plan.untracked, ['local.jar'])
    assert.match(plan.warnings.join('\n'), /Disparu n’est plus disponible/)
  })

  it('accepte les bêtas sur demande, et laisse les projets figés', async () => {
    const plan = await checkUpdates(profile, client, { channel: 'beta', pinned: [3] })
    assert.equal(plan.updates.find((u) => u.name === 'Alpha')?.to.fileId, 105)
    assert.ok(!plan.updates.some((u) => u.name === 'BSL Shaders'))
    assert.deepEqual(plan.pinned, ['BSL Shaders'])
  })

  it('lit les notes de version en texte', async () => {
    assert.equal(htmlToText(await client.getChangelog(1, 101)), 'Correctifs :\n- plus de crash')
  })

  it('dit quand la clé est refusée', async () => {
    await assert.rejects(new CurseForgeClient('mauvaise').getMods([1]), /refuse la clé d’API/)
  })
})
