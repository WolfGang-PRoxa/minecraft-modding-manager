// Faux CurseForge pour les tests : l'API de lecture (/v1/…, clé `x-api-key`) et l'API de mise en ligne (/api/…,
// jeton `X-Api-Token`). Une seule clé et un seul jeton sont acceptés.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CfFile, CfMod } from '../../src/core/curseforgeApi'

export const VALID_API_KEY = 'cle-de-test'
export const VALID_UPLOAD_TOKEN = 'jeton-de-test'

/** Catalogue servi par le faux CurseForge (modifiable pendant un test). */
export interface FakeCatalog {
  mods: CfMod[]
  files: CfFile[]
  changelogs: Record<number, string>
  /** Contenu téléchargeable, par identifiant de fichier (adresse : `<url>/files/<id>`, ou `<url>/cdn/files/…`). */
  downloads: Record<number, Buffer>
  /** Fichiers reçus par l'API de mise en ligne. */
  uploads: Array<{ projectId: number; metadata: Record<string, unknown>; fileName: string; content: Buffer; id: number }>
}

export interface FakeCurseForge {
  /** À passer à setCurseForgeApiOverride. */
  url: string
  catalog: FakeCatalog
  close(): Promise<void>
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(chunks.length ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>) : {}))
    req.on('error', reject)
  })
}

export async function startFakeCurseForge(): Promise<FakeCurseForge> {
  const catalog: FakeCatalog = { mods: [], files: [], changelogs: {}, downloads: {}, uploads: [] }
  let nextFileId = 900_000
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path.startsWith('/v1/')) {
      if (req.headers['x-api-key'] !== VALID_API_KEY) return json(res, 403, {})
      if (path === '/v1/games/432') return json(res, 200, { data: { id: 432, name: 'Minecraft', slug: 'minecraft' } })
      if (req.method === 'POST' && path === '/v1/mods') {
        const ids = ((await readBody(req)).modIds as number[]) ?? []
        return json(res, 200, { data: catalog.mods.filter((m) => ids.includes(m.id)) })
      }
      if (req.method === 'POST' && path === '/v1/mods/files') {
        const ids = ((await readBody(req)).fileIds as number[]) ?? []
        return json(res, 200, { data: catalog.files.filter((f) => ids.includes(f.id)) })
      }
      if (path === '/v1/mods/search') {
        const query = new URL(req.url ?? '/', 'http://localhost').searchParams
        const found = catalog.mods.filter((m) => m.slug === query.get('slug') && String(m.classId) === (query.get('classId') ?? String(m.classId)))
        return json(res, 200, { data: found })
      }
      const projectFiles = /^\/v1\/mods\/(\d+)\/files$/.exec(path)
      if (projectFiles) {
        const list = catalog.files.filter((f) => f.modId === Number(projectFiles[1])).sort((a, b) => b.id - a.id)
        return json(res, 200, { data: list, pagination: { totalCount: list.length } })
      }
      const changelog = /^\/v1\/mods\/\d+\/files\/(\d+)\/changelog$/.exec(path)
      if (changelog) {
        const text = catalog.changelogs[Number(changelog[1])]
        return text === undefined ? json(res, 404, {}) : json(res, 200, { data: text })
      }
    }
    // Téléchargements : contenu des fichiers du catalogue (`downloads`), servi sans clé comme le CDN.
    const cdn = /^\/cdn\/files\/(\d+)\/(\d+)\//.exec(path)
    const download = cdn ? [path, String(Number(cdn[1]) * 1000 + Number(cdn[2]))] : /^\/files\/(\d+)$/.exec(path)
    if (download) {
      const data = catalog.downloads[Number(download[1])]
      if (!data) return json(res, 404, {})
      res.writeHead(200, { 'Content-Type': 'application/java-archive' })
      return void res.end(data)
    }
    if (path.startsWith('/api/')) {
      const token = req.headers['x-api-token']
      if (!token) return json(res, 401, { errorCode: 401, errorMessage: 'You must provide an API token.' })
      if (token !== VALID_UPLOAD_TOKEN) return json(res, 403, { errorCode: 403, errorMessage: 'Invalid API token provided.' })
      if (path === '/api/game/versions') {
        return json(res, 200, [
          { id: 1, gameVersionTypeID: 1, name: '1.20.1', slug: '1-20-1' },
          { id: 9990, gameVersionTypeID: 75125, name: '1.20.1', slug: '1-20-1' },
          { id: 7498, gameVersionTypeID: 68441, name: 'Forge', slug: 'forge' },
          { id: 7499, gameVersionTypeID: 68441, name: 'Fabric', slug: 'fabric' }
        ])
      }
      if (path === '/api/game/version-types') {
        return json(res, 200, [
          { id: 1, name: 'Bukkit', slug: 'bukkit' },
          { id: 75125, name: 'Minecraft 1.20', slug: 'minecraft-1-20' },
          { id: 68441, name: 'Modloader', slug: 'modloader' }
        ])
      }
      const upload = /^\/api\/projects\/(\d+)\/upload-file$/.exec(path)
      if (upload && req.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData()
        const file = form.get('file') as File
        const id = nextFileId++
        const metadata = JSON.parse(String(form.get('metadata'))) as Record<string, unknown>
        catalog.uploads.push({ projectId: Number(upload[1]), metadata, fileName: file.name, content: Buffer.from(await file.arrayBuffer()), id })
        catalog.files.push({ ...({ fileStatus: 3 } as object), id, modId: Number(upload[1]), displayName: String(metadata.displayName), fileName: file.name, releaseType: 1, fileDate: new Date().toISOString(), fileLength: file.size, downloadUrl: null, isAvailable: true, gameVersions: [], hashes: [], dependencies: [] } as never)
        return json(res, 200, { id })
      }
    }
    json(res, 404, { message: `Route inconnue du faux CurseForge : ${req.method} ${path}` })
  }
  const server = createServer((req, res) => void handle(req, res).catch((err: unknown) => json(res, 500, { message: String(err) })))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    catalog,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}
