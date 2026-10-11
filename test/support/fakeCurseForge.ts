// Faux CurseForge pour les tests : l'API de lecture (/v1/…, clé `x-api-key`) et l'API de mise en ligne (/api/…,
// jeton `X-Api-Token`). Une seule clé et un seul jeton sont acceptés.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export const VALID_API_KEY = 'cle-de-test'
export const VALID_UPLOAD_TOKEN = 'jeton-de-test'

export interface FakeCurseForge {
  /** À passer à setCurseForgeApiOverride. */
  url: string
  close(): Promise<void>
}

export async function startFakeCurseForge(): Promise<FakeCurseForge> {
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path.startsWith('/v1/')) {
      if (req.headers['x-api-key'] !== VALID_API_KEY) return json(res, 403, {})
      if (path === '/v1/games/432') return json(res, 200, { data: { id: 432, name: 'Minecraft', slug: 'minecraft' } })
    }
    if (path.startsWith('/api/')) {
      const token = req.headers['x-api-token']
      if (!token) return json(res, 401, { errorCode: 401, errorMessage: 'You must provide an API token.' })
      if (token !== VALID_UPLOAD_TOKEN) return json(res, 403, { errorCode: 403, errorMessage: 'Invalid API token provided.' })
      if (path === '/api/game/versions') return json(res, 200, [{ id: 1, gameVersionTypeID: 1, name: '1.20.1', slug: '1-20-1' }])
    }
    json(res, 404, { message: `Route inconnue du faux CurseForge : ${req.method} ${path}` })
  }
  const server = createServer(handle)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}
