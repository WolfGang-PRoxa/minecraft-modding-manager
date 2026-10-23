import { useEffect, type ReactNode } from 'react'
import {
  ArrowDownWideNarrow,
  Blocks,
  BookOpen,
  CircleCheck,
  CircleX,
  CloudOff,
  CloudUpload,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  KeyRound,
  RefreshCw,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { StudioOverview } from '../../../shared/studio'
import { Button } from '../components/Button'
import { Logo } from '../components/Logo'
import { showDocs } from '../docs/store'
import { formatBytes, formatRelative } from '../lib/format'
import { Spinner } from './Modal'
import { ContentsDialog } from './ContentsDialog'
import { DeleteDialog } from './DeleteDialog'
import { ModCard, ModImportDialog, PublishModCurseForgeDialog } from './ModCard'
import { PackCard } from './PackCard'
import { CurseForgeDialog, CurseForgeVersionsDialog, PublishCurseForgeDialog } from './CurseForgePanel'
import { UpdatesDialog } from './MaintenancePanel'
import { FromProfileDialog, ImportDialog, NewPackDialog, NotesDialog, PackInfoDialog } from './PackDialogs'
import { PackSettingsDialog, StripDialog } from './PackSettingsDialog'
import { ProfileDetail, ProfilesSidebar, UnlinkedPackDetail } from './Profiles'
import { PublishDialog } from './PublishDialog'
import { RangerDialog } from './RangerDialog'
import { useStore } from '../store'
import { openPath, useStudio } from './store'

function Centered({ children }: { children: ReactNode }) {
  return <div className="animate-rise flex min-h-full flex-col items-center justify-center px-8 py-12 text-center">{children}</div>
}

function FolderTree() {
  const lines: Array<[string, string, string?]> = [
    ['0', 'Modpacks/'],
    ['1', 'Hardcore_Endgame/'],
    ['2', 'Hardcore_Endgame-v1.zip', 'rangé'],
    ['2', 'Hardcore_Endgame-v2.zip', 'rangé'],
    ['2', 'ma-derniere-maj.zip', '→ deviendra la v3'],
    ['2', 'cover.png', 'image (facultatif)'],
    ['1', 'Autre_Modpack/']
  ]
  return (
    <div className="mx-auto mt-8 w-full max-w-md rounded-2xl bg-ink-950/60 p-5 text-left font-mono text-[13px] ring-1 ring-inset ring-tint/[0.06]">
      {lines.map(([depth, name, note]) => (
        <div key={name} className="flex items-baseline gap-3 leading-7" style={{ paddingLeft: `${Number(depth) * 1.25}rem` }}>
          <span className={name.endsWith('/') ? 'text-grass-300' : 'text-ink-200'}>{name}</span>
          {note && <span className="font-sans text-xs text-ink-500">{note}</span>}
        </div>
      ))}
    </div>
  )
}

function Welcome({ overview }: { overview: StudioOverview }) {
  const run = useStudio((s) => s.run)
  const refresh = useStudio((s) => s.refresh)
  const missing = overview.settings.workspaceDir !== null
  return (
    <Centered>
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-grass-400/20 blur-3xl" />
        <Logo size={88} className="relative drop-shadow-2xl" />
      </div>
      <h1 className="mt-8 font-display text-4xl font-bold tracking-tight">
        {missing ? 'Dossier des modpacks introuvable' : 'Bienvenue dans le Studio'}
      </h1>
      <p className="mt-3 max-w-xl text-ink-300">
        {missing ? (
          <>
            <span className="font-mono text-ink-200 select-text">{overview.settings.workspaceDir}</span> n’existe plus (disque
            débranché, dossier déplacé ?). Choisis où se trouvent tes modpacks.
          </>
        ) : (
          'Choisis le dossier où tu ranges tes modpacks : un sous-dossier par modpack, dans lequel tu déposes le zip de chaque mise à jour. Le studio les numérote et les publie sur GitHub.'
        )}
      </p>
      {!missing && <FolderTree />}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {!missing && (
          <Button
            variant="primary"
            size="lg"
            icon={FolderPlus}
            onClick={() =>
              void run(window.studio.useDefaultWorkspace()).then(() => {
                void useStore.getState().refreshLocal()
                return refresh({ remote: true })
              })
            }
          >
            Utiliser {overview.settings.defaultWorkspaceDir}
          </Button>
        )}
        <Button
          size="lg"
          variant={missing ? 'primary' : 'secondary'}
          icon={FolderSearch}
          onClick={() =>
            void window.studio.pickWorkspaceDir().then((picked) => {
              if (!picked) return
              void useStore.getState().refreshLocal()
              void refresh({ remote: true })
            })
          }
        >
          {missing ? 'Choisir le dossier…' : 'Choisir un autre dossier…'}
        </Button>
      </div>
      {!missing && (
        <button
          type="button"
          onClick={() => showDocs('studio')}
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-grass-300 transition hover:text-grass-400"
        >
          <BookOpen size={16} /> Lire le guide du Studio
        </button>
      )}
    </Centered>
  )
}

function Panel({ icon: Icon, tone, children, action }: { icon: LucideIcon; tone: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl px-5 py-4 ring-1 ring-inset ${tone}`}>
      <Icon size={22} className="shrink-0" />
      <div className="min-w-0 flex-1 text-sm text-ink-100">{children}</div>
      {action}
    </div>
  )
}

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n > 1 ? pluralForm : singular}`
}

function SyncPanel({ overview }: { overview: StudioOverview }) {
  const checking = useStudio((s) => s.checkingGitHub)
  const refresh = useStudio((s) => s.refresh)
  const openDialog = useStudio((s) => s.openDialog)
  const openSettings = useStudio((s) => s.openSettings)
  const { github, plan } = overview

  if (checking && !plan) {
    return (
      <Panel icon={RefreshCw} tone="bg-tint/[0.03] text-ink-300 ring-tint/[0.06] [&>svg]:animate-spin">
        Comparaison avec GitHub…
      </Panel>
    )
  }
  if (overview.settings.role !== 'publisher') {
    return (
      <Panel
        icon={KeyRound}
        tone="bg-amber-glow/10 text-amber-glow ring-amber-glow/25"
        action={
          <Button size="sm" variant="primary" onClick={openSettings}>
            Paramètres
          </Button>
        }
      >
        <strong className="font-semibold">Tu es en mode récepteur.</strong>{' '}
        <span className="text-ink-300">
          Pour publier, passe en publieur (Paramètres → Utilisation) : indique ton dépôt et connecte ton compte GitHub.
        </span>
      </Panel>
    )
  }
  if (github.state === 'no-token') {
    return (
      <Panel
        icon={KeyRound}
        tone="bg-amber-glow/10 text-amber-glow ring-amber-glow/25"
        action={
          <Button size="sm" variant="primary" onClick={openSettings}>
            Connecter GitHub
          </Button>
        }
      >
        <strong className="font-semibold">GitHub n’est pas connecté.</strong>{' '}
        <span className="text-ink-300">Connecte ton compte GitHub dans les paramètres pour publier sur {github.repo}.</span>
      </Panel>
    )
  }
  if (github.state === 'error' || !plan) {
    return (
      <Panel
        icon={CloudOff}
        tone="bg-red-500/10 text-red-300 ring-red-400/25"
        action={
          <Button size="sm" disabled={checking} onClick={() => void refresh({ remote: true })}>
            Réessayer
          </Button>
        }
      >
        <strong className="font-semibold">GitHub injoignable.</strong>{' '}
        <span className="text-ink-300 select-text">{github.error ?? 'Vérifie ta connexion internet.'}</span>
      </Panel>
    )
  }

  const counts = { create: 0, update: 0, delete: 0 }
  for (const action of plan.actions) counts[action.kind]++
  const checkedAt = github.checkedAt ? ` · vérifié ${formatRelative(github.checkedAt)}` : ''

  return (
    <div className="space-y-3">
      {plan.actions.length === 0 ? (
        <Panel
          icon={CircleCheck}
          tone="bg-grass-400/10 text-grass-400 ring-grass-400/25"
          action={
            <Button size="sm" variant="ghost" disabled={checking} onClick={() => void refresh({ remote: true })}>
              Vérifier
            </Button>
          }
        >
          <strong className="font-semibold">Tout est en ligne.</strong>{' '}
          <span className="text-ink-300">GitHub correspond exactement à ton dossier{checkedAt}.</span>
        </Panel>
      ) : (
        <Panel
          icon={CloudUpload}
          tone="bg-sky-400/10 text-sky-300 ring-sky-400/25"
          action={
            <Button size="sm" variant="primary" onClick={() => openDialog({ kind: 'publish' })}>
              Voir et publier
            </Button>
          }
        >
          <strong className="font-semibold">{plural(plan.actions.length, 'changement')} à publier :</strong>{' '}
          <span className="text-ink-300">
            {[
              counts.create && plural(counts.create, 'nouvelle version', 'nouvelles versions'),
              counts.update && plural(counts.update, 'mise à jour', 'mises à jour'),
              counts.delete && plural(counts.delete, 'suppression')
            ]
              .filter(Boolean)
              .join(' · ')}
            {plan.uploadBytes > 0 && ` · ${formatBytes(plan.uploadBytes)} à envoyer`}
          </span>
        </Panel>
      )}
      {github.repoPrivate && (
        <Panel icon={TriangleAlert} tone="bg-amber-glow/10 text-amber-glow ring-amber-glow/25">
          <strong className="font-semibold">Le dépôt {github.repo} est privé :</strong>{' '}
          <span className="text-ink-300">
            les joueurs ne voient aucun modpack. Rends-le public sur GitHub (Settings → General → Danger Zone → Change visibility).
          </span>
        </Panel>
      )}
      {github.canPush === false && (
        <Panel icon={CircleX} tone="bg-red-500/10 text-red-300 ring-red-400/25">
          <strong className="font-semibold">Ce compte GitHub ne peut pas publier sur {github.repo}.</strong>{' '}
          <span className="text-ink-300">Utilise un jeton avec l’accès « Contents : Read and write ».</span>
        </Panel>
      )}
    </div>
  )
}

/** Ce que montre la colonne de droite : tous les modpacks, un profil CurseForge, ou un modpack sans profil. */
function SelectionContent({ overview }: { overview: StudioOverview }) {
  const openDialog = useStudio((s) => s.openDialog)
  const selection = useStudio((s) => s.selection)
  const library = useStudio((s) => s.library)
  const { packs } = overview

  if (selection.kind === 'profile') {
    const profile = library?.folders.flatMap((f) => f.profiles).find((p) => p.path === selection.path)
    if (profile) return <ProfileDetail key={profile.path} profile={profile} />
  }
  if (selection.kind === 'pack') {
    const pack = packs.find((p) => p.folder === selection.folder)
    if (pack) return pack.type === 'mod' ? <ModCard pack={pack} index={0} /> : <UnlinkedPackDetail pack={pack} />
  }
  return packs.length === 0 ? (
    <div className="rounded-3xl bg-ink-850 px-10 py-12 text-center ring-1 ring-tint/[0.06]">
      <h2 className="font-display text-2xl font-bold tracking-tight">Aucun modpack dans ce dossier</h2>
      <p className="mx-auto mt-2 max-w-lg text-ink-300">
        Choisis un profil CurseForge à gauche pour en faire un modpack, ou crée un sous-dossier par modpack et dépose-y
        les zips de ses mises à jour.
      </p>
      <FolderTree />
      <Button className="mt-8" variant="primary" icon={FolderPlus} onClick={() => openDialog({ kind: 'new-pack' })}>
        Créer mon premier modpack
      </Button>
    </div>
  ) : (
    <div className="space-y-6">
      {packs.map((pack, index) =>
        pack.type === 'mod' ? <ModCard key={pack.folder} pack={pack} index={index} /> : <PackCard key={pack.folder} pack={pack} index={index} />
      )}
    </div>
  )
}

function WorkspaceView({ overview }: { overview: StudioOverview }) {
  return (
    <div className="flex h-full">
      <ProfilesSidebar />
      <div className="min-w-0 flex-1 overflow-y-auto">
        <WorkspaceColumn overview={overview} />
      </div>
    </div>
  )
}

function WorkspaceColumn({ overview }: { overview: StudioOverview }) {
  const openDialog = useStudio((s) => s.openDialog)
  const pushToast = useStudio((s) => s.pushToast)
  const refresh = useStudio((s) => s.refresh)
  const select = useStudio((s) => s.select)

  async function newMod() {
    const result = await window.studio.createModFromSource()
    if (!result.ok) return pushToast({ kind: 'error', title: 'Création impossible', message: result.error })
    if (!result.folder) return
    await refresh()
    select({ kind: 'pack', folder: result.folder })
    pushToast({ kind: 'success', title: 'Mod créé', message: 'Sa version la plus récente est importée ; les autres se proposent à l’import.' })
  }
  const { plan, strayZips, orphanPacks, toRange, settings } = overview
  const changes = plan?.actions.length ?? 0

  return (
    <div className="mx-auto w-full max-w-6xl px-8 pt-8 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-bold tracking-tight">Mes modpacks</h1>
          <button
            type="button"
            onClick={() => openPath(settings.workspaceDir!)}
            className="mt-1.5 inline-flex max-w-full items-center gap-2 truncate font-mono text-xs text-ink-400 transition hover:text-ink-200"
            title="Ouvrir dans l’Explorateur"
          >
            <FolderOpen size={14} className="shrink-0" /> {settings.workspaceDir}
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" icon={BookOpen} onClick={() => showDocs('studio')}>
            Guide
          </Button>
          <Button icon={FolderPlus} onClick={() => openDialog({ kind: 'new-pack' })}>
            Nouveau modpack
          </Button>
          <Button icon={Blocks} onClick={() => void newMod()} title="Depuis le dossier où le projet du mod dépose ses jars">
            Nouveau mod
          </Button>
          <Button
            icon={ArrowDownWideNarrow}
            disabled={toRange === 0}
            title={toRange === 0 ? 'Tous les zips sont déjà numérotés' : undefined}
            onClick={() => openDialog({ kind: 'ranger' })}
          >
            Ranger les zips
            {toRange > 0 && <Count tone="bg-tint/15 text-ink-100">{toRange}</Count>}
          </Button>
          <Button
            variant="primary"
            icon={CloudUpload}
            disabled={!plan || changes === 0 || settings.role !== 'publisher'}
            title={
              settings.role !== 'publisher'
                ? 'Passe en mode publieur dans les paramètres'
                : !plan
                  ? 'GitHub n’est pas joignable'
                  : changes === 0
                    ? 'GitHub est déjà à jour'
                    : undefined
            }
            onClick={() => openDialog({ kind: 'publish' })}
          >
            Publier sur GitHub
            {changes > 0 && <Count tone="bg-ink-950/25 text-ink-950">{changes}</Count>}
          </Button>
        </div>
      </header>

      <div className="mt-6 space-y-3">
        <SyncPanel overview={overview} />
        {toRange > 0 && (
          <Panel
            icon={ArrowDownWideNarrow}
            tone="bg-tint/[0.04] text-ink-200 ring-tint/[0.08]"
            action={
              <Button size="sm" onClick={() => openDialog({ kind: 'ranger' })}>
                Ranger
              </Button>
            }
          >
            <strong className="font-semibold">{plural(toRange, 'zip')} à ranger.</strong>{' '}
            <span className="text-ink-300">Ils recevront un numéro de version avant de pouvoir être publiés.</span>
          </Panel>
        )}
        {strayZips.length > 0 && (
          <Panel icon={TriangleAlert} tone="bg-amber-glow/10 text-amber-glow ring-amber-glow/25">
            <strong className="font-semibold">Zips hors de tout modpack :</strong>{' '}
            <span className="text-ink-300 select-text">
              {strayZips.join(', ')}. Déplace-les dans le dossier de leur modpack, sinon ils sont ignorés.
            </span>
          </Panel>
        )}
        {orphanPacks.map((orphan) => (
          <Panel
            key={orphan.id}
            icon={CloudOff}
            tone="bg-red-500/10 text-red-300 ring-red-400/25"
            action={
              <Button
                size="sm"
                variant="danger"
                icon={Trash2}
                onClick={() =>
                  openDialog({
                    kind: 'delete',
                    target: { type: 'releases', name: orphan.name, versions: orphan.versions, tags: orphan.tags, orphan: true }
                  })
                }
              >
                Retirer maintenant
              </Button>
            }
          >
            <strong className="font-semibold">« {orphan.name} » sera retiré de GitHub.</strong>{' '}
            <span className="text-ink-300">
              Son dossier n’existe plus : {orphan.versions.length > 1 ? 'ses versions' : 'sa version'}{' '}
              {orphan.versions.map((v) => `v${v}`).join(', ')} {orphan.versions.length > 1 ? 'seront supprimées' : 'sera supprimée'} à
              la prochaine publication.
            </span>
          </Panel>
        ))}
      </div>

      <div className="mt-8">
        <SelectionContent overview={overview} />
      </div>
    </div>
  )
}

function Count({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`-mr-1 rounded-md px-1.5 py-0.5 text-xs leading-none font-bold ${tone}`}>{children}</span>
}

function Dialogs() {
  const dialog = useStudio((s) => s.dialog)
  if (!dialog) return null
  switch (dialog.kind) {
    case 'new-pack':
      return <NewPackDialog />
    case 'pack-info':
      return <PackInfoDialog key={dialog.folder} folder={dialog.folder} />
    case 'pack-settings':
      return <PackSettingsDialog key={dialog.folder} folder={dialog.folder} tab={dialog.tab} />
    case 'strip':
      return <StripDialog key={`${dialog.folder}/${dialog.fileName}`} {...dialog} />
    case 'notes':
      return <NotesDialog key={`${dialog.folder}-${dialog.version}`} folder={dialog.folder} version={dialog.version} />
    case 'mod-import':
      return <ModImportDialog key={dialog.folder} folder={dialog.folder} />
    case 'mod-curseforge-publish':
      return <PublishModCurseForgeDialog key={`${dialog.folder}-${dialog.version}`} folder={dialog.folder} version={dialog.version} />
    case 'import':
      return <ImportDialog key={dialog.folder} folder={dialog.folder} profilePath={dialog.profilePath} />
    case 'curseforge':
      return <CurseForgeDialog key={dialog.folder} folder={dialog.folder} />
    case 'curseforge-versions':
      return <CurseForgeVersionsDialog key={dialog.folder} folder={dialog.folder} />
    case 'curseforge-publish':
      return <PublishCurseForgeDialog key={`${dialog.folder}-${dialog.version}`} folder={dialog.folder} version={dialog.version} />
    case 'updates':
      return <UpdatesDialog key={dialog.folder} folder={dialog.folder} />
    case 'from-profile':
      return <FromProfileDialog key={dialog.profilePath} profilePath={dialog.profilePath} profileName={dialog.profileName} />
    case 'ranger':
      return <RangerDialog />
    case 'publish':
      return <PublishDialog />
    case 'delete':
      return <DeleteDialog target={dialog.target} />
    case 'contents':
      return <ContentsDialog key={`${dialog.folder}/${dialog.fileName}`} {...dialog} />
  }
}

function AnalyzingPill() {
  const analyzing = useStudio((s) => s.analyzing)
  if (!analyzing) return null
  return (
    <div className="animate-rise fixed bottom-6 left-6 z-40 flex items-center gap-3 rounded-full bg-ink-800/95 py-2.5 pr-5 pl-4 text-sm text-ink-200 shadow-2xl ring-1 ring-tint/10 backdrop-blur-xl">
      <Spinner className="text-grass-300" /> Analyse de <span className="max-w-72 truncate font-medium text-ink-100">{analyzing}</span>
    </div>
  )
}

/** Vue Studio de la fenêtre (publieurs) : dossier des modpacks, rangement et publication. */
export function StudioView() {
  const init = useStudio((s) => s.init)
  const overview = useStudio((s) => s.overview)

  useEffect(() => {
    void init()
  }, [init])

  let content: ReactNode
  if (!overview) {
    content = (
      <Centered>
        <Spinner size={28} className="text-grass-300" />
        <p className="mt-4 text-ink-300">Lecture du dossier des modpacks…</p>
      </Centered>
    )
  } else if (!overview.settings.workspaceDir || !overview.workspaceExists) {
    content = <Welcome overview={overview} />
  } else {
    content = <WorkspaceView overview={overview} />
  }

  return (
    <>
      {content}
      <Dialogs />
      <AnalyzingPill />
    </>
  )
}
