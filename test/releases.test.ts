import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupByRelease, modpackVersionFromRelease, releaseVersion, sha256FromDigest, type GhAsset, type GhRelease } from '../src/shared/releases'
import type { ModpackManifest } from '../src/shared/types'

const HASH = 'ab'.repeat(32)

const asset = (name: string, digest?: string): GhAsset => ({
  id: 1,
  name,
  size: 10,
  browser_download_url: `https://example.test/${name}`,
  updated_at: '2026-10-01T00:00:00Z',
  digest
})

const release = (assets: GhAsset[]): GhRelease => ({
  id: 1,
  tag_name: 'pack-alpha-v2',
  name: 'Alpha v2',
  body: '',
  draft: false,
  prerelease: false,
  published_at: '2026-10-01T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
  html_url: 'https://example.test/release',
  upload_url: '',
  assets
})

describe('empreinte d’une version de modpack', () => {
  it('lit le digest de GitHub', () => {
    assert.equal(sha256FromDigest(`sha256:${HASH.toUpperCase()}`), HASH)
    assert.equal(sha256FromDigest('md5:abc'), null)
    assert.equal(sha256FromDigest(undefined), null)
  })

  it('prend celle de modpack.json, sinon celle que GitHub calcule pour le zip', () => {
    const fromManifest = modpackVersionFromRelease(release([asset('alpha-2.zip', `sha256:${'cd'.repeat(32)}`)]), {
      archiveSha256: HASH
    } as ModpackManifest)
    assert.equal(fromManifest?.archiveSha256, HASH)

    const fromGitHub = modpackVersionFromRelease(release([asset('alpha-2.zip', `sha256:${HASH}`)]), null)
    assert.equal(fromGitHub?.archiveSha256, HASH)
  })

  it('reste sans empreinte quand aucune n’est connue : l’installation sera refusée', () => {
    assert.equal(modpackVersionFromRelease(release([asset('alpha-2.zip')]), null)?.archiveSha256, null)
  })
})

describe('versions de publication', () => {
  it('retire les métadonnées de build (après « + »)', () => {
    assert.equal(releaseVersion('1.0.0+26.3-fabric'), '1.0.0')
    assert.equal(releaseVersion('1.0.0'), '1.0.0')
    assert.equal(releaseVersion('1.2.0-26.3'), '1.2.0-26.3')
    assert.equal(releaseVersion('+bizarre'), '+bizarre')
  })

  it('regroupe les versions qui ne diffèrent que par ce qui suit « + », dans l’ordre reçu', () => {
    const versions = ['1.1.0+26.3-fabric', '1.0.0+26.3-fabric', '1.0.0+1.21.5-forge', '1.0.0', '0.9.0-26.3'].map((version) => ({ version }))
    assert.deepEqual(
      groupByRelease(versions).map((g) => [g.version, g.members.map((m) => m.version)]),
      [
        ['1.1.0', ['1.1.0+26.3-fabric']],
        ['1.0.0', ['1.0.0+26.3-fabric', '1.0.0+1.21.5-forge', '1.0.0']],
        ['0.9.0-26.3', ['0.9.0-26.3']]
      ]
    )
  })
})
