// Accès du publieur à Hangar (hangar.papermc.io), le site des plugins Paper : sa clé d'API, chiffrée comme le jeton
// GitHub (DPAPI), échangée contre un jeton de session (JWT) à chaque utilisation. Ordre : enregistrée dans
// l'application > HANGAR_API_KEY > fichier .env. La clé ne passe jamais par une commande ni par Claude.
import { openAsBlob } from 'node:fs'
import { readFile, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { APP_REPO } from '../shared/config'
import type { HangarAuthStatus } from '../shared/types'
import { readJson, writeJsonAtomic } from './fsutil'
import { protectSecret, unprotectSecret } from './powershell'
import { settingsDir } from './settings'
import { StudioError } from './studio/analyze'

const HANGAR_API = 'https://hangar.papermc.io'
const USER_AGENT = `${APP_REPO.owner}/${APP_REPO.name} (github.com/${APP_REPO.owner}/${APP_REPO.name})`
const ENV_NAME = 'HANGAR_API_KEY'

// En test, MPD_HANGAR_API (http://127.0.0.1:<port>) remplace l'API.
let override: string | null = null

export function setHangarApiOverride(url: string | null | undefined): void {
  override = url ? url.replace(/\/+$/, '') : null
}

export const hangarApi = () => override ?? HANGAR_API

const storeFile = () => join(settingsDir(), 'hangar-auth.json')

let decrypted: { key: string; value: string | null } | null = null

async function storedKey(): Promise<string | null> {
  const file = storeFile()
  const info = await stat(file).catch(() => null)
  if (!info) return null
  const key = `${file}|${info.mtimeMs}`
  if (decrypted?.key === key) return decrypted.value
  const stored = (await readJson<{ apiKey?: { value: string } }>(file))?.apiKey?.value
  const value = stored ? await unprotectSecret(stored).catch(() => null) : null
  decrypted = { key, value }
  return value
}

/** La clé, d'où qu'elle vienne, ou null. */
export async function hangarKey(options: { dotenvDir?: string } = {}): Promise<{ value: string; source: Exclude<HangarAuthStatus['source'], null> } | null> {
  const saved = await storedKey()
  if (saved) return { value: saved, source: 'saved' }
  const env = process.env[ENV_NAME]?.trim()
  if (env) return { value: env, source: 'env' }
  if (options.dotenvDir) {
    const text = await readFile(join(options.dotenvDir, '.env'), 'utf8').catch(() => '')
    const value = new RegExp(`^${ENV_NAME}=(.+)$`, 'm').exec(text)?.[1].trim()
    if (value) return { value, source: 'dotenv' }
  }
  return null
}

/** Compte d'un jeton de session (champ `sub` du JWT), sans le vérifier : il vient de Hangar à l'instant. */
function accountOf(jwt: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

async function authenticate(apiKey: string): Promise<{ token: string; expiresAt: number } | { status: number }> {
  let res: Response
  try {
    res = await fetch(`${hangarApi()}/api/v1/authenticate?apiKey=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20_000)
    })
  } catch {
    throw new StudioError('Hangar est injoignable. Vérifie ta connexion internet.')
  }
  if (!res.ok) return { status: res.status }
  const session = (await res.json()) as { token?: unknown; expiresIn?: unknown }
  if (typeof session.token !== 'string') return { status: 500 }
  return { token: session.token, expiresAt: Date.now() + (typeof session.expiresIn === 'number' ? session.expiresIn : 60_000) - 5_000 }
}

/** Demande à Hangar si la clé est acceptée : son compte, refusée (valid false), ou Hangar injoignable (null). */
export async function checkHangarKey(value: string): Promise<{ valid: boolean | null; username: string | null; error: string | null }> {
  try {
    const result = await authenticate(value)
    if ('token' in result) return { valid: true, username: accountOf(result.token), error: null }
    if (result.status === 400 || result.status === 401 || result.status === 403) return { valid: false, username: null, error: 'Hangar refuse cette clé d’API.' }
    return { valid: null, username: null, error: `Hangar a répondu ${result.status}.` }
  } catch (err) {
    return { valid: null, username: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function hangarAuthStatus(options: { dotenvDir?: string; check?: boolean } = {}): Promise<HangarAuthStatus> {
  const key = await hangarKey(options)
  if (!key) return { source: null, valid: null, username: null, error: null }
  if (options.check === false) return { source: key.source, valid: null, username: null, error: null }
  return { source: key.source, ...(await checkHangarKey(key.value)) }
}

/** Enregistre la clé après l'avoir fait vérifier par Hangar (null : la retirer). */
export async function saveHangarKey(value: string | null): Promise<void> {
  if (value === null) {
    await rm(storeFile(), { force: true })
  } else {
    const trimmed = value.trim()
    if (!trimmed) throw new Error('Colle la clé avant d’enregistrer.')
    const { valid, error } = await checkHangarKey(trimmed)
    if (valid !== true) throw new Error(error ?? 'Hangar n’a pas confirmé cette clé.')
    await writeJsonAtomic(storeFile(), { apiKey: { value: await protectSecret(trimmed), savedAt: new Date().toISOString() } })
  }
  decrypted = null
}

// ---------------------------------------------------------------------------------------------
// API

export interface HangarProject {
  id: number
  name: string
  namespace: { owner: string; slug: string }
}

export interface HangarVersion {
  id: number
  name: string
  createdAt: string
  description?: string
  channel?: { name: string }
  /** Fichier de chaque plateforme (PAPER…). */
  downloads?: Record<string, { fileInfo?: { name?: string } | null }>
  platformDependencies?: Record<string, string[]>
}

export interface NewHangarVersion {
  version: string
  /** Release, Snapshot… (canaux du projet). */
  channel: string
  description: string
  /** Versions de Minecraft, par plateforme. */
  platformDependencies: Record<string, string[]>
  /** Un fichier par jeu de plateformes. */
  files: Array<{ path: string; platforms: string[] }>
}

export class HangarClient {
  private session: { token: string; expiresAt: number } | null = null

  constructor(private readonly apiKey: string) {}

  static async create(options: { dotenvDir?: string } = {}): Promise<HangarClient> {
    const key = await hangarKey(options)
    if (!key) throw new StudioError('Aucune clé d’API Hangar : enregistre-la dans Paramètres → Compte Hangar.')
    return new HangarClient(key.value)
  }

  private async token(): Promise<string> {
    if (this.session && this.session.expiresAt > Date.now()) return this.session.token
    const result = await authenticate(this.apiKey)
    if (!('token' in result)) throw new StudioError('Hangar refuse la clé d’API : vérifie-la dans Paramètres → Compte Hangar.')
    this.session = result
    return result.token
  }

  private async request<T>(method: string, path: string, body?: FormData): Promise<T | null> {
    let res: Response
    try {
      res = await fetch(`${hangarApi()}/api/v1${path}`, {
        method,
        headers: { 'User-Agent': USER_AGENT, Authorization: `HangarAuth ${await this.token()}` },
        body,
        signal: AbortSignal.timeout(body ? 600_000 : 60_000)
      })
    } catch (err) {
      if (err instanceof StudioError) throw err
      throw new StudioError('Hangar est injoignable. Vérifie ta connexion internet.')
    }
    if (res.status === 404) return null
    const text = await res.text()
    if (res.status === 401 || res.status === 403) throw new StudioError('Hangar refuse : la clé doit avoir le droit de créer des versions sur ce projet (create_version).')
    if (!res.ok) {
      let detail = text.slice(0, 300)
      try {
        detail = (JSON.parse(text) as { message?: string }).message ?? detail
      } catch {
        // réponse non JSON
      }
      throw new StudioError(`Hangar a refusé la demande (${res.status}) : ${detail}`)
    }
    return (text ? JSON.parse(text) : null) as T
  }

  getProject(slug: string): Promise<HangarProject | null> {
    return this.request<HangarProject>('GET', `/projects/${encodeURIComponent(slug)}`)
  }

  async projectVersions(slug: string): Promise<HangarVersion[]> {
    const page = await this.request<{ result?: HangarVersion[] }>('GET', `/projects/${encodeURIComponent(slug)}/versions?limit=25&offset=0`)
    return page?.result ?? []
  }

  /** Crée une version : la partie `versionUpload` (JSON), puis les fichiers dans l'ordre de `files`. */
  async uploadVersion(slug: string, version: NewHangarVersion): Promise<void> {
    const form = new FormData()
    const upload = {
      version: version.version,
      channel: version.channel,
      description: version.description,
      platformDependencies: version.platformDependencies,
      pluginDependencies: {},
      files: version.files.map((f) => ({ platforms: f.platforms }))
    }
    form.append('versionUpload', new Blob([JSON.stringify(upload)], { type: 'application/json' }))
    for (const file of version.files) form.append('files', await openAsBlob(file.path), basename(file.path))
    await this.request('POST', `/projects/${encodeURIComponent(slug)}/upload`, form)
  }
}
