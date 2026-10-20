import type { ReactNode } from 'react'
import { CloudUpload, LifeBuoy, RefreshCw, WifiOff } from 'lucide-react'
import { showDocs } from '../docs/store'
import { useStore } from '../store'
import { Button } from './Button'
import { Logo } from './Logo'

export function LoadingView() {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <div className="skeleton mx-8 mt-6 h-[min(56vh,560px)] rounded-[28px]" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6 px-8 pt-10">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl bg-ink-850 ring-1 ring-white/[0.06]">
            <div className="skeleton aspect-[16/9]" />
            <div className="space-y-3 p-5">
              <div className="skeleton h-5 w-2/3 rounded-md" />
              <div className="skeleton h-4 w-1/2 rounded-md" />
              <div className="skeleton h-11 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="animate-rise flex min-h-[70vh] flex-col items-center justify-center px-8 text-center">{children}</div>
  )
}

export function EmptyView() {
  const refresh = useStore((s) => s.refresh)
  const refreshing = useStore((s) => s.refreshing)
  const publisher = useStore((s) => s.settings?.role === 'publisher')
  const openStudio = useStore((s) => s.openStudio)
  return (
    <CenteredMessage>
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-grass-400/20 blur-3xl" />
        <Logo size={96} className="relative drop-shadow-2xl" />
      </div>
      <h2 className="mt-8 font-display text-3xl font-bold tracking-tight">Aucun modpack pour le moment</h2>
      <p className="mt-3 max-w-md text-ink-300">
        {publisher
          ? 'Ton dépôt ne contient encore aucun modpack. Publie le premier avec le Studio.'
          : 'Dès qu’un nouveau modpack sera publié, il apparaîtra ici. Tu pourras l’installer en un clic.'}
      </p>
      <div className="mt-8 flex gap-3">
        {publisher && (
          <Button variant="primary" icon={CloudUpload} onClick={openStudio}>
            Ouvrir le Studio
          </Button>
        )}
        <Button icon={RefreshCw} disabled={refreshing} onClick={() => void refresh(true)}>
          Actualiser
        </Button>
      </div>
    </CenteredMessage>
  )
}

export function ErrorView({ message }: { message: string }) {
  const refresh = useStore((s) => s.refresh)
  const refreshing = useStore((s) => s.refreshing)
  return (
    <CenteredMessage>
      <div className="flex size-20 items-center justify-center rounded-3xl bg-amber-glow/10 text-amber-glow ring-1 ring-amber-glow/30">
        <WifiOff size={36} />
      </div>
      <h2 className="mt-8 font-display text-3xl font-bold tracking-tight">Impossible de charger les modpacks</h2>
      <p className="mt-3 max-w-md text-ink-300">{message}</p>
      <div className="mt-8 flex gap-3">
        <Button variant="primary" icon={RefreshCw} disabled={refreshing} onClick={() => void refresh(true)}>
          Réessayer
        </Button>
        <Button variant="ghost" icon={LifeBuoy} onClick={() => showDocs('depannage', 'liste-des-modpacks')}>
          Aide au dépannage
        </Button>
      </div>
    </CenteredMessage>
  )
}
