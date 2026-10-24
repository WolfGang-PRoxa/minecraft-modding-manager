// Faux Hangar pour les tests : authentification par clé d'API (jeton de session), projets, versions, envoi d'une
// version en multipart (partie versionUpload en JSON, puis les fichiers).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { HangarProject, HangarVersion } from '../../src/core/hangar'

export const VALID_HANGAR_KEY = 'cle-hangar-de-test'
/** Jeton de session : un faux JWT dont la charge donne le compte (« sub »). */
const SESSION = `e30.${Buffer.from(JSON.stringify({ sub: 'WolfGang' })).toString('base64url')}.signature`

export interface FakeHangar {
  url: string
  projects: HangarProject[]
  versions: Array<HangarVersion & { project: string }>
  uploads: Array<{ project: string; versionUpload: Record<string, unknown>; files: Array<{ name: string; size: number }> }>
  close(): Promise<void>
}

export async function startFakeHangar(): Promise<FakeHangar> {
  const projects: HangarProject[] = []
  const versions: FakeHangar['versions'] = []
  const uploads: FakeHangar['uploads'] = []
  let next = 1
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    if (path === '/api/v1/authenticate' && req.method === 'POST') {
      return url.searchParams.get('apiKey') === VALID_HANGAR_KEY ? json(res, 200, { token: SESSION, expiresIn: 3_600_000 }) : json(res, 401, { message: 'Api key missing or invalid' })
    }
    if (req.headers.authorization !== `HangarAuth ${SESSION}`) return json(res, 401, { message: 'Api session missing, invalid or expired' })
    const project = /^\/api\/v1\/projects\/([^/]+)(\/versions|\/upload)?$/.exec(path)
    if (!project) return json(res, 404, { message: `Route inconnue du faux Hangar : ${req.method} ${path}` })
    const slug = decodeURIComponent(project[1])
    const found = projects.find((p) => p.namespace.slug.toLowerCase() === slug.toLowerCase())
    if (!found) return json(res, 404, { message: 'Not found' })
    if (!project[2]) return json(res, 200, found)
    if (project[2] === '/versions') {
      const list = versions.filter((v) => v.project === found.namespace.slug)
      return json(res, 200, { pagination: { count: list.length }, result: list })
    }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData()
    const part = form.get('versionUpload') as File | null
    if (!part) return json(res, 400, { message: 'versionUpload manquant' })
    const versionUpload = JSON.parse(await part.text()) as Record<string, unknown>
    const files = form.getAll('files') as File[]
    if (!files.length) return json(res, 400, { message: 'fichier manquant' })
    uploads.push({ project: found.namespace.slug, versionUpload, files: files.map((f) => ({ name: f.name, size: f.size })) })
    versions.push({
      project: found.namespace.slug,
      id: next++,
      name: String(versionUpload.version),
      createdAt: new Date().toISOString(),
      channel: { name: String(versionUpload.channel) },
      platformDependencies: versionUpload.platformDependencies as Record<string, string[]>
    })
    return json(res, 200, { url: `https://hangar.papermc.io/${found.namespace.owner}/${found.namespace.slug}/versions/${versionUpload.version}` })
  }
  const server = createServer((req, res) => void handle(req, res).catch((err: unknown) => json(res, 500, { message: String(err) })))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    projects,
    versions,
    uploads,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}
