// Bibliothèque : mods, packs de ressources et shaders publiés dans le dépôt suivi, et leur ajout aux profils installés
// par l'application (seulement ceux-là : leur marqueur garde la trace de l'ajout, qui survit aux mises à jour).
import { useState } from 'react'
import { Check, Image, Blocks, Plus, RefreshCw, Sun, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LOADER_LABELS } from '../../../shared/content'
import { incompatibility } from '../../../shared/contentReleases'
import type { ContentItem, ContentRelease, CurseForgeProfile, InstalledExtra } from '../../../shared/types'
import { formatBytes, formatRelative } from '../lib/format'
import { useStore } from '../store'
import { Modal, Spinner } from '../studio/Modal'
import { Button } from './Button'
import { Cover } from './Cover'
import { Notes } from './Notes'

const SECTIONS: Array<{ kind: ContentRelease['kind']; title: string; icon: LucideIcon }> = [
  { kind: 'mod', title: 'Mods', icon: Blocks },
  { kind: 'resourcepack', title: 'Packs de ressources', icon: Image },
  { kind: 'shader', title: 'Shaders', icon: Sun }
]

const BADGES: Record<string, string> = { mod: 'Mod', resourcepack: 'Pack de ressources', shader: 'Shader' }

function versionLabel(release: ContentRelease): string {
  return release.kind === 'mod' ? release.version : `v${release.version}`
}

function releaseMeta(release: ContentRelease): string {
  const loaders = release.loaders.filter((l) => !(l === 'quilt' && release.loaders.includes('fabric'))).map((l) => LOADER_LABELS[l])
  return [release.minecraftVersions.length ? `Minecraft ${release.minecraftVersions.join(', ')}` : null, loaders.join(', ') || null].filter(Boolean).join(' · ')
}

/** Les ajouts de ce contenu dans les profils installés par l'application, par dossier de profil. */
function useExtrasOf(item: ContentItem): Map<string, InstalledExtra> {
  const installed = useStore((s) => s.installed)
  const map = new Map<string, InstalledExtra>()
  for (const pack of installed) {
    const extra = pack.extras.find((e) => e.kind === item.kind && e.id === item.id)
    if (extra) map.set(pack.instancePath.toLowerCase(), extra)
  }
  return map
}

