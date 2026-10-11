// Faux GitHub en mémoire pour les tests : les routes de l'API des releases que le studio utilise (lecture, création,
// modification, suppression, envoi et téléchargement de fichiers). Toute écriture demande un jeton.
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { GhAsset, GhRelease } from '../../src/shared/releases'

export interface FakeGitHub {
  /** À passer à setGitHubApiOverride : http://127.0.0.1:<port>/repos/o/r */
  apiBase: string
  releases: GhRelease[]
  /** Contenu des fichiers envoyés, par identifiant. */
  files: Map<number, Buffer>
  /** Contenu d'un fichier d'une release, par tag et nom. */
  file(tag: string, name: string): Buffer | null
  close(): Promise<void>
}

const OWNER = 'o'
const REPO = 'r'

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export async function startFakeGitHub(): Promise<FakeGitHub> {
  const releases: GhRelease[] = []
  const files = new Map<number, Buffer>()
  let nextId = 1
  let base = ''
  const now = () => new Date().toISOString()

  const json = (res: ServerResponse, status: number, body?: unknown) => {
    res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' })
    res.end(body === undefined ? undefined : JSON.stringify(body))
  }
  const findRelease = (id: number) => releases.find((r) => r.id === id)
  const findAsset = (id: number) => {
    for (const release of releases) {
      const asset = release.assets.find((a) => a.id === id)
      if (asset) return { release, asset }
    }
    return null
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', base)
    const path = url.pathname
    const method = req.method ?? 'GET'
    const authorized = /^Bearer \S+/.test(req.headers.authorization ?? '')
    const repoPath = `/repos/${OWNER}/${REPO}`

    if (method === 'GET' && path === `/download/${path.split('/')[2]}`) {
      const data = files.get(Number(path.split('/')[2]))
      if (!data) return json(res, 404, { message: 'Not Found' })
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      return void res.end(data)
    }
    if (method === 'GET' && path === '/user') {
      return authorized ? json(res, 200, { login: 'tester' }) : json(res, 401, { message: 'Requires authentication' })
    }
    if (method === 'POST' && path.startsWith('/uploads/releases/')) {
      if (!authorized) return json(res, 401, { message: 'Requires authentication' })
      const release = findRelease(Number(path.split('/')[3]))
      if (!release) return json(res, 404, { message: 'Not Found' })
      const name = url.searchParams.get('name') ?? 'file'
      if (release.assets.some((a) => a.name === name)) return json(res, 422, { message: 'already_exists' })
      const data = await readBody(req)
      const id = nextId++
      files.set(id, data)
      const asset: GhAsset = {
        id,
        name,
        size: data.length,
        browser_download_url: `${base}/download/${id}`,
        updated_at: now(),
        digest: `sha256:${createHash('sha256').update(data).digest('hex')}`,
        state: 'uploaded'
      }
      release.assets.push(asset)
      return json(res, 201, asset)
    }
    if (!path.startsWith(repoPath)) return json(res, 404, { message: 'Not Found' })
    const rest = path.slice(repoPath.length)
    if (method !== 'GET' && !authorized) return json(res, 401, { message: 'Requires authentication' })

    if (method === 'GET' && rest === '') {
      return json(res, 200, { private: false, full_name: `${OWNER}/${REPO}`, permissions: { push: authorized } })
    }
    if (method === 'GET' && rest === '/releases') {
      const page = Number(url.searchParams.get('page') ?? 1)
      const perPage = Number(url.searchParams.get('per_page') ?? 30)
      const sorted = [...releases].sort((a, b) => b.id - a.id)
      return json(res, 200, sorted.slice((page - 1) * perPage, page * perPage))
    }
    let match = /^\/releases\/assets\/(\d+)$/.exec(rest)
    if (match) {
      const found = findAsset(Number(match[1]))
      if (!found) return json(res, 404, { message: 'Not Found' })
      if (method === 'GET') {
        res.writeHead(302, { Location: found.asset.browser_download_url })
        return void res.end()
      }
      if (method === 'DELETE') {
        found.release.assets = found.release.assets.filter((a) => a !== found.asset)
        files.delete(found.asset.id)
        return json(res, 204)
      }
      if (method === 'PATCH') {
        const body = JSON.parse((await readBody(req)).toString('utf8')) as { name?: string }
        if (body.name) found.asset.name = body.name
        found.asset.updated_at = now()
        return json(res, 200, found.asset)
      }
    }
    if (method === 'POST' && rest === '/releases') {
      const body = JSON.parse((await readBody(req)).toString('utf8')) as Partial<GhRelease>
      if (releases.some((r) => r.tag_name === body.tag_name)) return json(res, 422, { message: 'already_exists' })
      const id = nextId++
      const release: GhRelease = {
        id,
        tag_name: body.tag_name ?? `tag-${id}`,
        name: body.name ?? null,
        body: body.body ?? null,
        draft: Boolean(body.draft),
        prerelease: Boolean(body.prerelease),
        published_at: body.draft ? null : now(),
        created_at: now(),
        html_url: `https://github.com/${OWNER}/${REPO}/releases/tag/${body.tag_name}`,
        upload_url: `${base}/uploads/releases/${id}/assets{?name,label}`,
        assets: []
      }
      releases.push(release)
      return json(res, 201, release)
    }
    match = /^\/releases\/(\d+)$/.exec(rest)
    if (match) {
      const release = findRelease(Number(match[1]))
      if (!release) return json(res, 404, { message: 'Not Found' })
      if (method === 'GET') return json(res, 200, release)
      if (method === 'DELETE') {
        releases.splice(releases.indexOf(release), 1)
        return json(res, 204)
      }
      if (method === 'PATCH') {
        const body = JSON.parse((await readBody(req)).toString('utf8')) as Partial<GhRelease>
        for (const key of ['name', 'body', 'draft', 'prerelease', 'tag_name'] as const) {
          if (key in body) (release as unknown as Record<string, unknown>)[key] = body[key]
        }
        if (!release.draft && !release.published_at) release.published_at = now()
        return json(res, 200, release)
      }
    }
    if (method === 'DELETE' && rest.startsWith('/git/refs/tags/')) return json(res, 204)
    return json(res, 404, { message: `Route inconnue du faux GitHub : ${method} ${path}` })
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => json(res, 500, { message: String(err) }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  return {
    apiBase: `${base}/repos/${OWNER}/${REPO}`,
    releases,
    files,
    file(tag, name) {
      const asset = releases.find((r) => r.tag_name === tag)?.assets.find((a) => a.name === name)
      return asset ? (files.get(asset.id) ?? null) : null
    },
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}
