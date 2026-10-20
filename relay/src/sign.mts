import { createHmac, timingSafeEqual } from 'node:crypto'

/** Ce que demande un lien signé : les boutons des mails, et la page d'état du relais. */
export type LinkAction = 'corriger' | 'contexte' | 'evaluer' | 'valider' | 'invalider' | 'etat'

export interface LinkPayload {
  a: LinkAction
  /** Numéro de l'issue (0 pour la page d'état, qui ne vise aucune issue). */
  i: number
  /** Branche de la correction (valider, invalider). */
  b?: string
  /** Commit résumé dans le mail : une validation ne vaut que pour lui. */
  h?: string
  /** Fin de validité, en millisecondes. */
  e: number
}

const DAY_MS = 24 * 3600 * 1000
/** Les boutons d'un mail restent valables deux mois. */
const LINK_VALIDITY_MS = 60 * DAY_MS

const ACTIONS: LinkAction[] = ['corriger', 'contexte', 'evaluer', 'valider', 'invalider', 'etat']

const hmac = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest()

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Jeton d'un lien : le contenu en clair, suivi de sa signature. */
export function signLink(payload: Omit<LinkPayload, 'e'>, secret: string, now = Date.now(), validityMs = LINK_VALIDITY_MS): string {
  const data = Buffer.from(JSON.stringify({ ...payload, e: now + validityMs })).toString('base64url')
  return `${data}.${hmac(data, secret).toString('base64url')}`
}

export function verifyLink(token: string, secret: string, now = Date.now()): LinkPayload | null {
  const [data, signature, ...rest] = token.split('.')
  if (!data || !signature || rest.length > 0) return null
  if (!sameBytes(Buffer.from(signature, 'base64url'), hmac(data, secret))) return null
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as LinkPayload
    const issue = payload.a === 'etat' ? payload.i === 0 : Number.isInteger(payload.i) && payload.i > 0
    if (!ACTIONS.includes(payload.a) || !issue || typeof payload.e !== 'number' || payload.e < now) return null
    return payload
  } catch {
    return null
  }
}

/** Vérifie l'en-tête X-Hub-Signature-256 d'un appel de webhook GitHub. */
export function verifyGitHubSignature(body: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  return sameBytes(Buffer.from(header.slice('sha256='.length), 'hex'), hmac(body, secret))
}
