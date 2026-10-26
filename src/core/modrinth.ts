// Accès du publieur à Modrinth : son jeton d'accès personnel (modrinth.com/settings/pats), chiffré comme le jeton
// GitHub (DPAPI), et le client de l'API v2. Ordre : enregistré dans l'application > MODRINTH_TOKEN > fichier .env.
// Le jeton ne passe jamais par une commande ni par Claude : seule la fenêtre l'enregistre.
import { openAsBlob } from 'node:fs'
import { readFile, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { APP_REPO } from '../shared/config'
import type { ModrinthAuthStatus } from '../shared/types'
import { readJson, writeJsonAtomic } from './fsutil'
import { protectSecret, unprotectSecret } from './powershell'
import { settingsDir } from './settings'
import { StudioError } from './studio/analyze'

const MODRINTH_API = 'https://api.modrinth.com'
/** Modrinth exige un User-Agent propre à l'application, avec un moyen de contact. */
const USER_AGENT = `${APP_REPO.owner}/${APP_REPO.name} (github.com/${APP_REPO.owner}/${APP_REPO.name})`
const ENV_NAME = 'MODRINTH_TOKEN'

// En test, MM_MODRINTH_API (http://127.0.0.1:<port>) remplace l'API.
let override: string | null = null

export function setModrinthApiOverride(url: string | null | undefined): void {
  override = url ? url.replace(/\/+$/, '') : null
}

export const modrinthApi = () => override ?? MODRINTH_API

const storeFile = () => join(settingsDir(), 'modrinth-auth.json')

type StoredFile = { token?: { value: string; savedAt: string } }

// Déchiffrer lance PowerShell : gardé tant que le fichier ne change pas.
let decrypted: { key: string; value: string | null } | null = null

async function storedToken(): Promise<string | null> {
  const file = storeFile()
  const info = await stat(file).catch(() => null)
  if (!info) return null
  const key = `${file}|${info.mtimeMs}`
  if (decrypted?.key === key) return decrypted.value
  const stored = (await readJson<StoredFile>(file))?.token?.value
  const value = stored ? await unprotectSecret(stored).catch(() => null) : null
  decrypted = { key, value }
  return value
}

export interface ModrinthToken {
  value: string
  source: Exclude<ModrinthAuthStatus['source'], null>
}

/** Le jeton, d'où qu'il vienne, ou null. */
export async function modrinthToken(options: { dotenvDir?: string } = {}): Promise<ModrinthToken | null> {
  const saved = await storedToken()
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

/** Demande à Modrinth à qui est le jeton : son compte, refusé (valid false), ou Modrinth injoignable (null). */
export async function checkModrinthToken(value: string): Promise<{ valid: boolean | null; username: string | null; error: string | null }> {
  let res: Response
  try {
    res = await fetch(`${modrinthApi()}/v2/user`, { headers: { Authorization: value, 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) })
  } catch {
    return { valid: null, username: null, error: 'Modrinth est injoignable. Vérifie ta connexion internet.' }
  }
  if (res.ok) {
    const user = (await res.json().catch(() => ({}))) as { username?: unknown }
    return { valid: true, username: typeof user.username === 'string' ? user.username : null, error: null }
  }
  if (res.status === 401 || res.status === 403) {
    return { valid: false, username: null, error: 'Modrinth refuse ce jeton (absent, expiré, ou sans le droit « Read user data »).' }
  }
  return { valid: null, username: null, error: `Modrinth a répondu ${res.status}.` }
}

/** Le jeton est-il là, et accepté par Modrinth (`check: false` : sans le demander). */
export async function modrinthAuthStatus(options: { dotenvDir?: string; check?: boolean } = {}): Promise<ModrinthAuthStatus> {
  const token = await modrinthToken(options)
  if (!token) return { source: null, valid: null, username: null, error: null }
  if (options.check === false) return { source: token.source, valid: null, username: null, error: null }
  return { source: token.source, ...(await checkModrinthToken(token.value)) }
}

/** Enregistre le jeton après l'avoir fait vérifier par Modrinth (null : le retirer). */
export async function saveModrinthToken(value: string | null): Promise<void> {
  if (value === null) {
    await rm(storeFile(), { force: true })
  } else {
    const trimmed = value.trim()
    if (!trimmed) throw new Error('Colle le jeton avant d’enregistrer.')
    const { valid, error } = await checkModrinthToken(trimmed)
    if (valid !== true) throw new Error(error ?? 'Modrinth n’a pas confirmé ce jeton.')
    await writeJsonAtomic(storeFile(), { token: { value: await protectSecret(trimmed), savedAt: new Date().toISOString() } })
  }
  decrypted = null
}

// ---------------------------------------------------------------------------------------------
// API

export interface MrProject {
  id: string
  slug: string
  title: string
  project_type: string
  /** approved, draft, processing, rejected… */
  status: string
}

export interface MrVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  /** listed, draft, unlisted, archived… */
  status: string
  date_published: string
  game_versions: string[]
  loaders: string[]
  files: Array<{ filename: string; hashes: { sha1?: string; sha512?: string }; primary: boolean }>
}

export interface NewVersion {
  projectId: string
  name: string
  versionNumber: string
  changelog: string
  versionType: 'release' | 'beta' | 'alpha'
  gameVersions: string[]
  loaders: string[]
  /** Projets dont la version dépend obligatoirement. */
  dependencies: string[]
  files: string[]
}

export class ModrinthClient {
  constructor(private readonly token: string | null) {}

  static async create(options: { dotenvDir?: string } = {}): Promise<ModrinthClient> {
    const token = await modrinthToken(options)
    if (!token) throw new StudioError('Aucun jeton Modrinth : enregistre-le dans Paramètres → Compte Modrinth.')
    return new ModrinthClient(token.value)
  }

  private async request<T>(method: string, path: string, body?: FormData): Promise<T | null> {
    let res: Response
    try {
      res = await fetch(`${modrinthApi()}/v2${path}`, {
        method,
        headers: { 'User-Agent': USER_AGENT, ...(this.token ? { Authorization: this.token } : {}) },
        body,
        signal: AbortSignal.timeout(body ? 600_000 : 60_000)
      })
    } catch {
      throw new StudioError('Modrinth est injoignable. Vérifie ta connexion internet.')
    }
    if (res.status === 404) return null
    const text = await res.text()
    if (res.status === 401 || res.status === 403) {
      throw new StudioError('Modrinth refuse le jeton : vérifie ses droits (lire les projets, créer des versions) dans Paramètres → Compte Modrinth.')
    }
    if (!res.ok) {
      let detail = text.slice(0, 300)
      try {
        detail = (JSON.parse(text) as { description?: string }).description ?? detail
      } catch {
        // réponse non JSON
      }
      throw new StudioError(`Modrinth a refusé la demande (${res.status}) : ${detail}`)
    }
    return (text ? JSON.parse(text) : null) as T
  }

  /** Un projet par son identifiant ou son slug, ou null. */
  getProject(idOrSlug: string): Promise<MrProject | null> {
    return this.request<MrProject>('GET', `/project/${encodeURIComponent(idOrSlug)}`)
  }

  /** Toutes les versions d'un projet (avec le jeton : aussi ses brouillons), de la plus récente à la plus ancienne. */
  async projectVersions(projectId: string): Promise<MrVersion[]> {
    return (await this.request<MrVersion[]>('GET', `/project/${encodeURIComponent(projectId)}/version`)) ?? []
  }

  /** Crée une version, publiée tout de suite (le projet doit appartenir au compte du jeton). */
  async createVersion(version: NewVersion): Promise<MrVersion> {
    const parts = version.files.map((_, i) => `file${i}`)
    const form = new FormData()
    form.set(
      'data',
      JSON.stringify({
        project_id: version.projectId,
        name: version.name,
        version_number: version.versionNumber,
        changelog: version.changelog,
        dependencies: version.dependencies.map((project_id) => ({ project_id, dependency_type: 'required' })),
        game_versions: version.gameVersions,
        version_type: version.versionType,
        loaders: version.loaders,
        featured: false,
        status: 'listed',
        file_parts: parts,
        primary_file: parts[0]
      })
    )
    for (const [i, file] of version.files.entries()) form.set(parts[i], await openAsBlob(file), basename(file))
    const created = await this.request<MrVersion>('POST', '/version', form)
    if (!created?.id) throw new StudioError('Modrinth n’a pas renvoyé la version créée.')
    return created
  }
}
