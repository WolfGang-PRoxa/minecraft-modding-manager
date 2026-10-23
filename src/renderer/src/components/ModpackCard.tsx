import { Info } from 'lucide-react'
import type { Modpack } from '../../../shared/types'
import { formatRelative } from '../lib/format'
import { useStore } from '../store'
import { PackBadges, VersionMeta } from './Badges'
import { IconButton } from './Button'
import { Cover } from './Cover'
import { InstallButton } from './InstallButton'

export function ModpackCard({ modpack, index }: { modpack: Modpack; index: number }) {
  const select = useStore((s) => s.select)
  const latest = modpack.latest

  return (
    <article
      className="animate-rise group flex flex-col overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-tint/[0.06] transition duration-200 hover:-translate-y-1 hover:ring-tint/15 hover:shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)]"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <button type="button" onClick={() => select(modpack.id)} className="relative block aspect-[16/9] text-left">
        <Cover
          id={latest.id}
          name={latest.name}
          url={latest.coverUrl}
          className="absolute inset-0"
          imgClassName="transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-linear-to-t from-ink-850 via-ink-850/10 to-transparent" />
        <div className="absolute top-3 left-3">
          <PackBadges modpack={modpack} onCover />
        </div>
        <span className="absolute top-3 right-3 rounded-lg bg-ink-950/70 px-2 py-1 text-xs font-semibold text-ink-100 backdrop-blur-md">
          v{latest.version}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-4 p-5 pt-3">
        <div>
          <h3 className="font-display text-xl font-semibold tracking-tight text-ink-100">{latest.name}</h3>
          <p className="mt-0.5 text-xs text-ink-400">Publié {formatRelative(latest.publishedAt)}</p>
          {latest.description && <p className="mt-2 line-clamp-2 text-sm text-ink-300">{latest.description}</p>}
        </div>
        <VersionMeta version={latest} withSize={false} />
        <div className="mt-auto flex items-center gap-2">
          <InstallButton version={latest} latest={latest} className="flex-1" />
          <IconButton icon={Info} label="Détails" onClick={() => select(modpack.id)} className="size-11! rounded-xl bg-tint/[0.05]" />
        </div>
      </div>
    </article>
  )
}
