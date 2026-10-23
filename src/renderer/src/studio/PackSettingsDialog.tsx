import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronRight, Eraser, Folder, Minus, Package, Plus, Search, X } from 'lucide-react'
import { DEFAULT_EXCLUSIONS, exclusionMatcher, isInstanceFile, normalizeExclusion } from '../../../shared/exclusions'
import {
  DEFAULT_PACK_SETTINGS,
  matchesDisabledMod,
  type ExcludedInZip,
  type PackSettings,
  type PackView,
  type ZipContents,
  type ZipMod,
  type ZipProgress
} from '../../../shared/studio'
import { Button, IconButton } from '../components/Button'
import { Toggle } from '../components/Toggle'
import { formatBytes } from '../lib/format'
import { Tag } from './ContentsDialog'
import { baseName, buildTree, byName, fileIcon, findFolder } from './fileTree'
import { Modal, ProgressBar, Spinner, TextInput } from './Modal'
import { errorMessage, useStudio } from './store'

export type SettingsTab = 'files' | 'mods' | 'configs'

const panel = 'rounded-2xl bg-ink-950/40 ring-1 ring-inset ring-tint/[0.06]'

const plural = (n: number, singular: string, pluralForm = `${singular}s`) => `${n} ${n > 1 ? pluralForm : singular}`

/** « 12 fichiers exclus dans les réglages (shaderpacks, options.txt) ». */
export function describeExcluded(excluded: ExcludedInZip): string {
  const shown = excluded.paths.slice(0, 3).join(', ') + (excluded.paths.length > 3 ? '…' : '')
  return `${plural(excluded.files, 'fichier')} exclu${excluded.files > 1 ? 's' : ''} dans les réglages (${shown})`
}

/** Zip dont on montre les fichiers et les mods : le dernier déposé, sinon la dernière version. */
function sourceZip(pack: PackView): { fileName: string; label: string } | null {
  const pending = [...pack.pending].reverse().find((zip) => !zip.error)
  if (pending) return { fileName: pending.fileName, label: pending.fileName }
  const version = pack.versions.find((v) => !v.error)
  return version ? { fileName: version.fileName, label: `la v${version.number}` } : null
}

const modFile = (mod: ZipMod) => mod.fileName.replace(/\.disabled$/i, '')

// ---------------------------------------------------------------------------------------------
// Fichiers exclus

type CheckState = 'on' | 'off' | 'mixed'

