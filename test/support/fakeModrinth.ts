// Faux Modrinth pour les tests : l'API v2 que le Studio utilise (compte du jeton, projets, versions, création d'une
// version en multipart). Un seul jeton est accepté ; un User-Agent est exigé, comme sur le vrai.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { MrProject, MrVersion } from '../../src/core/modrinth'

export const VALID_MODRINTH_TOKEN = 'mrp_jeton-de-test'

export interface FakeModrinth {
  /** À passer à setModrinthApiOverride. */
  url: string
  projects: MrProject[]
  versions: MrVersion[]
  /** Versions reçues : leurs données et les noms et tailles des fichiers. */
  created: Array<{ data: Record<string, unknown>; files: Array<{ name: string; size: number }> }>
  close(): Promise<void>
}

export async function startFakeModrinth(): Promise<FakeModrinth> {
  const projects: MrProject[] = []
  const versions: MrVersion[] = []
  const created: FakeModrinth['created'] = []
  let next = 1
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (!req.headers['user-agent']) return json(res, 400, { error: 'invalid_input', description: 'User-Agent manquant' })
    const authorized = req.headers.authorization === VALID_MODRINTH_TOKEN
    if (path === '/v2/user') return authorized ? json(res, 200, { id: 'u1', username: 'WolfGang' }) : json(res, 401, { error: 'unauthorized' })
    const project = /^\/v2\/project\/([^/]+)$/.exec(path)
    if (project && req.method === 'GET') {
      const key = decodeURIComponent(project[1])
      const found = projects.find((p) => p.id === key || p.slug === key)
      return found ? json(res, 200, found) : json(res, 404, { error: 'not_found' })
    }
    const projectVersions = /^\/v2\/project\/([^/]+)\/version$/.exec(path)
    if (projectVersions && req.method === 'GET') {
      const key = decodeURIComponent(projectVersions[1])
      const found = projects.find((p) => p.id === key || p.slug === key)
      return found ? json(res, 200, versions.filter((v) => v.project_id === found.id)) : json(res, 404, { error: 'not_found' })
    }
    if (path === '/v2/version' && req.method === 'POST') {
      if (!authorized) return json(res, 401, { error: 'unauthorized' })
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData()
      const data = JSON.parse(String(form.get('data'))) as Record<string, unknown>
      const parts = (data.file_parts as string[]) ?? []
      const files = parts.map((part) => form.get(part) as File)
      if (!files.length || files.some((f) => !f)) return json(res, 400, { error: 'invalid_input', description: 'fichier manquant' })
      created.push({ data, files: files.map((f) => ({ name: f.name, size: f.size })) })
      const version: MrVersion = {
        id: `ver${next++}`,
        project_id: String(data.project_id),
        name: String(data.name),
        version_number: String(data.version_number),
        version_type: data.version_type as MrVersion['version_type'],
        status: 'listed',
        date_published: new Date().toISOString(),
        game_versions: data.game_versions as string[],
        loaders: data.loaders as string[],
        files: files.map((f, i) => ({ filename: f.name, hashes: {}, primary: i === 0 }))
      }
      versions.push(version)
      return json(res, 200, version)
    }
    json(res, 404, { error: 'not_found', description: `Route inconnue du faux Modrinth : ${req.method} ${path}` })
  }
  const server = createServer((req, res) => void handle(req, res).catch((err: unknown) => json(res, 500, { description: String(err) })))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    projects,
    versions,
    created,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}
