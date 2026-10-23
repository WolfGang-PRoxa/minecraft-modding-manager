// Mises à jour automatiques d'un modpack, sur sa carte : rythme et dernier passage, passage immédiat, essai prêt à
// valider (ou qui a échoué), et la fenêtre de réglages (fréquence, bêtas, publication automatique, mods figés).
import { useEffect, useMemo, useState } from 'react'
import { Bot, Check, FolderOpen, Pin, Search, Square, Trash2, Upload, X } from 'lucide-react'
import type { MaintenanceRecord, PackMaintenance, PackUpdates, PackView, UpdateFrequency, ZipMod } from '../../../shared/studio'
import { Button } from '../components/Button'
import { Toggle } from '../components/Toggle'
import { formatDate } from '../lib/format'
import { useMaintenance } from './maintenanceStore'
import { Field, Modal, Spinner, TextInput } from './Modal'
import { openPath, useStudio } from './store'

export const FREQUENCIES: Array<{ value: UpdateFrequency; label: string; hint: string }> = [
  { value: 'weekly', label: 'Chaque semaine', hint: '' },
  { value: 'biweekly', label: 'Toutes les deux semaines', hint: '' },
  { value: 'monthly', label: 'Chaque mois', hint: '' },
  { value: 'manual', label: 'À la demande', hint: 'Seulement quand tu le lances (ici, ou en demandant à Claude).' },
  { value: 'never', label: 'Jamais', hint: 'Pas même quand tous les modpacks sont mis à jour d’un coup.' }
]

const frequencyLabel = (f: UpdateFrequency) => FREQUENCIES.find((x) => x.value === f)!.label.toLowerCase()

function usePackMaintenance(folder: string): PackMaintenance | null {
  return useMaintenance((s) => s.status?.packs.find((p) => p.folder === folder) ?? null)
}

/** Les lignes d'une liste, coupée au-delà de `max`. */
function Lines({ lines, max = 6 }: { lines: string[]; max?: number }) {
  if (!lines.length) return null
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-ink-300">
      {lines.slice(0, max).map((line) => (
        <li key={line} className="truncate" title={line}>
          · {line}
        </li>
      ))}
      {lines.length > max && <li className="text-ink-400">et {lines.length - max} autre{lines.length - max > 1 ? 's' : ''}…</li>}
    </ul>
  )
}

