// Copie d'essai d'un profil, identité d'un profil, et remplacement du fichier d'un mod comme le ferait CurseForge.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { downloadCurseForgeFile, installedFileFrom, replaceAddonFile, type Download } from '../src/core/addonFiles'
import type { CfFile } from '../src/core/curseforgeApi'
import { setCurseForgeApiOverride } from '../src/core/curseforgeAuth'
import { writeCurseClientFile } from '../src/core/instanceIdentity'
import { createTrialCopy } from '../src/core/trialProfile'
import { startFakeCurseForge, type FakeCurseForge } from './support/fakeCurseForge'
import { makeInstance, tempDir } from './support/fixtures'

const download: Download = (file, destination) => downloadCurseForgeFile(file, destination, 'cle')
const readJson = async (file: string) => JSON.parse(await readFile(file, 'utf8')) as Record<string, any>

describe('copie d’essai et fichiers des mods', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let curseforge: FakeCurseForge
  let source: string

  before(async () => {
    curseforge = await startFakeCurseForge()
    setCurseForgeApiOverride(curseforge.url)
    root = await tempDir()
    source = await makeInstance(join(root.dir, 'Instances'), 'Mon Profil', {
      mods: [
        { file: 'alpha-1.0.jar', addonId: 11, name: 'Alpha' },
        { file: 'beta-1.0.jar', addonId: 22, name: 'Beta', disabled: true }
      ],
      files: { 'logs/latest.log': 'journal', 'saves/Monde/level.dat': 'monde' }
    })
    // Ce que CurseForge écrit dans un vrai profil : guid, chemins absolus, .curseclient.
    const instance = await readJson(join(source, 'minecraftinstance.json'))
    instance.guid = 'guid-origine'
    instance.installPath = `${source}\\`
    for (const addon of instance.installedAddons) {
      addon.gameInstanceID = 'guid-origine'
      addon.instanceID = `entree-${addon.addonID}`
      addon.modFolderPath = join(source, 'mods')
      addon.filePaths = [join(source, 'mods', addon.fileNameOnDisk)]
    }
    await writeFile(join(source, 'minecraftinstance.json'), JSON.stringify(instance))
    await writeCurseClientFile(source, 'guid-origine')
  })

  after(async () => {
    setCurseForgeApiOverride(null)
    await curseforge.close()
    await root.cleanup()
  })

  it('copie un profil avec sa propre identité, partout', async () => {
    const trial = await createTrialCopy(source, 'Mon Profil (essai)')
    const instance = await readJson(join(trial, 'minecraftinstance.json'))
    assert.notEqual(instance.guid, 'guid-origine')
    assert.equal(instance.name, 'Mon Profil (essai)')
    assert.equal(instance.installPath, `${trial}\\`)
    assert.equal(await readFile(join(trial, '.curseclient'), 'utf8'), instance.guid)
    for (const addon of instance.installedAddons) {
      assert.equal(addon.gameInstanceID, instance.guid)
      assert.notEqual(addon.instanceID, `entree-${addon.addonID}`)
      assert.ok(addon.modFolderPath.startsWith(trial) && addon.filePaths[0].startsWith(trial), 'chemins de la copie')
    }
    assert.deepEqual((await readdir(trial)).sort(), ['.curseclient', 'minecraftinstance.json', 'mods', 'saves'], 'sans les journaux')
    assert.equal(await readFile(join(source, '.curseclient'), 'utf8'), 'guid-origine', 'l’original n’a pas bougé')
    await assert.rejects(createTrialCopy(source, 'Mon Profil (essai)'), /existe déjà/)
  })

  it('traduit un fichier de l’API dans le format de CurseForge', () => {
    const api = {
      ...cfFile(501, 11, 'alpha-1.1.jar', Buffer.from('x')),
      modules: [{ name: 'META-INF', fingerprint: 7 }],
      fileFingerprint: 99,
      sortableGameVersions: [{ gameVersionName: 'Forge', gameVersion: '', gameVersionPadded: '0', gameVersionTypeId: 68441 }]
    }
    const installed = installedFileFrom(api, { projectStatus: 4, isCompatibleWithClient: true })
    assert.deepEqual(installed.hashes, [{ type: 1, value: api.hashes[0].value }])
    assert.deepEqual(installed.dependencies, [{ addonId: 900, type: 3 }])
    assert.deepEqual(installed.modules, [{ foldername: 'META-INF', fingerprint: 7, invalidFingerprint: false }])
    assert.equal(installed.packageFingerprint, 99)
    assert.deepEqual(installed.gameVersion, ['1.20.1', 'Forge'])
    assert.deepEqual(installed.sortableGameVersion, [{ gameVersion: '', gameVersionName: 'Forge', gameVersionTypeId: 68441 }])
    assert.equal(installed.isCompatibleWithClient, true)
  })

  it('remplace le fichier d’un mod, vérifié, et garde un mod désactivé désactivé', async () => {
    const trial = join(root.dir, 'Instances', 'Mon Profil (essai)')
    const instanceFile = join(trial, 'minecraftinstance.json')
    const instance = await readJson(instanceFile)
    const alpha = Buffer.from('nouvel alpha')
    const beta = Buffer.from('nouveau beta')
    curseforge.catalog.downloads[501] = alpha
    curseforge.catalog.downloads[502] = beta
    await replaceAddonFile(trial, instance, 11, 'mod', cfFile(501, 11, 'alpha-1.1.jar', alpha, curseforge.url) as never, download)
    await replaceAddonFile(trial, instance, 22, 'mod', cfFile(502, 22, 'beta-1.1.jar', beta, curseforge.url) as never, download)
    assert.deepEqual((await readdir(join(trial, 'mods'))).sort(), ['alpha-1.1.jar', 'beta-1.1.jar.disabled'])
    const [a, b] = instance.installedAddons
    assert.deepEqual([a.installedFile.id, a.fileNameOnDisk, a.filePaths[0]], [501, 'alpha-1.1.jar', join(trial, 'mods', 'alpha-1.1.jar')])
    assert.deepEqual([b.installedFile.fileName, b.fileNameOnDisk, b.isEnabled], ['beta-1.1.jar', 'beta-1.1.jar.disabled', false])
  })

  it('refuse un téléchargement abîmé et ne laisse rien derrière', async () => {
    const trial = join(root.dir, 'Instances', 'Mon Profil (essai)')
    const instance = await readJson(join(trial, 'minecraftinstance.json'))
    curseforge.catalog.downloads[503] = Buffer.from('contenu modifié')
    const file = { ...cfFile(503, 11, 'alpha-1.2.jar', Buffer.from('contenu attendu'), curseforge.url) }
    await assert.rejects(replaceAddonFile(trial, instance, 11, 'mod', file as never, download), /abîmé/)
    assert.deepEqual((await readdir(join(trial, 'mods'))).sort(), ['alpha-1.1.jar', 'beta-1.1.jar.disabled'])
  })
})

function cfFile(id: number, modId: number, fileName: string, content: Buffer, base = 'http://cdn'): CfFile & Record<string, unknown> {
  return {
    id,
    modId,
    displayName: fileName,
    fileName,
    releaseType: 1,
    fileDate: '2026-10-01T00:00:00Z',
    fileLength: content.length,
    downloadUrl: `${base}/files/${id}`,
    isAvailable: true,
    gameVersions: ['1.20.1', 'Forge'],
    hashes: [{ value: createHash('sha1').update(content).digest('hex'), algo: 1 }],
    dependencies: [{ modId: 900, relationType: 3 }]
  }
}
