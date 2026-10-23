import { ChevronRight, Sparkles } from 'lucide-react'
import type { Modpack } from '../../../shared/types'
import { formatRelative } from '../lib/format'
import { useStore } from '../store'
import { PackBadges, VersionMeta } from './Badges'
import { Button } from './Button'
import { Cover } from './Cover'
import { InstallButton } from './InstallButton'
import { Notes } from './Notes'

export function Hero({ modpack }: { modpack: Modpack }) {
  const select = useStore((s) => s.select)
  const latest = modpack.latest

  return (
    <section className="animate-rise relative mx-8 mt-6 overflow-hidden rounded-[calc(var(--radius-4xl)*0.875)] ring-1 ring-tint/[0.07]">
      <Cover
        id={latest.id}
        name={latest.name}
        url={latest.coverUrl}
        className="absolute inset-0"
        imgClassName="animate-kenburns"
        align="right"
      />
      <div className="absolute inset-0 bg-linear-to-r from-ink-950/95 via-ink-950/70 to-ink-950/10" />
      <div className="absolute inset-0 bg-linear-to-t from-ink-900 via-transparent to-transparent" />

      <div className="relative flex min-h-[min(56vh,560px)] items-end gap-10 p-10 xl:p-12">
        <div className="max-w-2xl flex-1">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-grass-400/15 px-3 py-1 text-xs font-semibold tracking-wide text-grass-300 uppercase ring-1 ring-inset ring-grass-400/30">
              <Sparkles size={13} strokeWidth={2.5} />
              Dernière sortie · {formatRelative(latest.publishedAt)}
            </span>
            <PackBadges modpack={modpack} />
          </div>

          <h1 className="font-display text-[clamp(2.75rem,5vw,4.75rem)] leading-[0.95] font-bold tracking-tight text-ink-100 drop-shadow-lg">
            {latest.name}
          </h1>
          <p className="mt-2 font-display text-lg font-medium text-ink-300">Version {latest.version}</p>

          {latest.description && (
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-200">{latest.description}</p>
          )}

          <div className="mt-6">
            <VersionMeta version={latest} />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <InstallButton version={latest} latest={latest} size="lg" />
            <Button variant="ghost" size="lg" onClick={() => select(modpack.id)}>
              Détails et versions
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>

        {latest.notes.trim() && (
          <aside className="hidden w-[380px] shrink-0 self-end rounded-2xl bg-ink-950/55 p-6 ring-1 ring-tint/10 backdrop-blur-xl xl:block">
            <h2 className="mb-3 text-xs font-semibold tracking-widest text-ink-400 uppercase">
              Nouveautés de la v{latest.version}
            </h2>
            <div className="relative max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
              <Notes markdown={latest.notes} />
            </div>
            <button
              type="button"
              onClick={() => select(modpack.id)}
              className="mt-3 text-sm font-semibold text-grass-300 transition hover:text-grass-400"
            >
              Tout lire →
            </button>
          </aside>
        )}
      </div>
    </section>
  )
}
