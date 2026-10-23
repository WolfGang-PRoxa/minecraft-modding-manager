import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CloudUpload, Download, LoaderCircle, PencilLine, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { APP_REPO } from '../../../shared/config'
import { parseRepo, repoSlug, sameRepo } from '../../../shared/repo'
import type { AuthApi, AuthStatus, RepoRef, RoleApi, RoleResult, Settings, UserRole } from '../../../shared/types'
import { showDocs } from '../docs/store'
import { useStore } from '../store'
import { Button } from './Button'
import { Avatar, GitHubAccount } from './GitHubAccount'
import { refreshStudioIfOpen } from '../studio/store'
import { APP_NAME } from '../../../shared/config'
import { Logo } from './Logo'
import type { ToastItem } from './Toasts'

type RoleSuccess = Extract<RoleResult, { ok: true }>

/** Ce qui change entre l'application et le studio : API du preload, notifications, suites d'un changement de rôle. */
export interface UsageContext {
  api: AuthApi & RoleApi
  openLink: (url: string) => void
  /** Enregistre un changement de rôle réussi (réglages, catalogue, état de GitHub…). */
  onApplied: (result: RoleSuccess) => Promise<void> | void
  notify: (toast: Omit<ToastItem, 'id'>) => void
  /** Affiche la vue Studio. */
  openStudio?: () => void
  onAccountChange?: (status: AuthStatus) => void
}

const inputClass =
  'w-full rounded-xl bg-ink-950/60 px-4 py-3 text-sm text-ink-100 ring-1 ring-inset ring-tint/10 outline-none transition placeholder:text-ink-500 select-text focus:ring-grass-400/60'

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-2 block text-xs font-semibold tracking-widest text-ink-400 uppercase">{children}</span>
}

/** Valeur qui ne suit la saisie qu'après une pause (évite de charger un avatar à chaque lettre). */
function useSettled<T>(value: T, delay = 400): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

function RepoField({ value, onChange, onSubmit }: { value: string; onChange: (value: string) => void; onSubmit?: () => void }) {
  const repo = parseRepo(value)
  const owner = useSettled(repo?.owner ?? null)
  return (
    <div>
      <form
        className="flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (repo) onSubmit?.()
        }}
      >
        <Avatar login={owner} size={40} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="propriétaire/dépôt"
          spellCheck={false}
          className={inputClass}
        />
      </form>
      <p className="mt-2 text-xs text-ink-400">
        {repo ? (
          <>
            Compte : <strong className="text-ink-200">{repo.owner}</strong> · dépôt <strong className="text-ink-200">{repo.name}</strong>
          </>
        ) : (
          'Format : propriétaire/dépôt, ou l’adresse github.com du dépôt.'
        )}
      </p>
    </div>
  )
}

function RepoLine({ repo }: { repo: RepoRef }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <Avatar login={repo.owner} size={28} />
      <span className="truncate font-medium text-ink-100 select-text">{repoSlug(repo)}</span>
    </span>
  )
}

interface PublisherFormProps {
  ctx: UsageContext
  initialRepo: RepoRef
  submitLabel: string
  onDone: (result: RoleSuccess) => void
  onCancel?: () => void
}

