// La vue du publieur : profils CurseForge rangés par dossier, face à leurs modpacks.
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { listGroups, listProfiles } from '../src/core/profiles'
import { buildLibrary } from '../src/core/studio/library'
import { StudioService } from '../src/core/studio/service'
import type { ProfileView, PublisherLibrary } from '../src/shared/studio'
import { makeInstance, tempDir } from './support/fixtures'

const noProgress = () => {}
const signal = () => new AbortController().signal
const profileIn = (library: PublisherLibrary, name: string): ProfileView =>
  library.folders.flatMap((f) => f.profiles).find((p) => p.name === name)!

describe('vue du publieur', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let instances: string
  let workspace: string
  let groupsFile: string
  let service: StudioService

  before(async () => {
    root = await tempDir()
    instances = join(root.dir, 'Instances')
    workspace = join(root.dir, 'Modpacks')
    await mkdir(workspace)
    groupsFile = join(root.dir, 'groups.json')
    await writeFile(
      groupsFile,
      JSON.stringify([
        { id: 'g-pub', gameId: 432, name: 'Public ModPacks' },
        { id: 'g-tests', gameId: 432, name: 'Tests' },
        { id: 'g-wow', gameId: 1, name: 'Autre jeu' }
      ])
    )
    const mods = [
      { file: 'alpha-1.0.jar', addonId: 11, name: 'Alpha' },
      { file: 'beta-1.0.jar', addonId: 22, name: 'Beta' }
    ]
    await makeInstance(instances, 'Mon Pack', { mods })
    await makeInstance(instances, 'Essai', { mods: [{ file: 'gamma.jar' }] })
    await makeInstance(instances, 'ATM10', { mods: [{ file: 'atm.jar', addonId: 99 }] })
    // Rangement dans les dossiers de CurseForge, et un modpack installé depuis CurseForge.
    for (const [name, patch] of [
      ['Mon Pack', { groupId: 'g-pub', guid: 'guid-mon-pack' }],
      ['Essai', { groupId: 'g-tests', guid: 'guid-essai' }],
      ['ATM10', { guid: 'guid-atm', projectID: 925200 }]
    ] as const) {
      const file = join(instances, name, 'minecraftinstance.json')
      const { readFile } = await import('node:fs/promises')
      await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), ...patch }))
    }
    service = new StudioService({
      getWorkspaceDir: () => workspace,
      defaultWorkspaceDir: workspace,
      getAppSettings: async () => ({ role: 'publisher', repo: { owner: 'o', name: 'r' } }),
      getCredential: async () => null,
      getInstancesDir: async () => instances
    })
  })

  after(() => root.cleanup())

  it('lit les profils et les dossiers de CurseForge', async () => {
    const profiles = await listProfiles(instances)
    const atm = profiles.find((p) => p.name === 'ATM10')!
    assert.equal(atm.curseforgeProjectId, 925200)
    assert.equal(atm.guid, 'guid-atm')
    assert.equal(profiles.find((p) => p.name === 'Mon Pack')!.modCount, 2)
    assert.deepEqual(
      (await listGroups([join(root.dir, 'absent.json'), groupsFile])).map((g) => g.name),
      ['Public ModPacks', 'Tests'],
      'premier fichier trouvé, Minecraft seulement, ordre alphabétique'
    )
  })

  it('range les profils comme CurseForge et suit l’état du profil source', async () => {
    const groups = await listGroups([groupsFile])
    const library = async () => {
      const overview = await service.overview()
      return buildLibrary(overview.packs, await listProfiles(instances), groups, instances)
    }

    let view = await library()
    assert.deepEqual(
      view.folders.map((f) => [f.name, f.profiles.map((p) => p.name)]),
      [
        ['Public ModPacks', ['Mon Pack']],
        ['Tests', ['Essai']],
        ['Sans dossier', ['ATM10']]
      ]
    )
    assert.equal(profileIn(view, 'Mon Pack').state, 'unlinked')

    // Créer le modpack depuis le profil : v1, et le lien est enregistré.
    const { folder } = await service.createPackFromProfile('Mon Pack', join(instances, 'Mon Pack'), false, noProgress, signal())
    view = await library()
    let source = profileIn(view, 'Mon Pack')
    assert.deepEqual([source.pack?.folder, source.link, source.state, source.matchingVersion], [folder, 'saved', 'up-to-date', 1])

    // Le publieur ajoute un mod dans CurseForge : le profil a changé depuis la v1.
    await copyFile(join(instances, 'Mon Pack', 'mods', 'alpha-1.0.jar'), join(instances, 'Mon Pack', 'mods', 'delta-1.0.jar'))
    view = await library()
    assert.equal(profileIn(view, 'Mon Pack').state, 'changed')

    // La v2 le reprend ; si le publieur revient en arrière, le profil a les mods d'une version plus ancienne.
    await service.zipInstance(folder, join(instances, 'Mon Pack'), false, noProgress, signal())
    assert.equal(profileIn(await library(), 'Mon Pack').state, 'up-to-date')
    const { rm } = await import('node:fs/promises')
    await rm(join(instances, 'Mon Pack', 'mods', 'delta-1.0.jar'))
    source = profileIn(await library(), 'Mon Pack')
    assert.deepEqual([source.state, source.matchingVersion], ['older', 1])
  })

  it('devine le profil d’un modpack sans lien, et retire un lien', async () => {
    const created = await service.createPack('Essai')
    const view = buildLibrary((await service.overview()).packs, await listProfiles(instances), [], instances)
    const essai = profileIn(view, 'Essai')
    assert.deepEqual([essai.pack?.folder, essai.link, essai.state], [created, 'guessed', 'no-version'])

    await service.linkProfile('Mon_Pack', null)
    const after = (await service.overview()).packs.find((p) => p.folder === 'Mon_Pack')!
    assert.equal(after.profile, null)
  })
})
