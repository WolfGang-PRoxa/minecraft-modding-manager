// Vérifications automatiques : intervalles réglables, modpacks mis à jour d'eux-mêmes, flux des releases.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  feedSignature,
  formatEvery,
  hasIncompleteRelease,
  nearestCheckStep,
  normalizeCheckMinutes,
  packsToAutoUpdate,
  CHECK_MINUTE_STEPS
} from '../src/shared/autoUpdate'
import type { GhRelease } from '../src/shared/releases'
import type { InstalledModpack, Modpack, ModpackVersion } from '../src/shared/types'

function version(id: string, v: string, publishedAt: string, archiveSha256: string | null = 'abc'): ModpackVersion {
  return { id, version: v, tag: `pack-${id}-v${v}`, name: id, publishedAt, archiveSha256 } as ModpackVersion
}

function installed(id: string, v: string, installedAt: string): InstalledModpack {
  return { id, version: v, tag: `pack-${id}-v${v}`, installedAt, managedEntries: [], extras: [], instanceName: id, instancePath: `/i/${id}` }
}

const pack = (latest: ModpackVersion): Modpack => ({ id: latest.id, latest, versions: [latest] })

describe('intervalles des vérifications', () => {
  it('ramène un réglage entre 1 minute et 6 heures', () => {
    assert.equal(normalizeCheckMinutes(0, 5), 1)
    assert.equal(normalizeCheckMinutes(1000, 5), 360)
    assert.equal(normalizeCheckMinutes(7.4, 5), 7)
    assert.equal(normalizeCheckMinutes('10', 5), 5)
    assert.equal(normalizeCheckMinutes(undefined, 10), 10)
  })

  it('le curseur va de 1 minute à 6 heures et retrouve les valeurs par défaut', () => {
    assert.equal(CHECK_MINUTE_STEPS[0], 1)
    assert.equal(CHECK_MINUTE_STEPS.at(-1), 360)
    assert.equal(CHECK_MINUTE_STEPS[nearestCheckStep(5)], 5)
    assert.equal(CHECK_MINUTE_STEPS[nearestCheckStep(10)], 10)
    assert.equal(CHECK_MINUTE_STEPS[nearestCheckStep(7)], 5)
  })

  it('dit l’intervalle en français', () => {
    assert.equal(formatEvery(1), 'chaque minute')
    assert.equal(formatEvery(5), 'toutes les 5 minutes')
    assert.equal(formatEvery(60), 'toutes les heures')
    assert.equal(formatEvery(90), 'toutes les 1 h 30')
    assert.equal(formatEvery(360), 'toutes les 6 heures')
  })
})

describe('modpacks mis à jour d’eux-mêmes', () => {
  it('installe la dernière version, plus récente et publiée après l’installation', () => {
    const latest = version('aventure', '3', '2026-11-20T10:00:00Z')
    const found = packsToAutoUpdate([pack(latest)], [installed('aventure', '2', '2026-11-01T10:00:00Z')])
    assert.deepEqual(found, [latest])
  })

  it('laisse un modpack à jour, ou ramené exprès à une version précédente', () => {
    const latest = version('aventure', '3', '2026-11-20T10:00:00Z')
    assert.deepEqual(packsToAutoUpdate([pack(latest)], [installed('aventure', '3', '2026-11-21T10:00:00Z')]), [])
    // La v2 a été réinstallée après la sortie de la v3 : le joueur l'a choisie.
    assert.deepEqual(packsToAutoUpdate([pack(latest)], [installed('aventure', '2', '2026-11-21T10:00:00Z')]), [])
  })

  it('ignore une version sans empreinte et un modpack absent du dépôt', () => {
    const unsigned = version('aventure', '3', '2026-11-20T10:00:00Z', null)
    assert.deepEqual(packsToAutoUpdate([pack(unsigned)], [installed('aventure', '2', '2026-11-01T10:00:00Z')]), [])
    assert.deepEqual(packsToAutoUpdate([], [installed('aventure', '2', '2026-11-01T10:00:00Z')]), [])
  })
})

describe('flux des releases', () => {
  const feed = (entries: string) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><id>x</id>${entries}</feed>`
  const entry = (tag: string, updated: string) =>
    `<entry><id>tag:github.com,2008:Repository/1/${tag}</id><updated>${updated}</updated><title>${tag}</title></entry>`

  it('change quand une release est publiée ou modifiée', () => {
    const before = feedSignature(feed(entry('pack-a-v1', '2026-11-01T00:00:00Z')))
    const added = feedSignature(feed(entry('pack-a-v2', '2026-11-02T00:00:00Z') + entry('pack-a-v1', '2026-11-01T00:00:00Z')))
    const edited = feedSignature(feed(entry('pack-a-v1', '2026-11-03T00:00:00Z')))
    assert.ok(before)
    assert.notEqual(before, added)
    assert.notEqual(before, edited)
    assert.equal(before, feedSignature(feed(entry('pack-a-v1', '2026-11-01T00:00:00Z'))))
  })

  it('refuse ce qui n’est pas un flux (page d’erreur)', () => {
    assert.equal(feedSignature('<html><body>Too many requests</body></html>'), null)
    assert.equal(feedSignature(feed('')), '')
  })
})

describe('releases encore en cours d’envoi', () => {
  const now = Date.parse('2026-11-21T12:00:00Z')
  const release = (tag: string, assets: Array<{ name: string; state?: string }>, at = '2026-11-21T11:50:00Z'): GhRelease =>
    ({ tag_name: tag, draft: false, published_at: at, created_at: at, assets }) as GhRelease

  it('repère une release de l’application sans installeur, ou un fichier pas encore envoyé', () => {
    assert.equal(hasIncompleteRelease([release('app-v2.6.0', [])], 'app-v', now), true)
    assert.equal(hasIncompleteRelease([release('app-v2.6.0', [{ name: 'notes.txt' }])], 'app-v', now), true)
    assert.equal(hasIncompleteRelease([release('pack-a-v2', [{ name: 'a-2.zip', state: 'starter' }])], 'app-v', now), true)
  })

  it('une release complète, ou ancienne, ne l’est pas', () => {
    assert.equal(hasIncompleteRelease([release('app-v2.6.0', [{ name: 'Setup.exe', state: 'uploaded' }])], 'app-v', now), false)
    assert.equal(hasIncompleteRelease([release('app-v2.0.0', [], '2026-11-01T00:00:00Z')], 'app-v', now), false)
  })
})
