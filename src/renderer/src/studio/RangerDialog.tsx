import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import type { RangerOrders, RangerPackPlan, RangerPlan } from '../../../shared/studio'
import { Button, IconButton } from '../components/Button'
import { Modal, Spinner } from './Modal'
import { errorMessage, useStudio } from './store'

function PackPlan({ plan, onMove }: { plan: RangerPackPlan; onMove: (from: number, to: number) => void }) {
  const newOnes = plan.renames.filter((r) => r.kind === 'new')
  return (
    <section>
      <h3 className="mb-2 font-display text-lg font-semibold text-ink-100">{plan.name}</h3>
      <div className="space-y-2">
        {plan.renames.map((rename) => {
          const index = newOnes.indexOf(rename)
          return (
            <div key={rename.from} className="rounded-xl bg-tint/[0.03] px-4 py-3 ring-1 ring-inset ring-tint/[0.05]">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm text-ink-300 select-text" title={rename.from}>
                  {rename.from}
                </span>
                <ArrowRight size={16} className="shrink-0 text-ink-500" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-grass-300 select-text">{rename.to}</span>
                {rename.kind === 'new' ? (
                  <div className="flex shrink-0">
                    <IconButton icon={ArrowUp} label="Plus ancien" size={16} disabled={index === 0} onClick={() => onMove(index, index - 1)} />
                    <IconButton
                      icon={ArrowDown}
                      label="Plus récent"
                      size={16}
                      disabled={index === newOnes.length - 1}
                      onClick={() => onMove(index, index + 1)}
                    />
                  </div>
                ) : (
                  <span className="w-[72px] shrink-0 text-right text-[11px] leading-tight text-ink-500">au nom du dossier</span>
                )}
              </div>
              {rename.warning && (
                <p className="mt-1.5 flex gap-1.5 text-xs text-amber-glow/90">
                  <TriangleAlert size={13} className="mt-px shrink-0" /> {rename.warning}
                </p>
              )}
            </div>
          )
        })}
        {plan.errors.map((error) => (
          <p key={error} className="flex gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-400/20">
            <CircleAlert size={16} className="mt-0.5 shrink-0" /> <span className="select-text">{error}</span>
          </p>
        ))}
      </div>
    </section>
  )
}

export function RangerDialog() {
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [orders, setOrders] = useState<RangerOrders>({})
  const [plan, setPlan] = useState<RangerPlan | null>(null)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.studio
      .getRangerPlan(orders)
      .then((next) => !cancelled && setPlan(next))
      .catch((err: unknown) => pushToast({ kind: 'error', title: 'Lecture du dossier impossible', message: errorMessage(err) }))
    return () => {
      cancelled = true
    }
  }, [orders, pushToast])

  function move(pack: RangerPackPlan, from: number, to: number) {
    const names = pack.renames.filter((r) => r.kind === 'new').map((r) => r.from)
    ;[names[from], names[to]] = [names[to], names[from]]
    setOrders((current) => ({ ...current, [pack.folder]: names }))
  }

  async function apply() {
    setApplying(true)
    try {
      const result = await window.studio.applyRanger(orders)
      if (result.ok) {
        const n = result.renamed ?? 0
        pushToast({
          kind: 'success',
          title: `${n} fichier${n > 1 ? 's' : ''} renommé${n > 1 ? 's' : ''}`,
          message: 'Les nouvelles versions sont prêtes : ajoute leurs notes puis publie.'
        })
        close()
      } else {
        pushToast({ kind: 'error', title: 'Rangement interrompu', message: result.error })
      }
    } catch (err) {
      pushToast({ kind: 'error', title: 'Rangement interrompu', message: errorMessage(err) })
    } finally {
      setApplying(false)
      void refresh()
    }
  }

  const total = plan?.total ?? 0
  return (
    <Modal
      title="Ranger les zips"
      subtitle="Chaque nouveau zip reçoit le numéro de version suivant, du plus ancien au plus récent."
      onClose={close}
      width="max-w-3xl"
      closable={!applying}
      footer={
        <>
          <p className="flex-1 text-xs leading-relaxed text-ink-400">
            Un numéro n’est jamais réutilisé : si tu supprimes un zip, sa version disparaîtra de GitHub à la prochaine publication.
          </p>
          <Button variant="ghost" onClick={close} disabled={applying}>
            {total ? 'Annuler' : 'Fermer'}
          </Button>
          {total > 0 && (
            <Button variant="primary" onClick={() => void apply()} disabled={applying}>
              {applying ? 'Rangement…' : `Renommer ${total} fichier${total > 1 ? 's' : ''}`}
            </Button>
          )}
        </>
      }
    >
      {!plan ? (
        <div className="flex items-center gap-3 py-6 text-ink-300">
          <Spinner /> Lecture du dossier…
        </div>
      ) : plan.packs.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl bg-grass-400/10 px-5 py-4 ring-1 ring-inset ring-grass-400/30">
          <CircleCheck size={22} className="shrink-0 text-grass-400" />
          <p className="font-medium text-ink-100">Tout est déjà rangé.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {plan.packs.map((pack) => (
            <PackPlan key={pack.folder} plan={pack} onMove={(from, to) => move(pack, from, to)} />
          ))}
        </div>
      )}
    </Modal>
  )
}