/** Dépôt + compte GitHub : le compte connecté doit pouvoir publier sur le dépôt. */
function PublisherForm({ ctx, initialRepo, submitLabel, onDone, onCancel }: PublisherFormProps) {
  const [repoInput, setRepoInput] = useState(repoSlug(initialRepo))
  const [error, setError] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const result = await ctx.api.becomePublisher(repoInput)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      setNeedsLogin(result.needsLogin)
      return
    }
    setNeedsLogin(false)
    await ctx.onApplied(result)
    onDone(result)
  }

  return (
    <div className="space-y-6">
      <div>
        <Label>Dépôt GitHub des modpacks</Label>
        <RepoField value={repoInput} onChange={setRepoInput} onSubmit={() => void submit()} />
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          L’application y lit les modpacks, et le Studio y publie leurs releases. Les récepteurs suivent par défaut{' '}
          {repoSlug(APP_REPO)} ; si tu publies ailleurs, tes joueurs choisiront ton dépôt dans leurs paramètres.
        </p>
      </div>
      <div>
        <Label>Compte GitHub</Label>
        <GitHubAccount
          api={ctx.api}
          openLink={ctx.openLink}
          promptLogin={needsLogin}
          onChange={(status) => {
            ctx.onAccountChange?.(status)
            // Après une connexion demandée par la vérification, on la relance d'elle-même.
            if (needsLogin && status.account) void submit()
          }}
        />
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          Ce compte doit pouvoir publier sur le dépôt (propriétaire ou collaborateur) : c’est ce qui atteste qu’il s’agit bien de toi.
        </p>
      </div>
      {error && (
        <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-400/25 select-text">{error}</p>
      )}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
        )}
        <Button
          variant="primary"
          icon={busy ? LoaderCircle : undefined}
          disabled={busy || !parseRepo(repoInput)}
          onClick={() => void submit()}
          className={busy ? '[&_svg]:animate-spin' : ''}
        >
          {busy ? 'Vérification sur GitHub…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}

function RoleCard({
  icon: Icon,
  title,
  badge,
  selected,
  onSelect,
  children
}: {
  icon: LucideIcon
  title: string
  badge?: string
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col rounded-3xl p-6 text-left ring-1 transition ${
        selected ? 'bg-grass-400/[0.08] ring-2 ring-grass-400/60' : 'bg-ink-850 ring-tint/[0.07] hover:bg-ink-800'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex size-11 items-center justify-center rounded-2xl ${selected ? 'bg-grass-400 text-ink-950' : 'bg-tint/[0.07] text-ink-200'}`}>
          <Icon size={22} />
        </span>
        <span className="font-display text-xl font-bold text-ink-100">{title}</span>
        {badge && (
          <span className="rounded-md bg-tint/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-200 uppercase">{badge}</span>
        )}
        <span className={`ml-auto flex size-5 items-center justify-center rounded-full ring-2 ${selected ? 'ring-grass-400' : 'ring-ink-500'}`}>
          {selected && <span className="size-2.5 rounded-full bg-grass-400" />}
        </span>
      </div>
      <div className="mt-4 text-sm leading-relaxed text-ink-300">{children}</div>
    </button>
  )
}

/** Contexte de la fenêtre : un changement de rôle fait basculer la vue (voir `applyRoleResult`). */
function usePlayerContext(): UsageContext {
  const applyRoleResult = useStore((s) => s.applyRoleResult)
  const pushToast = useStore((s) => s.pushToast)
  const openStudio = useStore((s) => s.openStudio)
  return useMemo(
    () => ({
      api: window.api,
      openLink: (url: string) => void window.api.openExternal(url),
      onApplied: async (result: RoleSuccess) => {
        await applyRoleResult(result)
        // Dépôt ou compte changés : le Studio, s'il a déjà été ouvert, relit GitHub.
        refreshStudioIfOpen({ remote: true })
      },
      notify: pushToast,
      openStudio,
      onAccountChange: () => refreshStudioIfOpen({ remote: true })
    }),
    [applyRoleResult, pushToast, openStudio]
  )
}

/** Premier lancement (juste après l'installation) : récepteur ou publieur. */
export function SetupView() {
  const settings = useStore((s) => s.settings)!
  const ctx = usePlayerContext()
  const [role, setRole] = useState<UserRole>('receiver')
  const [busy, setBusy] = useState(false)

  async function continueAsReceiver() {
    setBusy(true)
    const result = await ctx.api.becomeReceiver(null)
    setBusy(false)
    if (result.ok) await ctx.onApplied(result)
    else ctx.notify({ kind: 'error', title: 'Impossible de continuer', message: result.error })
  }

  return (
    <div className="animate-rise mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center px-8 py-12">
      <header className="text-center">
        <div className="relative mx-auto w-fit">
          <div className="absolute inset-0 scale-150 rounded-full bg-grass-400/20 blur-3xl" />
          <Logo size={72} className="relative drop-shadow-2xl" />
        </div>
        <h1 className="mt-6 font-display text-4xl font-bold tracking-tight">Bienvenue dans {APP_NAME}</h1>
        <p className="mt-3 text-ink-300">
          Comment vas-tu utiliser l’application ? Tu pourras changer d’avis à tout moment dans les paramètres.{' '}
          <button
            type="button"
            onClick={() => showDocs('presentation', 'deux-rôles')}
            className="font-semibold text-grass-300 transition hover:text-grass-400"
          >
            En savoir plus
          </button>
        </p>
      </header>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <RoleCard icon={Download} title="Récepteur" badge="Par défaut" selected={role === 'receiver'} onSelect={() => setRole('receiver')}>
          J’installe les modpacks publiés et je joue. L’application les ajoute à CurseForge et les garde à jour.
          <span className="mt-4 flex min-w-0 items-center gap-2 text-xs text-ink-400">
            <span className="shrink-0 whitespace-nowrap">Modpacks de</span> <RepoLine repo={settings.repo} />
          </span>
        </RoleCard>
        <RoleCard icon={CloudUpload} title="Publieur" selected={role === 'publisher'} onSelect={() => setRole('publisher')}>
          Je crée des modpacks et je les publie sur mon dépôt GitHub avec le Studio. Je peux aussi les installer
          comme un récepteur.
        </RoleCard>
      </div>

      {role === 'receiver' ? (
        <div className="mt-8 flex justify-end">
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void continueAsReceiver()}>
            Continuer
          </Button>
        </div>
      ) : (
        <div className="animate-rise mt-6 rounded-3xl bg-ink-850 p-7 ring-1 ring-tint/[0.07]">
          <PublisherForm
            ctx={ctx}
            initialRepo={settings.repo}
            submitLabel="Devenir publieur"
            onDone={() =>
              ctx.notify({
                kind: 'success',
                title: 'Mode publieur activé',
                message: 'Tu es dans le Studio : il range tes zips et les publie sur ton dépôt. La bibliothèque reste accessible en haut.'
              })
            }
          />
        </div>
      )}
    </div>
  )
}

/**
 * Rappel avant de suivre un autre dépôt que celui de l'application : un modpack, ce sont des mods, du code qui
 * s'exécute quand on joue. L'app vérifie que les fichiers reçus sont bien ceux publiés, pas ce qu'ils font.
 */
function OtherRepoWarning({ value }: { value: string }) {
  const repo = parseRepo(value)
  if (!repo || sameRepo(repo, APP_REPO)) return null
  return (
    <div className="mt-3 flex gap-2.5 rounded-xl bg-amber-glow/10 px-3.5 py-3 text-xs leading-relaxed text-amber-glow ring-1 ring-inset ring-amber-glow/25">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
      <p>
        Les modpacks de ce dépôt sont publiés par <strong className="font-semibold">{repo.owner}</strong>, pas par{' '}
        {repoSlug(APP_REPO)}. Un modpack contient des mods, c’est-à-dire du code qui s’exécute sur ton PC quand tu
        joues : ne suis que le dépôt d’une personne en qui tu as confiance.
      </p>
    </div>
  )
}

/** Section « Utilisation » des paramètres : rôle, dépôt et compte GitHub (application et studio). */
export function UsageSection({ ctx, settings }: { ctx: UsageContext; settings: Pick<Settings, 'role' | 'repo'> }) {
  const [editing, setEditing] = useState<'publisher' | 'source' | null>(null)
  const [source, setSource] = useState(repoSlug(settings.repo))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const publisher = settings.role === 'publisher'

  async function becomeReceiver(repo: string | null) {
    setBusy(true)
    setError(null)
    const result = await ctx.api.becomeReceiver(repo)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await ctx.onApplied(result)
    setEditing(null)
    ctx.notify({ kind: 'success', title: repo ? 'Source des modpacks changée' : 'Tu es maintenant récepteur' })
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl bg-ink-950/60 p-1 ring-1 ring-inset ring-tint/[0.06]">
        {(
          [
            { value: 'receiver', label: 'Récepteur', icon: Download },
            { value: 'publisher', label: 'Publieur', icon: CloudUpload }
          ] as const
        ).map((tab) => {
          const active = tab.value === 'publisher' ? publisher || editing === 'publisher' : !publisher && editing !== 'publisher'
          return (
            <button
              key={tab.value}
              type="button"
              disabled={busy}
              onClick={() => {
                if (tab.value === 'publisher' && !publisher) setEditing('publisher')
                else if (tab.value === 'receiver' && publisher) void becomeReceiver(null)
                else if (tab.value === 'receiver') setEditing(null)
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                active ? 'bg-tint/10 text-ink-100' : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              <tab.icon size={15} /> {tab.label}
            </button>
          )
        })}
      </div>

      {editing === 'publisher' ? (
        <PublisherForm
          ctx={ctx}
          initialRepo={settings.repo}
          submitLabel={publisher ? 'Enregistrer' : 'Devenir publieur'}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null)
            ctx.notify({ kind: 'success', title: publisher ? 'Dépôt mis à jour' : 'Mode publieur activé' })
          }}
        />
      ) : publisher ? (
        <>
          <div>
            <Label>Dépôt GitHub des modpacks</Label>
            <div className="flex items-center justify-between gap-3">
              <RepoLine repo={settings.repo} />
              <Button size="sm" variant="ghost" icon={PencilLine} onClick={() => setEditing('publisher')}>
                Changer
              </Button>
            </div>
          </div>
          <div>
            <Label>Compte GitHub</Label>
            <GitHubAccount api={ctx.api} openLink={ctx.openLink} onChange={ctx.onAccountChange} />
          </div>
          {ctx.openStudio && (
            <Button icon={CloudUpload} onClick={ctx.openStudio}>
              Aller au Studio
            </Button>
          )}
        </>
      ) : editing === 'source' ? (
        <div>
          <Label>Suivre les modpacks du dépôt</Label>
          <RepoField value={source} onChange={setSource} onSubmit={() => void becomeReceiver(source)} />
          <OtherRepoWarning value={source} />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {!sameRepo(settings.repo, APP_REPO) && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void becomeReceiver(repoSlug(APP_REPO))}>
                Revenir à {repoSlug(APP_REPO)}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
              Annuler
            </Button>
            <Button size="sm" variant="primary" disabled={busy || !parseRepo(source)} onClick={() => void becomeReceiver(source)}>
              {busy ? 'Vérification…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Label>Modpacks de</Label>
          <div className="flex items-center justify-between gap-3">
            <RepoLine repo={settings.repo} />
            <Button
              size="sm"
              variant="ghost"
              icon={PencilLine}
              onClick={() => {
                setSource(repoSlug(settings.repo))
                setEditing('source')
              }}
            >
              Changer
            </Button>
          </div>
        </div>
      )}
      {error && editing !== 'publisher' && <p className="text-sm text-red-300 select-text">{error}</p>}
    </div>
  )
}

/** Section « Utilisation » de l'application des joueurs. */
export function PlayerUsageSection() {
  const settings = useStore((s) => s.settings)
  const ctx = usePlayerContext()
  return settings ? <UsageSection ctx={ctx} settings={settings} /> : null
}
