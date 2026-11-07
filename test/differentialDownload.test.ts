import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { gzipSync } from 'node:zlib'
import { downloadDifferential, parseBlockMap, planDifferential, type BlockMap } from '../src/core/differentialDownload'
import { tempDir } from './support/fixtures'

// Les blockmaps sont écrits par le code d'electron-builder lui-même, comme ceux publiés par la CI.
const require = createRequire(import.meta.url)
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap') as {
  buildBlockMap: (file: string, format: 'gzip', output: string) => Promise<unknown>
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')

/** Sert `files` avec les requêtes Range (ou en les ignorant), et compte les requêtes. */
function rangeServer(files: Record<string, Buffer>, options: { ignoreRange?: boolean } = {}) {
  const stats = { requests: 0, bytes: 0 }
  const server = createServer((req, res) => {
    const data = files[req.url ?? '']
    if (!data) return res.writeHead(404).end()
    stats.requests++
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
    if (!range || options.ignoreRange) {
      stats.bytes += data.length
      return res.writeHead(200, { 'Content-Length': data.length }).end(data)
    }
    const [start, end] = [Number(range[1]), Number(range[2])]
    const part = data.subarray(start, end + 1)
    stats.bytes += part.length
    res.writeHead(206, { 'Content-Length': part.length, 'Content-Range': `bytes ${start}-${end}/${data.length}` })
    res.end(part)
  })
  return { server, stats }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('mise à jour différentielle', () => {
  let root: { dir: string; cleanup: () => Promise<void> }
  let oldFile: string
  let newData: Buffer
  let oldMap: BlockMap
  let newMap: BlockMap

  before(async () => {
    root = await tempDir()
    // Ancien installeur : 6 Mo aléatoires. Le nouveau : un passage changé, un passage inséré (tout ce qui suit est
    // décalé), la fin modifiée.
    const old = randomBytes(6 * 1024 * 1024)
    newData = Buffer.concat([
      old.subarray(0, 1_000_000),
      randomBytes(50_000),
      old.subarray(1_050_000, 3_000_000),
      randomBytes(120_000),
      old.subarray(3_000_000, 6_000_000),
      randomBytes(10_000)
    ])
    oldFile = join(root.dir, 'old.exe')
    const newFile = join(root.dir, 'new.exe')
    await writeFile(oldFile, old)
    await writeFile(newFile, newData)
    await buildBlockMap(oldFile, 'gzip', `${oldFile}.blockmap`)
    await buildBlockMap(newFile, 'gzip', `${newFile}.blockmap`)
    oldMap = parseBlockMap(await readFile(`${oldFile}.blockmap`))
    newMap = parseBlockMap(await readFile(`${newFile}.blockmap`))
  })
  after(() => root.cleanup())

  it('ne télécharge que les blocs changés et reconstitue le nouvel installeur', async () => {
    const plan = planDifferential(oldMap, newMap)
    assert.equal(plan.size, newData.length)
    assert.equal(plan.baseSize, 6 * 1024 * 1024)
    assert.ok(plan.downloadSize >= 180_000, `${plan.downloadSize}`)
    assert.ok(plan.downloadSize < 1024 * 1024, `trop téléchargé : ${plan.downloadSize}`)

    const { server, stats } = rangeServer({ '/new.exe': newData })
    const base = await listen(server)
    try {
      const destination = join(root.dir, 'assemble.exe')
      const progress: number[] = []
      const result = await downloadDifferential({
        baseFile: oldFile,
        url: `${base}/new.exe`,
        destination,
        plan,
        userAgent: 'test',
        onProgress: ({ done, total }) => {
          assert.equal(total, plan.downloadSize)
          progress.push(done)
        }
      })
      assert.equal(result.sha256, sha256(newData))
      assert.equal(result.size, newData.length)
      assert.deepEqual(await readFile(destination), newData)
      assert.equal(progress.at(-1), plan.downloadSize)
      assert.equal(stats.bytes, plan.downloadSize)
      assert.equal(stats.requests, plan.operations.filter((op) => op.kind === 'download').length)
      assert.ok(stats.requests <= 4, `${stats.requests} requêtes`)
    } finally {
      server.close()
    }
  })

  it('échoue si le serveur ignore les plages, sans laisser de fichier', async () => {
    const plan = planDifferential(oldMap, newMap)
    const { server } = rangeServer({ '/new.exe': newData }, { ignoreRange: true })
    const base = await listen(server)
    const destination = join(root.dir, 'refuse.exe')
    try {
      await assert.rejects(
        downloadDifferential({ baseFile: oldFile, url: `${base}/new.exe`, destination, plan, userAgent: 'test' }),
        /HTTP 200/
      )
      await assert.rejects(readFile(destination))
      await assert.rejects(readFile(`${destination}.part`))
    } finally {
      server.close()
    }
  })

  it('refuse un fichier de base qui ne correspond pas à son blockmap', async () => {
    const plan = planDifferential(oldMap, newMap)
    const other = join(root.dir, 'other.exe')
    await writeFile(other, randomBytes(1000))
    await assert.rejects(
      downloadDifferential({ baseFile: other, url: 'http://127.0.0.1:1/x', destination: join(root.dir, 'x.exe'), plan, userAgent: 'test' }),
      /ne correspond pas/
    )
  })

  it('télécharge une petite recopie coincée entre deux téléchargements', () => {
    const map = (checksums: string[], sizes: number[]): BlockMap => ({
      version: '2',
      files: [{ name: 'file', offset: 0, checksums, sizes }]
    })
    const old = map(['a', 'b', 'c'], [100_000, 20_000, 1_000_000])
    const fresh = map(['x', 'b', 'y', 'c'], [30_000, 20_000, 40_000, 1_000_000])
    const plan = planDifferential(old, fresh)
    assert.deepEqual(plan.operations, [
      { kind: 'download', start: 0, end: 90_000 },
      { kind: 'copy', start: 120_000, end: 1_120_000 }
    ])
    assert.equal(plan.downloadSize, 90_000)
  })

  it('refuse un blockmap illisible ou mal formé', () => {
    assert.throws(() => parseBlockMap(Buffer.from('pas du gzip')), /illisible/)
    assert.throws(() => parseBlockMap(gzipSync(JSON.stringify({ version: '2', files: [] }))), /invalide/)
    const bad = { version: '2', files: [{ name: 'file', offset: 0, checksums: ['a'], sizes: [1, 2] }] }
    assert.throws(() => parseBlockMap(gzipSync(JSON.stringify(bad))), /invalide/)
  })
})
