// Zip d'une version : limite de 2 Go seulement pour les modpacks publiés sur GitHub, données du joueur laissées de côté.
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { githubSizeError, MAX_ASSET_SIZE } from '../src/core/studio/analyze'
import { zipInstance } from '../src/core/studio/archive'
import { openZip, readEntries } from '../src/core/zip'
import { makeInstance, tempDir } from './support/fixtures'

describe('zip d’une version', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let profile: string

  before(async () => {
    root = await tempDir()
    profile = await makeInstance(join(root.dir, 'Instances'), 'Gros Pack', {
      files: {
        'config/voicechat/voicechat-server.properties': 'port=24454',
        'config/voicechat/voicechat-client.properties': 'microphone=Micro du publieur',
        'Distant_Horizons_server_data/serveur/DistantHorizons.sqlite': 'x'.repeat(4096),
        'essential/microsoft_accounts.json': '{}'
      }
    })
  })
  after(() => root.cleanup())

  it('n’applique la limite de GitHub qu’aux modpacks publiés sur GitHub', () => {
    assert.match(githubSizeError(MAX_ASSET_SIZE + 1, true) ?? '', /2 Go/)
    assert.equal(githubSizeError(MAX_ASSET_SIZE + 1, false), null)
    assert.equal(githubSizeError(MAX_ASSET_SIZE, true), null)
  })

  it('refuse un zip trop lourd seulement si une taille maximale est donnée', async () => {
    const tooSmall = join(root.dir, 'limite.zip')
    await assert.rejects(zipInstance(profile, tooSmall, { includeSaves: false, exclude: [], maxSize: 10 }), /limite de GitHub/)
    assert.deepEqual(await readdir(root.dir).then((names) => names.filter((n) => n.startsWith('limite'))), [], 'rien laissé derrière')

    const free = join(root.dir, 'libre.zip')
    await zipInstance(profile, free, { includeSaves: false, exclude: [] })
    const zip = await openZip(free)
    try {
      const names = (await readEntries(zip)).map((e) => e.fileName)
      assert.ok(names.includes('config/voicechat/voicechat-server.properties'))
      assert.deepEqual(names.filter((n) => /Distant_Horizons|essential\/|voicechat-client/.test(n)), [], 'données du joueur absentes')
    } finally {
      zip.close()
    }
  })
})
