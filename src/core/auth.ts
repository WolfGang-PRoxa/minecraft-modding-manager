import { execFile } from 'node:child_process'
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { GITHUB_OAUTH_CLIENT_ID } from '../shared/config'
import { parseRepo, repoSlug } from '../shared/repo'
import type { CredentialSource, DeviceLogin, GitHubAccount, RepoInfo, RepoRef } from '../shared/types'
import { readJson, writeJsonAtomic } from './fsutil'
import { GITHUB_HEADERS, repoApiBase, userApiUrl } from './githubEnv'
import { powershell } from './powershell'
import { settingsDir } from './settings'

// Connexion GitHub partagée par l'application, le studio et les scripts. Le jeton est chiffré par
// Windows (DPAPI, lié à la session de l'utilisateur) : les trois processus peuvent le relire.

export interface Credential {
  token: string
  source: CredentialSource
}

interface StoredCredential {
  login: string
  /** Jeton chiffré par DPAPI, en base64. */
  token: string
  savedAt: string
}

const credentialFile = () => join(settingsDir(), 'github-auth.json')

const DPAPI = "Add-Type -AssemblyName System.Security; $d=[Console]::In.ReadToEnd().Trim(); $s='CurrentUser';"
const protect = (text: string) =>
  powershell(
    `${DPAPI} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($d),$null,$s))`,
    text
  )
const unprotect = (base64: string) =>
  powershell(
    `${DPAPI} [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($d),$null,$s))`,
    base64
  )

// Déchiffrer lance PowerShell : on garde le résultat tant que le fichier ne change pas.
let decrypted: { key: string; token: string } | null = null

async function storedCredential(): Promise<Credential | null> {
  const file = credentialFile()
  const info = await stat(file).catch(() => null)
  if (!info) return null
  const key = `${file}|${info.mtimeMs}`
  if (decrypted?.key === key) return { token: decrypted.token, source: 'login' }
  const data = await readJson<StoredCredential>(file)
  if (!data?.token) return null
  try {
    const token = await unprotect(data.token)
    decrypted = { key, token }
    return { token, source: 'login' }
  } catch {
    return null
  }
}

function ghCliToken(): Promise<string | null> {
  return new Promise((resolvePromise) => {
    execFile('gh', ['auth', 'token'], { windowsHide: true, timeout: 10_000 }, (err, stdout) =>
      resolvePromise(err ? null : stdout.trim() || null)
    )
  })
}

/**
 * Jeton à utiliser : d'abord la connexion faite dans l'application, puis, en repli, une session
 * existante sur ce PC (variable GITHUB_TOKEN, fichier .env des scripts, GitHub CLI).
 */
export async function resolveCredential(options: { dotenvDir?: string } = {}): Promise<Credential | null> {
  const stored = await storedCredential()
  if (stored) return stored
  const env = process.env.GITHUB_TOKEN?.trim()
  if (env) return { token: env, source: 'env' }
  if (options.dotenvDir) {
    const text = await readFile(join(options.dotenvDir, '.env'), 'utf8').catch(() => '')
    const token = /^GITHUB_TOKEN=(.+)$/m.exec(text)?.[1].trim()
    if (token) return { token, source: 'dotenv' }
  }
  const gh = await ghCliToken()
  return gh ? { token: gh, source: 'gh' } : null
}

async function githubGet(url: string, token: string | null): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { ...GITHUB_HEADERS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(20_000)
    })
  } catch {
    throw new Error('Impossible de joindre GitHub. Vérifie ta connexion internet.')
  }
}

/** Compte GitHub correspondant à un jeton. */
export async function accountFor(credential: Credential): Promise<GitHubAccount> {
  const res = await githubGet(userApiUrl(), credential.token)
  if (res.status === 401) throw new Error('GitHub refuse la connexion enregistrée (jeton expiré ou révoqué) : reconnecte-toi.')
  if (!res.ok) throw new Error(`GitHub a répondu ${res.status}.`)
  const user = (await res.json()) as { login: string; avatar_url?: string }
  return { login: user.login, avatarUrl: user.avatar_url ?? null, source: credential.source }
}

export async function saveLogin(token: string): Promise<GitHubAccount> {
  const account = await accountFor({ token, source: 'login' })
  const stored: StoredCredential = { login: account.login, token: await protect(token), savedAt: new Date().toISOString() }
  await writeJsonAtomic(credentialFile(), stored)
  return account
}

export async function logout(): Promise<void> {
  decrypted = null
  await rm(credentialFile(), { force: true })
}

// ---------------------------------------------------------------------------------------------
// Dépôts

type RepoResponse = {
  name?: string
  private?: boolean
  owner?: { login?: string; avatar_url?: string }
  permissions?: { push?: boolean; admin?: boolean }
}

