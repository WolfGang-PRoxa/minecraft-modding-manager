import assert from 'node:assert/strict'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { Journal } from '../src/core/journal'
import { OperationLock } from '../src/core/lock'
import { tempDir } from './support/fixtures'

describe('verrou des opérations', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  before(async () => (root = await tempDir()))
  after(() => root.cleanup())

  it('refuse une deuxième opération et dit qui travaille', async () => {
    const file = join(root.dir, 'a.lock')
    const app = new OperationLock(file, 'l’application')
    const cli = new OperationLock(file, 'la ligne de commande')
    const release = await app.acquire('la publication')
    // Même processus : le message ne cite pas qui tient le verrou ; ici on simule un autre processus.
    const info = JSON.parse(await readFile(file, 'utf8')) as { pid: number }
    assert.equal(info.pid, process.pid)
    await assert.rejects(cli.acquire('le rangement'), /Patiente : la publication est en cours/)
    assert.equal(cli.currentSync()?.operation, 'la publication')
    await release()
    assert.equal(cli.currentSync(), null)
    const again = await cli.acquire('le rangement')
    await again()
  })

  it('ignore un verrou laissé par un processus disparu', async () => {
    const file = join(root.dir, 'b.lock')
    const startedAt = new Date().toISOString()
    await writeFile(file, JSON.stringify({ operation: 'la publication', holder: 'x', pid: 2 ** 22 + 12345, startedAt, token: 't' }))
    const lock = new OperationLock(file, 'la ligne de commande')
    assert.equal(lock.currentSync(), null)
    const release = await lock.acquire('le rangement')
    await release()
  })

  it('ne rend pas le verrou d’un autre', async () => {
    const file = join(root.dir, 'c.lock')
    const lock = new OperationLock(file, 'l’application')
    const release = await lock.acquire('la publication')
    const content = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    await writeFile(file, JSON.stringify({ ...content, token: 'autre' }))
    await release()
    assert.ok(lock.currentSync(), 'le verrou réécrit par un autre est resté')
  })
})

describe('journal', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  before(async () => (root = await tempDir()))
  after(() => root.cleanup())

  it('garde les opérations, la plus récente en premier', async () => {
    const journal = new Journal(join(root.dir, 'journal.jsonl'), 'la ligne de commande')
    await journal.append({ operation: 'le rangement', ok: true, detail: '1 zip renommé', durationMs: 3 })
    await journal.append({ operation: 'la publication', ok: false, error: 'GitHub ne répond plus.', durationMs: 9 })
    const entries = await journal.read()
    assert.deepEqual(
      entries.map((e) => [e.operation, e.ok, e.source]),
      [
        ['la publication', false, 'la ligne de commande'],
        ['le rangement', true, 'la ligne de commande']
      ]
    )
    assert.equal((await journal.read(1)).length, 1)
  })
})

describe('architecture', () => {
  async function sources(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => [])
    return entries.filter((e) => e.isFile() && /\.tsx?$/.test(e.name)).map((e) => join(e.parentPath, e.name))
  }

  it('le moteur et le code partagé n’importent pas Electron', async () => {
    const files = [...(await sources('src/core')), ...(await sources('src/shared')), ...(await sources('src/cli')), ...(await sources('src/mcp'))]
    assert.ok(files.length > 20)
    for (const file of files) {
      assert.doesNotMatch(await readFile(file, 'utf8'), /from ['"]electron['"]/, `${file} importe electron`)
    }
  })
})