/** L'essai en attente : prêt à valider, ou qui a échoué aux tests. */
function PendingTrial({ pack, record }: { pack: PackView; record: MaintenanceRecord }) {
  const validate = useMaintenance((s) => s.validate)
  const discard = useMaintenance((s) => s.discard)
  const busy = useMaintenance((s) => s.running !== null)
  const ready = record.outcome === 'ready'
  const targets = [pack.github && 'GitHub', pack.curseforge && 'CurseForge'].filter(Boolean).join(' et ')
  return (
    <div className={`mt-3 rounded-xl p-3.5 ring-1 ring-inset ${ready ? 'bg-grass-400/[0.07] ring-grass-400/25' : 'bg-red-500/[0.07] ring-red-400/25'}`}>
      <p className={`text-sm font-semibold ${ready ? 'text-grass-300' : 'text-red-300'}`}>
        {ready ? 'Mise à jour prête, à valider' : 'La mise à jour échoue aux tests'}
      </p>
      <p className="mt-0.5 text-xs text-ink-300">{record.message}</p>
      <Lines lines={record.changes} />
      {record.manual.length > 0 && (
        <p className="mt-2 text-xs text-amber-glow" title={record.manual.join('\n')}>
          {record.manual.length} à faire dans CurseForge (téléchargement réservé à CurseForge).
        </p>
      )}
      {(record.warnings?.length ?? 0) > 0 && (
        <div className="mt-2 rounded-lg bg-amber-glow/10 p-2.5 text-xs text-amber-glow ring-1 ring-inset ring-amber-glow/25">
          <p className="font-semibold">À regarder avant de publier</p>
          <ul className="mt-1 space-y-0.5 text-ink-200">
            {record.warnings!.map((w) => (
              <li key={w} className="break-words select-text">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
      {record.claude && (
        <div className="mt-3 flex gap-2 rounded-lg bg-ink-950/50 p-2.5 text-xs text-ink-200">
          <Bot size={14} className="mt-0.5 shrink-0 text-ink-400" />
          <p className="whitespace-pre-wrap select-text">{record.claude}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {ready ? (
          <>
            <Button size="sm" variant="primary" icon={Upload} disabled={busy} onClick={() => void validate(pack.folder, true)}>
              Créer la v{pack.nextVersion} et publier{targets ? ` sur ${targets}` : ''}
            </Button>
            <Button size="sm" icon={Check} disabled={busy} onClick={() => void validate(pack.folder, false)}>
              Créer sans publier
            </Button>
          </>
        ) : (
          <Button size="sm" icon={Check} disabled={busy} title="Crée la version sans la publier : vérifie-la toi-même avant." onClick={() => void validate(pack.folder, false)}>
            Valider quand même
          </Button>
        )}
        {record.trialPath && (
          <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => openPath(record.trialPath!)}>
            Voir l’essai
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => void discard(pack.folder)}>
          Abandonner
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        L’essai « {record.trialPath?.split(/[\\/]/).pop()} » est dans CurseForge après sa relance : tu peux y jouer avant de décider.
      </p>
    </div>
  )
}

/** Dernier passage terminé, en une ligne. */
function LastRun({ record }: { record: MaintenanceRecord }) {
  const tone = record.outcome === 'failed' ? 'text-red-300' : record.outcome === 'manual' ? 'text-amber-glow' : 'text-ink-400'
  return (
    <p className={`mt-1 text-xs ${tone}`} title={[...record.changes, ...record.manual].join('\n') || undefined}>
      Dernier passage le {formatDate(record.at)} : {record.message}
    </p>
  )
}

/** Sur la carte : les mises à jour automatiques du modpack. */
export function UpdatesLine({ pack }: { pack: PackView }) {
  const info = usePackMaintenance(pack.folder)
  const running = useMaintenance((s) => s.running)
  const step = useMaintenance((s) => s.step)
  const run = useMaintenance((s) => s.run)
  const openDialog = useStudio((s) => s.openDialog)
  const updates = info?.updates ?? pack.updates
  const last = info?.last ?? null
  const pending = last && (last.outcome === 'ready' || last.outcome === 'failed') && last.trialPath ? last : null
  const mine = running === pack.folder

  return (
    <div className="mt-1.5 text-sm text-ink-300">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="size-1.5 shrink-0 rounded-full bg-sky-400" />
        <span>
          Mises à jour {frequencyLabel(updates.frequency)}
          {info?.dueAt && updates.frequency !== 'manual' && updates.frequency !== 'never' ? ` · prochaine le ${formatDate(info.dueAt)}` : ''}
          {updates.autoPublish ? ' · publiées seules' : ''}
        </span>
        <button type="button" className="text-xs font-semibold text-grass-300 hover:text-grass-400" onClick={() => openDialog({ kind: 'updates', folder: pack.folder })}>
          Réglages
        </button>
        {!mine && !pending && (
          <button
            type="button"
            disabled={running !== null}
            className="text-xs font-semibold text-grass-300 hover:text-grass-400 disabled:opacity-40"
            onClick={() => void run(pack.folder)}
          >
            Rechercher maintenant
          </button>
        )}
      </p>
      {mine && (
        <p className="mt-1.5 flex items-center gap-2 text-xs text-ink-200">
          <Spinner size={13} /> {step ?? 'Recherche des mises à jour…'}
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-ink-400 hover:text-ink-200" onClick={() => void window.studio.cancelMaintenance()}>
            <Square size={11} /> Arrêter
          </button>
        </p>
      )}
      {pending && !mine ? <PendingTrial pack={pack} record={pending} /> : last && !mine && <LastRun record={last} />}
    </div>
  )
}

/** Mods du zip le plus récent du modpack, pour choisir ceux à figer. */
function useLatestMods(pack: PackView | null): ZipMod[] | null {
  const [mods, setMods] = useState<ZipMod[] | null>(null)
  const folder = pack?.folder ?? null
  const latest = pack?.versions[0]?.fileName ?? null
  useEffect(() => {
    if (!folder || !latest) return setMods([])
    let alive = true
    void window.studio.getZipContents(folder, latest).then(
      (contents) => alive && setMods(contents.mods.filter((m) => m.addonId !== null)),
      () => alive && setMods([])
    )
    return () => {
      alive = false
    }
  }, [folder, latest])
  return mods
}

/** Réglages des mises à jour automatiques d'un modpack. */
export function UpdatesDialog({ folder }: { folder: string }) {
  const pack = useStudio((s) => s.overview?.packs.find((p) => p.folder === folder) ?? null)
  const close = useStudio((s) => s.closeDialog)
  const run = useStudio((s) => s.run)
  const [updates, setUpdates] = useState<PackUpdates | null>(pack?.updates ?? null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const mods = useLatestMods(pack)
  const pinnedIds = useMemo(() => new Set(updates?.pinned.map((p) => p.projectId)), [updates])
  if (!pack || !updates) return null

  const set = (changes: Partial<PackUpdates>) => setUpdates({ ...updates, ...changes })
  const q = query.trim().toLowerCase()
  const candidates = (mods ?? [])
    .filter((m) => !pinnedIds.has(m.addonId!) && (!q || [m.name, m.fileName].some((v) => v?.toLowerCase().includes(q))))
    .slice(0, 8)

  async function save() {
    setBusy(true)
    const ok = await run(
      window.studio.configureUpdates(folder, updates!).then((r) => (r.ok ? { ok: true as const } : r)),
      'Mises à jour automatiques enregistrées'
    )
    setBusy(false)
    if (ok) close()
  }

  return (
    <Modal
      title="Mises à jour automatiques"
      subtitle={`Pour « ${pack.name} » : chaque passage cherche les mises à jour de son profil CurseForge (même version de Minecraft, même chargeur), les essaie sur une copie, puis les teste.`}
      onClose={close}
      closable={!busy}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-ink-400 uppercase">Fréquence</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {FREQUENCIES.map((f) => (
              <label
                key={f.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset ${updates.frequency === f.value ? 'bg-grass-400/10 ring-grass-400/40' : 'ring-tint/[0.06] hover:bg-tint/[0.04]'}`}
              >
                <input type="radio" name="frequency" className="mt-1 accent-grass-400" checked={updates.frequency === f.value} onChange={() => set({ frequency: f.value })} />
                <span>
                  <span className="block text-sm text-ink-100">{f.label}</span>
                  {f.hint && <span className="block text-xs text-ink-400">{f.hint}</span>}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Les passages automatiques demandent la tâche planifiée : Paramètres → Mises à jour automatiques.
          </p>
        </div>

        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="text-sm font-medium text-ink-100">Accepter les versions bêta des mods</div>
            <div className="mt-0.5 text-xs text-ink-400">Sinon, seulement les versions stables.</div>
          </div>
          <Toggle label="Accepter les versions bêta" checked={updates.channel === 'beta'} onChange={(beta) => set({ channel: beta ? 'beta' : 'release' })} />
        </div>

        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="text-sm font-medium text-ink-100">Publier seul quand les tests passent</div>
            <div className="mt-0.5 text-xs text-ink-400">
              La version est créée et publiée sur{' '}
              {[pack.github && 'GitHub', pack.curseforge && 'CurseForge'].filter(Boolean).join(' et ') || 'ses cibles'} sans t’attendre.
              Sinon, elle attend que tu la valides sur cette carte. Une version envoyée sur CurseForge ne se retire que depuis le site.
            </div>
          </div>
          <Toggle label="Publier seul" checked={updates.autoPublish} onChange={(autoPublish) => set({ autoPublish })} />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold tracking-widest text-ink-400 uppercase">Mods figés</p>
          <p className="mb-2 text-xs text-ink-400">Jamais mis à jour : une version précise gardée exprès.</p>
          {updates.pinned.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {updates.pinned.map((p) => (
                <span key={p.projectId} className="inline-flex items-center gap-1.5 rounded-full bg-tint/[0.07] py-1 pr-1.5 pl-3 text-xs text-ink-100">
                  <Pin size={11} /> {p.name}
                  <button
                    type="button"
                    aria-label={`Ne plus figer ${p.name}`}
                    className="rounded-full p-0.5 text-ink-400 hover:bg-tint/10 hover:text-ink-100"
                    onClick={() => set({ pinned: updates.pinned.filter((x) => x.projectId !== p.projectId) })}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Field label="Figer un mod">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
              <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom du mod" className="pl-8" />
            </div>
          </Field>
          {mods === null ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-ink-400">
              <Spinner size={12} /> Lecture des mods de la dernière version…
            </p>
          ) : q || candidates.length ? (
            <div className="mt-2 flex flex-col">
              {candidates.map((m) => (
                <button
                  key={m.addonId}
                  type="button"
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink-200 hover:bg-tint/[0.06]"
                  onClick={() => set({ pinned: [...updates.pinned, { projectId: m.addonId!, name: m.name ?? m.fileName }] })}
                >
                  <Pin size={12} className="text-ink-400" /> {m.name ?? m.fileName}
                  <span className="truncate text-xs text-ink-500">{m.fileName}</span>
                </button>
              ))}
              {!candidates.length && <p className="px-2.5 py-1.5 text-xs text-ink-400">Aucun mod ne correspond.</p>}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