function Checkbox({ state, disabled, title, onClick }: { state: CheckState; disabled?: boolean; title: string; onClick(): void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-[18px] shrink-0 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${
        state === 'off' ? 'ring-2 ring-inset ring-ink-500 hover:ring-ink-300' : 'bg-grass-500 text-ink-950 hover:bg-grass-400'
      }`}
    >
      {state === 'on' && <Check size={13} strokeWidth={3.5} />}
      {state === 'mixed' && <Minus size={13} strokeWidth={3.5} />}
    </button>
  )
}

function FilesTab({
  settings,
  onChange,
  contents,
  source
}: {
  settings: PackSettings
  onChange(settings: PackSettings): void
  contents: ZipContents | null
  source: { fileName: string; label: string } | null
}) {
  const { exclude } = settings
  const isExcluded = useMemo(() => exclusionMatcher(exclude), [exclude])
  const tree = useMemo(() => (contents ? buildTree(contents.files) : null), [contents])
  const [cwd, setCwd] = useState('')
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)

  // Fichiers exclus dans chaque dossier : une case à moitié cochée dit qu'une partie seulement est publiée.
  const excludedInside = useMemo(() => {
    const counts = new Map<string, number>()
    for (const file of contents?.files ?? []) {
      if (!isExcluded(file.path)) continue
      const parts = file.path.split('/')
      for (let i = 1; i < parts.length; i++) {
        const folder = parts.slice(0, i).join('/')
        counts.set(folder, (counts.get(folder) ?? 0) + 1)
      }
    }
    return counts
  }, [contents, isExcluded])

  const setExclude = (next: string[]) => onChange({ ...settings, exclude: next })
  const ownPattern = (path: string) => exclude.find((p) => p.toLowerCase() === path.toLowerCase())

  function toggle(path: string) {
    const own = ownPattern(path)
    if (own) {
      setExclude(exclude.filter((p) => p !== own))
    } else if (!isExcluded(path)) {
      // Les exclusions plus précises, dans ce dossier, deviennent inutiles.
      const inside = `${path.toLowerCase()}/`
      setExclude([...exclude.filter((p) => !p.toLowerCase().startsWith(inside)), path])
    }
  }

  function add() {
    const path = normalizeExclusion(draft)
    if (!path) {
      setDraftError('Chemin invalide : par exemple shaderpacks, options.txt ou config/*-client.toml.')
      return
    }
    if (isInstanceFile(path)) {
      setDraftError(`${path} est le fichier du profil CurseForge : il est toujours publié.`)
      return
    }
    if (ownPattern(path)) {
      setDraftError('Ce chemin est déjà exclu.')
      return
    }
    setExclude([...exclude, path])
    setDraft('')
    setDraftError(null)
  }

  /** État de la case d'une ligne, et pourquoi elle ne peut pas changer. */
  function rowState(path: string, folder: boolean): { state: CheckState; locked: string | null } {
    if (!folder && isInstanceFile(path)) return { state: 'on', locked: 'Le fichier du profil CurseForge est toujours publié.' }
    const by = isExcluded(path)
    if (by) {
      const own = ownPattern(path)
      return { state: 'off', locked: own ? null : `Exclu avec « ${by} » : retire cette exclusion pour choisir ici.` }
    }
    return { state: folder && excludedInside.get(path) ? 'mixed' : 'on', locked: null }
  }

  const node = tree ? (findFolder(tree, cwd) ?? tree) : null
  const crumbs = cwd ? cwd.split('/') : []
  const patternCount = (pattern: string) => {
    if (!contents) return null
    const matches = exclusionMatcher([pattern])
    return contents.files.filter((file) => matches(file.path)).length
  }

  const row = (path: string, label: string, detail: string, icon: typeof Folder, folder: boolean) => {
    const { state, locked } = rowState(path, folder)
    const Icon = icon
    return (
      <div key={`${folder ? 'd' : 'f'}:${path}`} className="flex items-center gap-3 px-4 py-1.5 transition hover:bg-tint/[0.04]">
        <Checkbox
          state={state}
          disabled={locked !== null}
          title={locked ?? (state === 'off' ? `Publier ${label}` : `Ne pas publier ${label}`)}
          onClick={() => toggle(path)}
        />
        <button
          type="button"
          onClick={() => (folder ? setCwd(path) : locked === null && toggle(path))}
          className={`flex min-w-0 flex-1 items-center gap-2.5 text-left text-sm ${state === 'off' ? 'text-ink-500 line-through' : 'text-ink-200'}`}
          title={label}
        >
          <Icon size={15} className="shrink-0 text-ink-500" />
          <span className="truncate">{label}</span>
        </button>
        <span className="shrink-0 text-xs text-ink-400 tabular-nums">{detail}</span>
        {folder ? <ChevronRight size={14} className="shrink-0 text-ink-500" /> : <span className="w-3.5 shrink-0" />}
      </div>
    )
  }

  return (
    <div className="flex h-full gap-5">
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden ${panel}`}>
        <div className="flex min-h-11 flex-wrap items-center gap-1 border-b border-tint/[0.06] px-3 py-2 text-xs">
          {source && node ? (
            [`Contenu de ${source.label}`, ...crumbs].map((part, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={12} className="text-ink-500" />}
                <button
                  type="button"
                  onClick={() => setCwd(crumbs.slice(0, i).join('/'))}
                  className={`rounded-md px-1.5 py-0.5 transition hover:bg-tint/[0.07] ${i === crumbs.length ? 'font-semibold text-ink-100' : 'text-ink-400'}`}
                >
                  {part}
                </button>
              </span>
            ))
          ) : (
            <span className="px-1 text-ink-400">Contenu du modpack</span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {!source ? (
            <p className="px-5 py-6 text-sm text-ink-400">
              Ce modpack n’a pas encore de zip : ajoute à droite les chemins à exclure, ou crée d’abord une version pour les
              choisir ici.
            </p>
          ) : !node ? (
            <div className="flex h-full items-center justify-center gap-3 text-sm text-ink-300">
              <Spinner className="text-grass-300" /> Lecture du zip…
            </div>
          ) : (
            <>
              {node.folders.map((child) =>
                row(child.path, child.name, `${plural(child.count, 'fichier')} · ${formatBytes(child.size)}`, Folder, true)
              )}
              {node.files.map((file) => row(file.path, baseName(file.path), formatBytes(file.size), fileIcon(file.path), false))}
            </>
          )}
        </div>
      </div>

      <div className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto">
        <div className={`${panel} p-4`}>
          <p className="text-xs font-semibold tracking-widest text-ink-400 uppercase">Exclus · {exclude.length}</p>
          {exclude.length === 0 ? (
            <p className="mt-2 text-sm text-ink-400">Rien pour l’instant : décoche ce que tu ne veux pas publier.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {exclude.map((pattern) => {
                const count = patternCount(pattern)
                return (
                  <li key={pattern} className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-2 hover:bg-tint/[0.04]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs text-ink-100 select-text" title={pattern}>
                        {pattern}
                      </span>
                      {count !== null && (
                        <span className="block text-[11px] text-ink-400">
                          {count ? `${plural(count, 'fichier')} dans ${source?.label}` : `absent de ${source?.label}`}
                        </span>
                      )}
                    </span>
                    <IconButton
                      icon={X}
                      size={15}
                      label={`Publier de nouveau ${pattern}`}
                      onClick={() => setExclude(exclude.filter((p) => p !== pattern))}
                    />
                  </li>
                )
              })}
            </ul>
          )}
          <form
            className="mt-3"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <div className="flex gap-2">
              <TextInput
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setDraftError(null)
                }}
                placeholder="Chemin à exclure"
                className="px-3! py-2! font-mono text-xs"
              />
              <IconButton icon={Plus} label="Exclure ce chemin" type="submit" disabled={!draft.trim()} className="shrink-0 bg-tint/[0.07]" />
            </div>
            {draftError ? (
              <p className="mt-1.5 text-xs text-red-300">{draftError}</p>
            ) : (
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
                Depuis la racine de l’instance. « * » remplace n’importe quels caractères d’un nom, « **/ » n’importe quels
                dossiers : <span className="font-mono">**/*.log</span>.
              </p>
            )}
          </form>
        </div>
        <div className="px-1 text-xs leading-relaxed text-ink-400">
          <p>
            Laissés de côté de toute façon quand tu crées une version depuis CurseForge (données propres à ta partie) :
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-ink-500">{DEFAULT_EXCLUSIONS.join(' · ')}</p>
          <p className="mt-1.5">Tes mondes (saves) sont publiés seulement si tu coches « Inclure les mondes ».</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Mods désactivés

function ModsTab({
  settings,
  onChange,
  contents,
  source
}: {
  settings: PackSettings
  onChange(settings: PackSettings): void
  contents: ZipContents | null
  source: { fileName: string; label: string } | null
}) {
  const [query, setQuery] = useState('')
  const mods = useMemo(
    () => [...(contents?.mods ?? [])].sort((a, b) => byName(a.name ?? a.fileName, b.name ?? b.fileName)),
    [contents]
  )
  const ref = (mod: ZipMod) => ({ addonId: mod.addonId, file: modFile(mod) })
  const offForPlayers = (mod: ZipMod) => settings.disabledMods.some((entry) => matchesDisabledMod(ref(mod), entry))

  function setActive(mod: ZipMod, active: boolean) {
    const others = settings.disabledMods.filter((entry) => !matchesDisabledMod(ref(mod), entry))
    onChange({
      ...settings,
      disabledMods: active ? others : [...others, { addonId: mod.addonId, file: modFile(mod), name: mod.name }]
    })
  }

  const q = query.trim().toLowerCase()
  const shown = q ? mods.filter((mod) => [mod.name, mod.author, mod.fileName].some((v) => v?.toLowerCase().includes(q))) : mods
  // Mods désactivés que le zip affiché ne contient pas (retirés depuis, ou propres à d'autres versions).
  const missing = contents
    ? settings.disabledMods.filter((entry) => !contents.mods.some((mod) => !mod.disabled && matchesDisabledMod(ref(mod), entry)))
    : []

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink-300">
          Un mod désactivé est installé chez les joueurs mais ne se lance pas : chacun peut l’activer dans CurseForge, et son
          choix est gardé d’une mise à jour à l’autre.
        </p>
        <label className="flex h-10 w-72 items-center gap-2 rounded-xl bg-ink-950/60 px-3 ring-1 ring-inset ring-tint/10 focus-within:ring-grass-400/60">
          <Search size={15} className="shrink-0 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un mod"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500"
          />
        </label>
      </div>
      <div className={`mt-4 min-h-0 flex-1 overflow-y-auto ${panel}`}>
        {!source ? (
          <p className="px-5 py-6 text-sm text-ink-400">Ce modpack n’a pas encore de zip : crée d’abord une version pour choisir ses mods.</p>
        ) : !contents ? (
          <div className="flex h-full items-center justify-center gap-3 text-sm text-ink-300">
            <Spinner className="text-grass-300" /> Lecture du zip…
          </div>
        ) : (
          <>
            {shown.map((mod) => {
              const off = mod.disabled || offForPlayers(mod)
              return (
                <div key={mod.fileName} className="flex items-center gap-4 border-b border-tint/[0.04] px-4 py-2.5 last:border-0">
                  <Package size={16} className={`shrink-0 ${off ? 'text-ink-600' : 'text-ink-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${off ? 'text-ink-400' : 'text-ink-100'}`}>{mod.name ?? mod.fileName}</p>
                    <p className="truncate text-xs text-ink-400">{[mod.author, mod.fileName].filter(Boolean).join(' · ')}</p>
                  </div>
                  {mod.disabled ? (
                    <Tag title="Ce mod est désactivé dans le profil d’où vient le zip : active-le dans CurseForge pour le proposer actif.">
                      Désactivé dans ton profil
                    </Tag>
                  ) : (
                    off && <Tag tone="sky">Désactivé chez les joueurs</Tag>
                  )}
                  <Toggle
                    size="sm"
                    checked={!off}
                    disabled={mod.disabled}
                    label={off ? `Activer ${mod.name ?? mod.fileName} chez les joueurs` : `Désactiver ${mod.name ?? mod.fileName} chez les joueurs`}
                    onChange={(active) => setActive(mod, active)}
                  />
                </div>
              )
            })}
            {shown.length === 0 && (
              <p className="px-4 py-6 text-sm text-ink-400">{q ? 'Aucun mod ne correspond.' : 'Aucun mod dans le dossier mods.'}</p>
            )}
          </>
        )}
      </div>
      {missing.length > 0 && (
        <div className="mt-3 rounded-xl bg-tint/[0.03] px-4 py-3 text-xs text-ink-300 ring-1 ring-inset ring-tint/[0.06]">
          <p>
            Absents de {source?.label} : toujours désactivés dans les versions qui les contiennent.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((entry) => (
              <span key={`${entry.addonId}:${entry.file}`} className="inline-flex items-center gap-1 rounded-lg bg-tint/[0.06] py-0.5 pr-0.5 pl-2.5 text-ink-200">
                {entry.name ?? entry.file}
                <IconButton
                  icon={X}
                  size={13}
                  label={`Ne plus désactiver ${entry.name ?? entry.file}`}
                  className="size-6!"
                  onClick={() => onChange({ ...settings, disabledMods: settings.disabledMods.filter((e) => e !== entry) })}
                />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Configurations

function Card({ title, children, active }: { title: string; children: ReactNode; active: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ring-1 ring-inset transition ${active ? 'bg-grass-400/[0.07] ring-grass-400/30' : `${panel} opacity-70`}`}>
      <p className={`text-sm font-semibold ${active ? 'text-grass-300' : 'text-ink-200'}`}>{title}</p>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-300">{children}</div>
    </div>
  )
}

function ConfigsTab({ settings, onChange }: { settings: PackSettings; onChange(settings: PackSettings): void }) {
  const keep = settings.keepPlayerConfigs
  return (
    <div className="space-y-5">
      <div className={`flex items-center gap-5 p-5 ${panel}`}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-100">Garder les configurations modifiées par les joueurs</p>
          <p className="mt-1 text-sm text-ink-300">
            À chaque mise à jour, un fichier du dossier <span className="font-mono text-ink-200">config</span> qu’un joueur a
            modifié reste tel qu’il l’a laissé.
          </p>
        </div>
        <Toggle
          checked={keep}
          label="Garder les configurations modifiées par les joueurs"
          onChange={(value) => onChange({ ...settings, keepPlayerConfigs: value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Card title="Option désactivée" active={!keep}>
          <p>Le dossier config est remplacé en entier par celui de la nouvelle version.</p>
          <p>Tes réglages arrivent chez tous les joueurs, mais un réglage qu’un joueur avait changé est perdu.</p>
        </Card>
        <Card title="Option activée" active={keep}>
          <p>Un fichier que le joueur a modifié est gardé ; ceux qu’il n’a pas touchés suivent la nouvelle version, et les nouveaux sont ajoutés.</p>
          <p>Un réglage que tu changes dans un fichier modifié par un joueur ne lui arrive donc pas.</p>
        </Card>
      </div>
      <p className="text-xs leading-relaxed text-ink-400">
        Avec ou sans cette option, les options du jeu (<span className="font-mono">options.txt</span>…), les mondes, les cartes et
        les mods que le joueur a activés ou désactivés sont toujours gardés. L’option demande une version récente de Modpack
        Downloader chez le joueur.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

const FOOTER: Record<SettingsTab, string> = {
  files: 'Les exclusions valent pour les prochaines versions : une version déjà publiée ne change pas.',
  mods: 'Envoyé à GitHub à la prochaine publication, pour toutes les versions du modpack.',
  configs: 'Envoyé à GitHub à la prochaine publication, pour toutes les versions du modpack.'
}

/** Ce que reçoivent les joueurs : fichiers jamais publiés, mods désactivés par défaut, configurations gardées. */
export function PackSettingsDialog({ folder, tab: initialTab = 'files' }: { folder: string; tab?: SettingsTab }) {
  const pack = useStudio((s) => s.overview?.packs.find((p) => p.folder === folder) ?? null)
  const close = useStudio((s) => s.closeDialog)
  const run = useStudio((s) => s.run)
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [settings, setSettings] = useState<PackSettings>(pack?.settings ?? DEFAULT_PACK_SETTINGS)
  const [saving, setSaving] = useState(false)
  const source = pack ? sourceZip(pack) : null
  const sourceFile = source?.fileName ?? null
  const [contents, setContents] = useState<{ fileName: string; data: ZipContents } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sourceFile) return
    let alive = true
    window.studio.getZipContents(folder, sourceFile).then(
      (data) => alive && setContents({ fileName: sourceFile, data }),
      (err: unknown) => alive && setError(errorMessage(err))
    )
    return () => {
      alive = false
    }
  }, [folder, sourceFile])

  if (!pack) return null
  const data = contents?.fileName === sourceFile ? contents.data : null
  const dirty = JSON.stringify(settings) !== JSON.stringify(pack.settings)

  async function save() {
    setSaving(true)
    if (await run(window.studio.updatePackSettings(folder, settings), 'Réglages enregistrés')) close()
    setSaving(false)
  }

  const tabs: Array<{ id: SettingsTab; label: string; count: string | null }> = [
    { id: 'files', label: 'Fichiers exclus', count: settings.exclude.length ? String(settings.exclude.length) : null },
    { id: 'mods', label: 'Mods désactivés', count: settings.disabledMods.length ? String(settings.disabledMods.length) : null },
    { id: 'configs', label: 'Configurations des joueurs', count: settings.keepPlayerConfigs ? 'gardées' : null }
  ]

  return (
    <Modal
      title="Réglages des versions"
      subtitle={`${pack.name} · ce que reçoivent les joueurs`}
      onClose={close}
      width="max-w-5xl"
      footer={
        <>
          <p className="flex-1 text-xs text-ink-400">{FOOTER[tab]}</p>
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <nav className="flex w-fit rounded-xl bg-tint/[0.04] p-1 ring-1 ring-inset ring-tint/[0.06]" aria-label="Réglages">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
              tab === t.id ? 'bg-tint/10 text-ink-100' : 'text-ink-400 hover:text-ink-200'
            }`}
          >
            {t.label}
            {t.count && <span className="text-xs font-bold text-grass-300 tabular-nums">{t.count}</span>}
          </button>
        ))}
      </nav>
      {error && tab !== 'configs' && (
        <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-inset ring-red-400/25 select-text">
          {source?.label} illisible : {error}
        </p>
      )}
      <div className="mt-5 h-[min(56vh,38rem)]">
        {tab === 'files' && <FilesTab settings={settings} onChange={setSettings} contents={data} source={source} />}
        {tab === 'mods' && <ModsTab settings={settings} onChange={setSettings} contents={data} source={source} />}
        {tab === 'configs' && <ConfigsTab settings={settings} onChange={setSettings} />}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------------
// Retirer les fichiers exclus d'un zip

/** Réécrit un zip (à ranger, ou version pas encore publiée) sans les fichiers exclus dans les réglages. */
export function StripDialog({ folder, fileName, label }: { folder: string; fileName: string; label: string }) {
  const pack = useStudio((s) => s.overview?.packs.find((p) => p.folder === folder) ?? null)
  const close = useStudio((s) => s.closeDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ZipProgress | null>(null)
  useEffect(() => window.studio.onZipProgress(setProgress), [])
  if (!pack) return null
  const zip = pack.versions.find((v) => v.fileName === fileName) ?? pack.pending.find((z) => z.fileName === fileName)
  const excluded = zip?.excluded ?? null

  async function start() {
    setRunning(true)
    setProgress(null)
    try {
      const result = await window.studio.stripExcluded(folder, fileName)
      if (result.ok) {
        pushToast({ kind: 'success', title: `${plural(result.removed ?? 0, 'fichier')} retiré${(result.removed ?? 0) > 1 ? 's' : ''} de ${fileName}` })
        close()
      } else {
        pushToast({ kind: 'error', title: 'Zip non modifié', message: result.error })
      }
    } catch (err) {
      pushToast({ kind: 'error', title: 'Zip non modifié', message: errorMessage(err) })
    } finally {
      setRunning(false)
      void refresh()
    }
  }

  return (
    <Modal
      title="Retirer les fichiers exclus"
      subtitle={<span className="select-text">{pack.name} · {fileName}</span>}
      onClose={close}
      closable={!running}
      width="max-w-xl"
      footer={
        running ? (
          <>
            <div className="flex-1">
              <div className="mb-1.5 flex justify-between text-xs text-ink-300 tabular-nums">
                <span>Réécriture du zip…</span>
                {progress && progress.total > 0 && (
                  <span>
                    {formatBytes(progress.done)} / {formatBytes(progress.total)}
                  </span>
                )}
              </div>
              <ProgressBar ratio={progress && progress.total ? progress.done / progress.total : 0} />
            </div>
            <Button variant="ghost" onClick={() => void window.studio.cancelZip()}>
              Annuler
            </Button>
          </>
        ) : (
          <>
            <div className="flex-1" />
            <Button variant="ghost" onClick={close}>
              {excluded ? 'Annuler' : 'Fermer'}
            </Button>
            {excluded && (
              <Button variant="primary" icon={Eraser} onClick={() => void start()}>
                Retirer {plural(excluded.files, 'fichier')}
              </Button>
            )}
          </>
        )
      }
    >
      {excluded ? (
        <>
          <p className="text-sm text-ink-300">
            {label.charAt(0).toUpperCase() + label.slice(1)} contient des fichiers exclus dans les réglages du modpack. Le zip est
            réécrit sans eux, le reste ne change pas :
          </p>
          <ul className={`mt-3 max-h-60 space-y-1 overflow-y-auto px-4 py-3 ${panel}`}>
            {excluded.paths.map((path) => (
              <li key={path} className="truncate font-mono text-xs text-ink-200 select-text" title={path}>
                {path}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-300">Ce zip ne contient plus de fichier exclu.</p>
      )}
    </Modal>
  )
}
