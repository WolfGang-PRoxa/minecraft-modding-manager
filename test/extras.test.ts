// Bibliothèque : les mods, packs de ressources et shaders publiés, et leur ajout à un profil installé par l'application.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { contentReleaseFrom, groupContents, incompatibility } from '../src/shared/contentReleases'
import type { GhRelease } from '../src/shared/releases'
import type { ContentRelease, InstanceMarker } from '../src/shared/types'
import { carryOverExtras, installExtra, removeExtra, type ExtraDownload } from '../src/core/extras'
import { tempDir } from './support/fixtures'

const sha = (data: string) => createHash('sha256').update(data).digest('hex')

/** Contenu des fichiers « publiés », par adresse. */
const published = new Map<string, string>()
const download: ExtraDownload = async (url, destination, sha256) => {
  const data = published.get(url)
  if (data === undefined) throw new Error(`introuvable : ${url}`)
  if (sha(data) !== sha256) throw new Error('empreinte différente')
  await writeFile(destination, data)
}

function lmaRelease(version: string, published_at = '2026-10-20T00:00:00Z'): { release: GhRelease; manifest: unknown } {
  const name = `lma-26.3-${version}.jar`
  const data = `jar ${version}`
  const url = `https://example.test/${name}`
  published.set(url, data)
  return {
    release: {
      id: 1,
      tag_name: `mod-lma-v${version}-26.3`,
      name: `LMA ${version}-26.3`,
      body: `Notes ${version}`,
      draft: false,
      prerelease: false,
      published_at,
      created_at: published_at,
      html_url: 'https://example.test/release',
      upload_url: '',
      assets: [
        { id: 1, name, size: data.length, browser_download_url: url, updated_at: '' },
        { id: 2, name: 'content.json', size: 1, browser_download_url: 'https://example.test/content.json', updated_at: '' }
      ]
    },
    manifest: {
      schema: 1,
      type: 'mod',
      id: 'lma',
      name: 'LMA',
      version: `${version}-26.3`,
      description: 'Un mod',
      minecraftVersions: ['26.3'],
      loaders: ['fabric'],
      files: [{ name, size: data.length, sha256: sha(data), sha1: '', loaders: ['fabric'], minecraftVersions: ['26.3'] }],
      cover: null,
      coverSha256: null,
      author: 'o',
      createdAt: published_at
    }
  }
}

const releaseOf = (version: string, date?: string): ContentRelease => {
  const { release, manifest } = lmaRelease(version, date)
  return contentReleaseFrom(release, manifest)!
}

describe('contenus publiés', () => {
  it('lit une release de mod avec son content.json', () => {
    const r = releaseOf('1.2.0')
    assert.equal(r.kind, 'mod')
    assert.equal(r.version, '1.2.0-26.3')
    assert.equal(r.files[0].url, 'https://example.test/lma-26.3-1.2.0.jar')
    assert.equal(r.notes, 'Notes 1.2.0')
  })

  it('ignore une release dont content.json ne correspond pas à son tag, ou sans empreinte', () => {
    const { release, manifest } = lmaRelease('1.2.0')
    assert.equal(contentReleaseFrom(release, { ...(manifest as object), id: 'autre' }), null)
    const files = (manifest as { files: Array<Record<string, unknown>> }).files.map((f) => ({ ...f, sha256: '' }))
    assert.equal(contentReleaseFrom(release, { ...(manifest as object), files }), null)
    assert.equal(contentReleaseFrom({ ...release, tag_name: 'pack-lma-v1' }, manifest), null)
  })

  it('regroupe les versions, la plus récente d’abord', () => {
    const [item] = groupContents([releaseOf('1.1.0', '2026-10-14T00:00:00Z'), releaseOf('1.2.0', '2026-10-22T00:00:00Z')])
    assert.deepEqual(item.versions.map((v) => v.version), ['1.2.0-26.3', '1.1.0-26.3'])
    assert.equal(item.latest.version, '1.2.0-26.3')
  })

  it('dit ce qui empêche un fichier d’aller dans un profil', () => {
    const file = { loaders: ['fabric' as const], minecraftVersions: ['26.3'] }
    assert.equal(incompatibility('mod', file, { minecraftVersion: '26.3', modLoader: 'fabric-0.19.5-26.3' }), null)
    assert.equal(incompatibility('mod', file, { minecraftVersion: '26.3', modLoader: 'quilt-0.29.0' }), null, 'Quilt charge les mods Fabric')
    assert.match(incompatibility('mod', file, { minecraftVersion: '1.20.1', modLoader: 'fabric-0.16' })!, /pas 1\.20\.1/)
    assert.match(incompatibility('mod', file, { minecraftVersion: '26.3', modLoader: 'neoforge-21.1' })!, /pas neoforge/)
    assert.equal(incompatibility('resourcepack', { loaders: [], minecraftVersions: [] }, { minecraftVersion: '1.20.1', modLoader: null }), null)
  })
})