function ContentCard({ item, index, onOpen }: { item: ContentItem; index: number; onOpen: () => void }) {
  const extras = useExtrasOf(item)
  const latest = item.latest
  return (
    <button
      type="button"
      onClick={onOpen}
      className="animate-rise group flex gap-4 rounded-2xl bg-ink-850 p-4 text-left ring-1 ring-tint/[0.06] transition hover:-translate-y-0.5 hover:ring-tint/15"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-tint/10">
        <Cover id={item.id} name={latest.name} url={latest.coverUrl} className="absolute inset-0" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate font-display text-lg font-semibold tracking-tight text-ink-100">{latest.name}</h3>
          <span className="shrink-0 text-xs font-semibold text-ink-400">{versionLabel(latest)}</span>
        </div>
        {latest.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-300">{latest.description}</p>}
        <p className="mt-1.5 text-xs text-ink-400">
          {[releaseMeta(latest), `publié ${formatRelative(latest.publishedAt)}`].filter(Boolean).join(' · ')}
        </p>
        {extras.size > 0 && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-grass-300">
            <Check size={12} strokeWidth={3} /> Dans {extras.size} profil{extras.size > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </button>
  )
}

/** Sections de la Bibliothèque pour les contenus qui ne sont pas des modpacks (aucune si rien n'est publié). */
export function ContentSections() {
  const contents = useStore((s) => s.catalog?.contents ?? [])
  const [open, setOpen] = useState<{ kind: string; id: string } | null>(null)
  const opened = open ? contents.find((c) => c.kind === open.kind && c.id === open.id) : null
  return (
    <>
      {SECTIONS.map(({ kind, title, icon: Icon }) => {
        const items = contents.filter((c) => c.kind === kind)
        if (!items.length) return null
        return (
          <section key={kind} className="px-8 pb-12">
            <div className="mb-5 flex items-baseline gap-3">
              <Icon size={20} className="self-center text-ink-400" />
              <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
              <span className="text-sm text-ink-400">{items.length}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-4">
              {items.map((item, index) => (
                <ContentCard key={item.id} item={item} index={index} onOpen={() => setOpen({ kind: item.kind, id: item.id })} />
              ))}
            </div>
          </section>
        )
      })}
      {opened && <ContentDialog item={opened} onClose={() => setOpen(null)} />}
    </>
  )
}

function ProfileRow({ profile, release, extra }: { profile: CurseForgeProfile; release: ContentRelease; extra: InstalledExtra | null }) {
  const pushToast = useStore((s) => s.pushToast)
  const refreshLocal = useStore((s) => s.refreshLocal)
  const [busy, setBusy] = useState(false)
  const problem = release.files.every((f) => incompatibility(release.kind, f, profile)) ? incompatibility(release.kind, release.files[0], profile) : null
  const same = extra?.version === release.version

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setBusy(true)
    try {
      const result = await action()
      if (result.ok) pushToast({ kind: 'success', title: success, message: release.kind === 'mod' ? 'Il sera chargé au prochain lancement du profil.' : undefined })
      else pushToast({ kind: 'error', title: 'Opération impossible', message: result.error })
    } finally {
      setBusy(false)
      await refreshLocal()
    }
  }

  return (
    <li className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink-100">{profile.name}</p>
        <p className="mt-0.5 text-xs text-ink-400">
          {[profile.minecraftVersion && `Minecraft ${profile.minecraftVersion}`, profile.modLoader].filter(Boolean).join(' · ')}
          {extra && <span className="text-grass-300"> · {release.kind === 'mod' ? extra.version : `v${extra.version}`} ajoutée</span>}
          {problem && <span className="text-amber-glow"> · {problem}</span>}
        </p>
      </div>
      {busy ? (
        <Spinner />
      ) : (
        <div className="flex shrink-0 gap-2">
          {extra && (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void run(() => window.api.removeExtra(profile.path, release.kind, release.id), `Retiré de ${profile.name}`)}>
              Retirer
            </Button>
          )}
          {!same && !problem && (
            <Button
              size="sm"
              variant={extra ? 'secondary' : 'primary'}
              icon={extra ? RefreshCw : Plus}
              onClick={() => void run(() => window.api.installExtra(profile.path, release.kind, release.id, release.version), `${release.name} ${extra ? 'mis à jour' : 'ajouté'} dans ${profile.name}`)}
            >
              {extra ? 'Installer cette version' : 'Ajouter'}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** La fiche d'un contenu : ses versions, ses notes, et les profils où l'ajouter. */
function ContentDialog({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const profiles = useStore((s) => s.profiles)
  const installed = useStore((s) => s.installed)
  const extras = useExtrasOf(item)
  const [version, setVersion] = useState(item.latest.version)
  const release = item.versions.find((v) => v.version === version) ?? item.latest
  // Seulement les profils installés par l'application : les autres ne sont jamais modifiés.
  const ours = profiles.filter((p) => p.installedPack && installed.some((i) => i.instancePath.toLowerCase() === p.path.toLowerCase()))
  const size = release.files.reduce((sum, f) => sum + f.size, 0)

  return (
    <Modal title={release.name} subtitle={`${BADGES[item.kind]} · ${versionLabel(release)} · ${formatBytes(size)}`} onClose={onClose} width="max-w-3xl">
      <div className="space-y-6">
        <div className="flex gap-5">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl ring-1 ring-tint/10">
            <Cover id={item.id} name={release.name} url={release.coverUrl} className="absolute inset-0" />
          </div>
          <div className="min-w-0 text-sm">
            {release.description && <p className="text-ink-200">{release.description}</p>}
            <p className="mt-1.5 text-ink-400">{releaseMeta(release)}</p>
            {item.versions.length > 1 && (
              <label className="mt-3 flex items-center gap-2 text-ink-300">
                Version
                <select
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="rounded-lg bg-ink-950/60 px-2 py-1 text-sm text-ink-100 ring-1 ring-tint/10 outline-none"
                >
                  {item.versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      {versionLabel(v)}
                      {v === item.latest ? ' (la plus récente)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-ink-400 uppercase">Ajouter à un profil</p>
          {item.kind === 'shader' && <p className="mb-2 text-xs text-ink-400">Un shader ne s’affiche qu’avec Iris ou OptiFine dans le profil.</p>}
          {ours.length ? (
            <ul className="divide-y divide-tint/[0.05]">
              {ours.map((profile) => (
                <ProfileRow key={profile.path} profile={profile} release={release} extra={extras.get(profile.path.toLowerCase()) ?? null} />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-tint/[0.04] px-4 py-3 text-sm text-ink-300">
              Aucun profil installé par l’application. Installe d’abord un modpack : les ajouts ne vont que dans les profils qu’elle a
              installés, où ils sont gardés à chaque mise à jour du modpack.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-ink-400 uppercase">Notes de la {versionLabel(release)}</p>
          <Notes markdown={release.notes} />
        </div>
      </div>
    </Modal>
  )
}
