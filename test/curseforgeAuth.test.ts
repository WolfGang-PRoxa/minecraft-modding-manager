// Clé de l'API et jeton d'auteur CurseForge : vérifiés avant d'être enregistrés, chiffrés, retirables.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { curseForgeAuthStatus, curseForgeSecret, saveCurseForgeSecret, setCurseForgeApiOverride } from '../src/core/curseforgeAuth'
import { useSettingsFile } from '../src/core/settings'
import { startFakeCurseForge, VALID_API_KEY, VALID_UPLOAD_TOKEN, type FakeCurseForge } from './support/fakeCurseForge'
import { tempDir } from './support/fixtures'

describe('compte CurseForge', () => {
  let curseforge: FakeCurseForge
  let root: { dir: string; cleanup: () => Promise<void> }

  before(async () => {
    curseforge = await startFakeCurseForge()
    setCurseForgeApiOverride(curseforge.url)
    root = await tempDir()
    useSettingsFile(join(root.dir, 'settings.json'))
    delete process.env.CURSEFORGE_API_KEY
    delete process.env.CURSEFORGE_UPLOAD_TOKEN
  })

  after(async () => {
    setCurseForgeApiOverride(null)
    delete process.env.CURSEFORGE_API_KEY
    await curseforge.close()
    await root.cleanup()
  })

  it('refuse d’enregistrer un secret que CurseForge refuse', async () => {
    await assert.rejects(saveCurseForgeSecret('apiKey', 'mauvaise-cle'), /refuse cette clé/)
    await assert.rejects(saveCurseForgeSecret('uploadToken', 'mauvais-jeton'), /refuse ce jeton/)
    assert.deepEqual(await curseForgeAuthStatus(), {
      apiKey: { source: null, valid: null, error: null },
      uploadToken: { source: null, valid: null, error: null }
    })
  })

  it('enregistre des secrets acceptés, chiffrés, et les retire', async () => {
    await saveCurseForgeSecret('apiKey', `  ${VALID_API_KEY}  `)
    await saveCurseForgeSecret('uploadToken', VALID_UPLOAD_TOKEN)
    const stored = await readFile(join(root.dir, 'curseforge-auth.json'), 'utf8')
    assert.ok(!stored.includes(VALID_API_KEY) && !stored.includes(VALID_UPLOAD_TOKEN), 'le fichier ne contient rien en clair')
    assert.deepEqual(await curseForgeSecret('apiKey'), { value: VALID_API_KEY, source: 'saved' })
    const status = await curseForgeAuthStatus()
    assert.deepEqual([status.apiKey.valid, status.uploadToken.valid], [true, true])

    await saveCurseForgeSecret('apiKey', null)
    assert.equal(await curseForgeSecret('apiKey'), null)
    assert.equal((await curseForgeSecret('uploadToken'))?.source, 'saved')
  })

  it('prend une variable d’environnement à défaut, et dit si elle est refusée', async () => {
    process.env.CURSEFORGE_API_KEY = 'cle-perimee'
    const status = await curseForgeAuthStatus()
    assert.deepEqual([status.apiKey.source, status.apiKey.valid], ['env', false])
  })
})
