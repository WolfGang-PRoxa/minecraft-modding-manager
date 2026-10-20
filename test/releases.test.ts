import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { modpackVersionFromRelease, sha256FromDigest, type GhAsset, type GhRelease } from '../src/shared/releases'
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
