import { useEffect, useState } from 'react'
import { Copy, ExternalLink, KeyRound, LoaderCircle, LogIn, LogOut, UserRound } from 'lucide-react'
import type { AuthApi, AuthStatus, CredentialSource, DeviceLogin } from '../../../shared/types'
import { Button } from './Button'

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'

const SOURCES: Record<CredentialSource, string> = {
  login: 'connexion faite dans l’application',
  gh: 'session GitHub CLI de ce PC',
  env: 'variable GITHUB_TOKEN',
  dotenv: 'fichier .env'
}

const inputClass =
  'w-full rounded-xl bg-ink-950/60 px-4 py-2.5 text-sm text-ink-100 ring-1 ring-inset ring-tint/10 outline-none transition placeholder:text-ink-500 select-text focus:ring-grass-400/60'

export function Avatar({ login, url, size = 36 }: { login: string | null; url?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  const src = url ?? (login ? `https://github.com/${login}.png?size=${size * 2}` : null)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-tint/[0.08] text-ink-300"
        style={{ width: size, height: size }}
      >
        <UserRound size={size * 0.5} />
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-ink-800 ring-1 ring-tint/10"
      style={{ width: size, height: size }}
    />
  )
}

interface GitHubAccountProps {
  api: AuthApi
  openLink: (url: string) => void
  /** Appelé à chaque changement de connexion (ex. pour relancer une vérification). */
  onChange?: (status: AuthStatus) => void
  /** Affiche d'emblée les moyens de connexion (le compte actuel ne convient pas). */
  promptLogin?: boolean
}

/** Compte GitHub utilisé pour publier : connexion par code, par jeton, ou repli sur une session du PC. */
export function GitHubAccount({ api, openLink, onChange, promptLogin = false }: GitHubAccountProps) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [mode, setMode] = useState<'idle' | 'choose' | 'device' | 'token'>('idle')
  const [device, setDevice] = useState<DeviceLogin | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (next: AuthStatus) => {
    setStatus(next)
    onChange?.(next)
  }

  useEffect(() => {
    void api.getAuthStatus().then((next) => {
      setStatus(next)
      onChange?.(next)
    })
    // Lecture unique à l'ouverture (les changements passent ensuite par `update`) ;
    // une connexion par code encore en attente est abandonnée à la fermeture.
    return () => void api.cancelDeviceLogin()
  }, [api])

  async function startDevice() {
    setBusy(true)
    setError(null)
    const started = await api.startDeviceLogin()
    setBusy(false)
    if (!started.ok) {
      setError(started.error)
      return
    }
    setDevice(started.login)
    setMode('device')
    const result = await api.waitDeviceLogin()
    setDevice(null)
    setMode('idle')
    if (result.ok) update(await api.getAuthStatus())
    else if (!result.cancelled) setError(result.error)
  }

  async function submitToken() {
    setBusy(true)
    setError(null)
    const result = await api.loginWithToken(token)
    setBusy(false)
    if (result.ok) {
      setToken('')
      setMode('idle')
      update(await api.getAuthStatus())
    } else {
      setError(result.error)
    }
  }

  async function logout() {
    setBusy(true)
    update(await api.logout())
    setBusy(false)
  }

  if (!status) {
    return (
      <div className="flex items-center gap-3 text-sm text-ink-400">
        <LoaderCircle size={16} className="animate-spin" /> Vérification de la connexion GitHub…
      </div>
    )
  }

  const account = status.account
  const showLogin = !account || mode !== 'idle' || promptLogin
  const chooseMode = mode === 'idle' || mode === 'choose' ? (status.deviceLoginAvailable ? 'choose' : 'token') : mode

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl bg-tint/[0.03] px-4 py-3 ring-1 ring-inset ring-tint/[0.06]">
        <Avatar login={account?.login ?? null} url={account?.avatarUrl} />
        <div className="min-w-0 flex-1">
          {account ? (
            <>
              <p className="truncate text-sm font-semibold text-ink-100">{account.login}</p>
              <p className="truncate text-xs text-ink-400">Connecté via la {SOURCES[account.source]}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink-100">Pas connecté à GitHub</p>
              <p className="text-xs text-ink-400">{status.error ?? 'Connecte-toi pour prouver que tu peux publier sur ton dépôt.'}</p>
            </>
          )}
        </div>
        {account?.source === 'login' && (
          <Button size="sm" variant="ghost" icon={LogOut} disabled={busy} onClick={() => void logout()}>
            Se déconnecter
          </Button>
        )}
        {account && account.source !== 'login' && mode === 'idle' && !promptLogin && (
          <Button size="sm" variant="ghost" onClick={() => setMode('choose')}>
            Utiliser un autre compte
          </Button>
        )}
      </div>

      {showLogin && mode === 'device' && device && (
        <div className="rounded-xl bg-grass-400/[0.07] px-5 py-4 ring-1 ring-inset ring-grass-400/25">
          <p className="text-sm text-ink-200">
            Sur la page GitHub qui vient de s’ouvrir, saisis ce code puis autorise l’application :
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-ink-950/70 px-4 py-2 font-mono text-2xl font-bold tracking-[0.2em] text-grass-300 select-text">
              {device.userCode}
            </span>
            <Button size="sm" icon={Copy} onClick={() => void navigator.clipboard?.writeText(device.userCode).catch(() => {})}>
              Copier
            </Button>
            <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openLink(device.verificationUri)}>
              Rouvrir la page
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-ink-400">
              <LoaderCircle size={14} className="animate-spin" /> En attente de ta validation sur GitHub…
            </p>
            <Button size="sm" variant="ghost" onClick={() => void api.cancelDeviceLogin()}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {showLogin && mode !== 'device' && chooseMode === 'choose' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon={LogIn} disabled={busy} onClick={() => void startDevice()}>
            Se connecter avec GitHub
          </Button>
          <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setMode('token')}>
            Utiliser un jeton
          </Button>
          {account && !promptLogin && (
            <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
              Annuler
            </Button>
          )}
        </div>
      )}

      {showLogin && mode !== 'device' && chooseMode === 'token' && (
        <div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (token.trim()) void submitToken()
            }}
          >
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Coller un jeton GitHub (github_pat_…)"
              autoComplete="off"
              className={inputClass}
            />
            <Button type="submit" icon={KeyRound} disabled={!token.trim() || busy}>
              Se connecter
            </Button>
          </form>
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            Jeton « fine-grained » limité à ton dépôt, avec l’accès <strong className="text-ink-300">Contents : Read and write</strong>{' '}
            (
            <button type="button" className="font-semibold text-grass-300 hover:text-grass-400" onClick={() => openLink(TOKEN_URL)}>
              en créer un
            </button>
            ). Il est chiffré par Windows sur ce PC.
            {account && !promptLogin && (
              <>
                {' '}
                <button type="button" className="font-semibold text-ink-300 hover:text-ink-100" onClick={() => setMode('idle')}>
                  Annuler
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-300 select-text">{error}</p>}
    </div>
  )
}