function repoInfo(repo: RepoRef, json: RepoResponse): RepoInfo {
  return {
    repo: { owner: json.owner?.login ?? repo.owner, name: json.name ?? repo.name },
    ownerAvatarUrl: json.owner?.avatar_url ?? null,
    private: Boolean(json.private)
  }
}

export class RepoError extends Error {
  constructor(
    message: string,
    /** Se connecter avec un autre compte GitHub peut résoudre le problème. */
    readonly needsLogin = false
  ) {
    super(message)
  }
}

export function parseRepoInput(input: string): RepoRef {
  const repo = parseRepo(input)
  if (!repo) throw new RepoError('Format attendu : propriétaire/dépôt, par exemple WolfGang-PRoxa/minecraft-modpack-downloader.')
  return repo
}

/** Vérifie qu'un dépôt existe et qu'il est public (ce que voient les récepteurs). */
export async function checkPublicRepo(repo: RepoRef): Promise<RepoInfo> {
  const res = await githubGet(repoApiBase(repo), null)
  if (res.status === 404) {
    throw new RepoError(`Dépôt ${repoSlug(repo)} introuvable. Vérifie le nom : il doit exister et être public.`)
  }
  if (res.status === 403 || res.status === 429) throw new RepoError('Limite de requêtes GitHub atteinte : réessaie dans quelques minutes.')
  if (!res.ok) throw new RepoError(`GitHub a répondu ${res.status}.`)
  return repoInfo(repo, (await res.json()) as RepoResponse)
}

/** Vérifie que le compte du jeton a le droit de publier des releases sur le dépôt. */
export async function checkPublisherAccess(repo: RepoRef, credential: Credential): Promise<{ info: RepoInfo; account: GitHubAccount }> {
  const account = await accountFor(credential).catch((err: Error) => {
    throw new RepoError(err.message, true)
  })
  const res = await githubGet(repoApiBase(repo), credential.token)
  if (res.status === 404) {
    throw new RepoError(`Dépôt ${repoSlug(repo)} introuvable pour le compte ${account.login}. Vérifie le nom, ou connecte-toi avec le compte propriétaire.`, true)
  }
  if (!res.ok) throw new RepoError(`GitHub a répondu ${res.status}.`)
  const json = (await res.json()) as RepoResponse
  if (!json.permissions?.push && !json.permissions?.admin) {
    throw new RepoError(`Le compte ${account.login} n’a pas le droit de publier sur ${repoSlug(repo)}. Connecte-toi avec le compte propriétaire du dépôt.`, true)
  }
  return { info: repoInfo(repo, json), account }
}

// ---------------------------------------------------------------------------------------------
// « Se connecter avec GitHub » : flux par code (device flow), sans secret d'application.

export const deviceLoginAvailable = (): boolean => Boolean(GITHUB_OAUTH_CLIENT_ID)

interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

async function oauthPost<T>(url: string, body: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': GITHUB_HEADERS['User-Agent'] },
    body: new URLSearchParams(body).toString(),
    signal: signal ?? AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`GitHub a répondu ${res.status}.`)
  return (await res.json()) as T
}

const DEVICE_ERRORS: Record<string, string> = {
  expired_token: 'Le code a expiré : recommence la connexion.',
  access_denied: 'Connexion refusée sur GitHub.',
  device_flow_disabled: 'La connexion par code n’est pas activée pour cette application GitHub.',
  incorrect_client_credentials: 'Identifiant d’application GitHub invalide.'
}

export async function startDeviceLogin(): Promise<DeviceLogin & { deviceCode: string; interval: number }> {
  if (!GITHUB_OAUTH_CLIENT_ID) throw new Error('La connexion par code n’est pas configurée : utilise un jeton.')
  const data = await oauthPost<DeviceCode & { error?: string; error_description?: string }>('https://github.com/login/device/code', {
    client_id: GITHUB_OAUTH_CLIENT_ID,
    scope: 'public_repo'
  })
  if (data.error) throw new Error(DEVICE_ERRORS[data.error] ?? data.error_description ?? data.error)
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    deviceCode: data.device_code,
    interval: data.interval
  }
}

/** Attend que l'utilisateur valide le code sur GitHub, puis enregistre la connexion. */
export async function completeDeviceLogin(deviceCode: string, interval: number, signal: AbortSignal): Promise<GitHubAccount> {
  let wait = Math.max(interval, 5)
  for (;;) {
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(resolvePromise, wait * 1000)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('Connexion annulée.'))
      }, { once: true })
    })
    const data = await oauthPost<{ access_token?: string; error?: string; error_description?: string }>(
      'https://github.com/login/oauth/access_token',
      { client_id: GITHUB_OAUTH_CLIENT_ID, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' },
      signal
    )
    if (data.access_token) return saveLogin(data.access_token)
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') {
      wait += 5
      continue
    }
    throw new Error(DEVICE_ERRORS[data.error ?? ''] ?? data.error_description ?? 'Connexion impossible.')
  }
}