describe('ajouts dans un profil', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let profile: string
  const marker = (): Promise<InstanceMarker> => readFile(join(profile, '.modpack-manager.json'), 'utf8').then((t) => JSON.parse(t) as InstanceMarker)

  before(async () => {
    root = await tempDir()
    profile = join(root.dir, 'Instances', 'LMA-26.3')
    await mkdir(join(profile, 'mods'), { recursive: true })
    await writeFile(join(profile, 'mods', 'fabric-api.jar'), 'fourni par le modpack')
  })

  after(() => root.cleanup())

  it('refuse un profil qui n’a pas été installé par l’application', async () => {
    const r = releaseOf('1.1.0')
    await assert.rejects(() => installExtra(profile, r, r.files[0], download), /pas été installé par l’application/)
    await writeFile(join(profile, '.modpack-manager.json'), JSON.stringify({ id: 'lma-26-3', version: '18', tag: 'pack-lma-26-3-v18', installedAt: '', managedEntries: ['mods'] }))
  })

  it('ajoute un mod, puis le remplace par sa nouvelle version', async () => {
    const v1 = releaseOf('1.1.0')
    const extra = await installExtra(profile, v1, v1.files[0], download)
    assert.equal(extra.file, 'mods/lma-26.3-1.1.0.jar')
    await assert.rejects(() => installExtra(profile, v1, v1.files[0], download), /déjà dans ce profil/)

    const v2 = releaseOf('1.2.0')
    await installExtra(profile, v2, v2.files[0], download)
    assert.deepEqual((await readdir(join(profile, 'mods'))).sort(), ['fabric-api.jar', 'lma-26.3-1.2.0.jar'])
    assert.deepEqual((await marker()).extras!.map((e) => [e.id, e.version]), [['lma', '1.2.0-26.3']])
  })

  it('refuse un fichier déjà fourni par le modpack, et un fichier altéré', async () => {
    const r = releaseOf('1.3.0')
    await assert.rejects(() => installExtra(profile, r, { ...r.files[0], name: 'fabric-api.jar' }, download), /déjà dans ce profil/)
    await assert.rejects(() => installExtra(profile, r, { ...r.files[0], sha256: sha('autre chose') }, download), /empreinte/)
    assert.ok(!(await readdir(join(profile, 'mods'))).some((f) => f.endsWith('.part')))
  })

  it('garde les ajouts quand le modpack se met à jour, sauf ceux qu’il fournit lui-même', async () => {
    const newDir = join(root.dir, 'nouvelle-version')
    await mkdir(join(newDir, 'mods'), { recursive: true })
    const extras = (await marker()).extras!
    assert.deepEqual(await carryOverExtras(profile, newDir, extras, new Set()), extras)
    assert.deepEqual((await readdir(join(newDir, 'mods'))).sort(), ['lma-26.3-1.2.0.jar'])
    assert.deepEqual(await carryOverExtras(profile, join(root.dir, 'autre'), extras, new Set(['mods/lma-26.3-1.2.0.jar'])), [])
  })

  it('retire un ajout, même désactivé dans CurseForge', async () => {
    const { rename } = await import('node:fs/promises')
    await rename(join(profile, 'mods', 'lma-26.3-1.2.0.jar'), join(profile, 'mods', 'lma-26.3-1.2.0.jar.disabled'))
    await removeExtra(profile, 'mod', 'lma')
    assert.deepEqual(await readdir(join(profile, 'mods')), ['fabric-api.jar'])
    assert.deepEqual((await marker()).extras, [])
  })
})
