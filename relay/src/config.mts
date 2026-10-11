// Réglages du relais, lus dans les variables d'environnement Netlify (jamais dans le code).

declare const Netlify: { env: { get(name: string): string | undefined } }

export interface RelayConfig {
  /** Dépôt surveillé, « propriétaire/nom ». */
  repo: string
  /** Jeton GitHub du propriétaire (Contents, Issues et Pull requests en écriture sur ce seul dépôt). */
  githubToken: string
  /** Secret du webhook GitHub : prouve que l'appel vient bien de GitHub. */
  webhookSecret: string
  /** Secret qui signe les liens des mails : seul le destinataire peut agir. */
  linkSecret: string
  resendKey: string
  /** Adresse du propriétaire, qui reçoit les mails. */
  ownerEmail: string
  mailFrom: string
  /** Point d'entrée /fire de la routine qui corrige les issues, et son jeton. */
  routineUrl: string
  routineToken: string
  /** Adresse publique du relais, pour les liens des mails. */
  baseUrl: string
  githubApi: string
  resendApi: string
}

/** Erreur dont le message peut être montré tel quel au propriétaire. */
export class RelayError extends Error {
  readonly status: number

  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}

const REQUIRED = {
  repo: 'GITHUB_REPO',
  githubToken: 'GITHUB_TOKEN',
  webhookSecret: 'GITHUB_WEBHOOK_SECRET',
  linkSecret: 'LINK_SECRET',
  resendKey: 'RESEND_API_KEY',
  ownerEmail: 'OWNER_EMAIL',
  routineUrl: 'ROUTINE_FIRE_URL',
  routineToken: 'ROUTINE_TOKEN'
} as const

type RequiredKey = keyof typeof REQUIRED

/** Variables attendues, et si chacune est renseignée (jamais leur valeur). */
export function configStatus(): Array<{ name: string; set: boolean }> {
  return Object.values(REQUIRED).map((name) => ({ name, set: Boolean(Netlify.env.get(name)?.trim()) }))
}

/**
 * Lit la configuration. `needs` liste ce dont l'appel a besoin : une variable manquante donne une erreur
 * qui la nomme, plutôt qu'un échec obscur plus loin.
 */
export function loadConfig(req: Request, needs: RequiredKey[]): RelayConfig {
  const env = (name: string) => Netlify.env.get(name)?.trim() ?? ''
  const values = Object.fromEntries(Object.entries(REQUIRED).map(([key, name]) => [key, env(name)])) as Record<RequiredKey, string>
  const missing = needs.filter((key) => !values[key]).map((key) => REQUIRED[key])
  if (missing.length > 0) {
    throw new RelayError(`Configuration du relais incomplète : ${missing.join(', ')} à renseigner dans Netlify.`, 503)
  }
  return {
    ...values,
    mailFrom: env('MAIL_FROM') || 'Modpack Manager <onboarding@resend.dev>',
    baseUrl: (env('RELAY_URL') || env('URL') || new URL(req.url).origin).replace(/\/+$/, ''),
    githubApi: (env('GITHUB_API_URL') || 'https://api.github.com').replace(/\/+$/, ''),
    resendApi: (env('RESEND_API_URL') || 'https://api.resend.com').replace(/\/+$/, '')
  }
}
