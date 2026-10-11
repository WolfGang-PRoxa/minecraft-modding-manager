// Accès du publieur à CurseForge, partagé par l'application et les commandes, chiffrés comme le jeton GitHub (DPAPI) :
//  - la clé de l'API CurseForge (console.curseforge.com) : lire les mods et leurs fichiers, trouver les mises à jour ;
//  - le jeton d'auteur (authors.curseforge.com) : mettre des fichiers en ligne sur ses projets.
// Ordre : enregistré dans l'application > variable d'environnement > fichier .env (commandes lancées depuis le dépôt).
// Ces secrets ne passent jamais par une commande ni par Claude : seule la fenêtre les enregistre.
import { readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CurseForgeAuthStatus, CurseForgeSecretKind, CurseForgeSecretStatus } from '../shared/types'
import { readJson, writeJsonAtomic } from './fsutil'
import { protectSecret, unprotectSecret } from './powershell'
import { settingsDir } from './settings'

const CURSEFORGE_API = 'https://api.curseforge.com'
const CURSEFORGE_UPLOAD_API = 'https://minecraft.curseforge.com/api'

// En test, MPD_CURSEFORGE_API (http://127.0.0.1:<port>) remplace les deux API : /v1/… et /api/…
let override: string | null = null

export function setCurseForgeApiOverride(url: string | null | undefined): void {
  override = url ? url.replace(/\/+$/, '') : null
}

/** Adresses de l'API de lecture (clé d'API), de l'API de mise en ligne (jeton d'auteur) et du serveur de fichiers. */
export const curseForgeApis = () => ({
  core: override ?? CURSEFORGE_API,
  upload: override ? `${override}/api` : CURSEFORGE_UPLOAD_API,
  cdn: override ? `${override}/cdn` : 'https://edge.forgecdn.net'
})

const ENV_NAMES: Record<CurseForgeSecretKind, string> = {
  apiKey: 'CURSEFORGE_API_KEY',
  uploadToken: 'CURSEFORGE_UPLOAD_TOKEN'
}

type StoredFile = Partial<Record<CurseForgeSecretKind, { value: string; savedAt: string }>>

const storeFile = () => join(settingsDir(), 'curseforge-auth.json')

// Déchiffrer lance PowerShell : gardé tant que le fichier ne change pas.
let decrypted: { key: string; values: Partial<Record<CurseForgeSecretKind, string>> } | null = null

async function storedSecrets(): Promise<Partial<Record<CurseForgeSecretKind, string>>> {
  const file = storeFile()
  const info = await stat(file).catch(() => null)
  if (!info) return {}
  const key = `${file}|${info.mtimeMs}`
  if (decrypted?.key === key) return decrypted.values
  const data = (await readJson<StoredFile>(file)) ?? {}
  const values: Partial<Record<CurseForgeSecretKind, string>> = {}
  for (const kind of Object.keys(ENV_NAMES) as CurseForgeSecretKind[]) {
    const stored = data[kind]?.value
    if (stored) values[kind] = await unprotectSecret(stored).catch(() => undefined)
  }
  decrypted = { key, values }
  return values
}

export interface CurseForgeSecret {
  value: string
  source: Exclude<CurseForgeSecretStatus['source'], null>
}

/** Le secret demandé, d'où qu'il vienne, ou null. */
export async function curseForgeSecret(kind: CurseForgeSecretKind, options: { dotenvDir?: string } = {}): Promise<CurseForgeSecret | null> {
  const saved = (await storedSecrets())[kind]
  if (saved) return { value: saved, source: 'saved' }
  const env = process.env[ENV_NAMES[kind]]?.trim()
  if (env) return { value: env, source: 'env' }
  if (options.dotenvDir) {
    const text = await readFile(join(options.dotenvDir, '.env'), 'utf8').catch(() => '')
    const value = new RegExp(`^${ENV_NAMES[kind]}=(.+)$`, 'm').exec(text)?.[1].trim()
    if (value) return { value, source: 'dotenv' }
  }
  return null
}

/** Demande à CurseForge si le secret est accepté : true, false (refusé), ou null (CurseForge injoignable). */
export async function checkCurseForgeSecret(kind: CurseForgeSecretKind, value: string): Promise<{ valid: boolean | null; error: string | null }> {
  const [url, headers] =
    kind === 'apiKey'
      ? [`${curseForgeApis().core}/v1/games/432`, { 'x-api-key': value }]
      : [`${curseForgeApis().upload}/game/versions`, { 'X-Api-Token': value }]
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20_000) })
  } catch {
    return { valid: null, error: 'CurseForge est injoignable. Vérifie ta connexion internet.' }
  }
  if (res.ok) return { valid: true, error: null }
  if (res.status === 401 || res.status === 403) {
    return {
      valid: false,
      error: kind === 'apiKey' ? 'CurseForge refuse cette clé d’API.' : 'CurseForge refuse ce jeton d’auteur.'
    }
  }
  return { valid: null, error: `CurseForge a répondu ${res.status}.` }
}

/** Où en sont la clé et le jeton : trouvés ou non, et acceptés par CurseForge. */
export async function curseForgeAuthStatus(options: { dotenvDir?: string; check?: boolean } = {}): Promise<CurseForgeAuthStatus> {
  const status = async (kind: CurseForgeSecretKind): Promise<CurseForgeSecretStatus> => {
    const secret = await curseForgeSecret(kind, options)
    if (!secret) return { source: null, valid: null, error: null }
    if (options.check === false) return { source: secret.source, valid: null, error: null }
    return { source: secret.source, ...(await checkCurseForgeSecret(kind, secret.value)) }
  }
  const [apiKey, uploadToken] = await Promise.all([status('apiKey'), status('uploadToken')])
  return { apiKey, uploadToken }
}

/** Enregistre un secret après l'avoir fait vérifier par CurseForge (null : le retirer). */
export async function saveCurseForgeSecret(kind: CurseForgeSecretKind, value: string | null): Promise<void> {
  const data = (await readJson<StoredFile>(storeFile())) ?? {}
  if (value === null) {
    delete data[kind]
  } else {
    const trimmed = value.trim()
    if (!trimmed) throw new Error('Colle la clé (ou le jeton) avant d’enregistrer.')
    const { valid, error } = await checkCurseForgeSecret(kind, trimmed)
    if (valid !== true) throw new Error(error ?? 'CurseForge n’a pas confirmé ce secret.')
    data[kind] = { value: await protectSecret(trimmed), savedAt: new Date().toISOString() }
  }
  decrypted = null
  if (Object.keys(data).length) await writeJsonAtomic(storeFile(), data)
  else await rm(storeFile(), { force: true })
}
