import { AlarmClock, Bot, CircleCheck, CircleX, FolderCog, FolderOpen, KeyRound, Plug, RotateCcw, TerminalSquare, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { MaintenanceTask } from '../../../shared/studio'
import type { ClaudeCodeStatus, CurseForgeAuthStatus, CurseForgeSecretKind, CurseForgeSecretStatus, HangarAuthStatus, ModrinthAuthStatus } from '../../../shared/types'
import { Button } from '../components/Button'
import { Toggle } from '../components/Toggle'
import { formatDate } from '../lib/format'
import { useStore } from '../store'
import { useMaintenance } from './maintenanceStore'
import { openPath, refreshStudioIfOpen } from './store'

/** Réglage « Dossier des contenus » (publieurs), dans les paramètres de l'application. */
export function WorkspaceFolderSetting() {
  const workspaceDir = useStore((s) => s.settings?.workspaceDir ?? null)
  const refreshLocal = useStore((s) => s.refreshLocal)

  async function change() {
    if (!(await window.studio.pickWorkspaceDir())) return
    await refreshLocal()
    refreshStudioIfOpen({ remote: true })
  }

  return (
    <>
      <div className="rounded-xl bg-ink-950/60 px-4 py-3 font-mono text-[13px] break-all text-ink-100 ring-1 ring-inset ring-tint/[0.06] select-text">
        {workspaceDir ?? 'Pas encore choisi : le Studio te le demandera.'}
      </div>
      <p className="mt-2 text-xs text-ink-400">Un sous-dossier par contenu (modpack, mod, pack de ressources, shader, plugin), avec ses versions.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" icon={FolderCog} onClick={() => void change()}>
          Changer…
        </Button>
        {workspaceDir && (
          <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => openPath(workspaceDir)}>
            Ouvrir
          </Button>
        )}
      </div>
    </>
  )
}

/** Connexion à Claude Code et commandes du terminal (publieurs), dans les paramètres de l'application. */
export function ClaudeCodeSetting() {
  const pushToast = useStore((s) => s.pushToast)
  const [status, setStatus] = useState<ClaudeCodeStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.getClaudeCodeStatus().then(setStatus)
  }, [])

  async function connect() {
    setBusy(true)
    try {
      const result = await window.api.connectClaudeCode()
      if (result.ok) pushToast({ kind: 'success', title: 'Connecté à Claude Code', message: 'Ouvre une nouvelle session Claude Code pour qu’il gère tes modpacks.' })
      else pushToast({ kind: 'error', title: 'Connexion à Claude Code impossible', message: result.error })
      setStatus(await window.api.getClaudeCodeStatus())
    } finally {
      setBusy(false)
    }
  }

  const code = 'rounded bg-ink-750 px-1.5 py-0.5 text-[12px] select-text'
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-3">
          <Bot size={18} className="mt-0.5 shrink-0 text-ink-400" />
          <div>
            <p className="text-sm text-ink-200">
              {!status
                ? 'Recherche de Claude Code…'
                : !status.installed
                  ? 'Claude Code n’est pas installé sur ce PC.'
                  : status.connected
                    ? 'Claude Code peut gérer tes modpacks : demande-le-lui dans une session.'
                    : 'Claude Code est installé, mais pas encore connecté à tes modpacks.'}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              Il utilise les mêmes opérations que le Studio : créer une version depuis CurseForge, régler, publier.
            </p>
          </div>
        </div>
        {status?.installed && (
          <Button size="sm" icon={status.connected ? RotateCcw : Plug} disabled={busy} onClick={() => void connect()}>
            {status.connected ? 'Reconnecter' : 'Connecter'}
          </Button>
        )}
      </div>
      {status && !status.installed && (
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          Une fois Claude Code installé, connecte-le ici, ou tape :{' '}
          <code className={`${code} break-all`}>{status.manualCommand}</code>
        </p>
      )}
      <div className="mt-5 flex gap-3 text-sm text-ink-300">
        <TerminalSquare size={18} className="mt-0.5 shrink-0 text-ink-400" />
        <p>
          Les mêmes opérations existent dans le terminal : <code className={code}>mpm.cmd</code>, à côté de
          l’exécutable de l’application (<code className={code}>npm run mpm</code> depuis le dépôt). Sans argument, il
          liste ses commandes.
        </p>
      </div>
    </>
  )
}

const SECRET_INFO: Record<CurseForgeSecretKind, { label: string; hint: string; url: string; site: string }> = {
  apiKey: {
    label: 'Clé de l’API CurseForge',
    hint: 'Pour chercher les mises à jour des mods, packs de textures et shaders.',
    url: 'https://console.curseforge.com/',
    site: 'console.curseforge.com'
  },
  uploadToken: {
    label: 'Jeton d’auteur',
    hint: 'Pour mettre tes modpacks en ligne sur tes projets CurseForge.',
    url: 'https://authors.curseforge.com/account/api-tokens',
    site: 'authors.curseforge.com'
  }
}

function SecretRow({ kind, status, onChange }: { kind: CurseForgeSecretKind; status: CurseForgeSecretStatus | null; onChange: () => void }) {
  const pushToast = useStore((s) => s.pushToast)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const info = SECRET_INFO[kind]

  async function save(next: string | null) {
    setBusy(true)
    try {
      const result = await window.api.saveCurseForgeSecret(kind, next)
      if (result.ok) {
        pushToast({ kind: 'success', title: next === null ? `${info.label} retiré${kind === 'apiKey' ? 'e' : ''}` : `${info.label} enregistré${kind === 'apiKey' ? 'e' : ''}` })
        setValue('')
      } else {
        pushToast({ kind: 'error', title: 'Enregistrement impossible', message: result.error })
      }
    } finally {
      setBusy(false)
      onChange()
    }
  }

  const e = kind === 'apiKey' ? 'e' : ''
  const state = !status
    ? 'Vérification…'
    : !status.source
      ? `Absent${e}.`
      : status.valid
        ? status.source === 'saved'
          ? `Enregistré${e} et accepté${e} par CurseForge.`
          : `Trouvé${e} dans ${status.source === 'env' ? 'une variable d’environnement' : 'un fichier .env'}, accepté${e} par CurseForge.`
        : status.valid === false
          ? `Refusé${e} par CurseForge : remplace-l${kind === 'apiKey' ? 'a' : 'e'}.`
          : (status.error ?? `Non vérifié${e}.`)

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-100">{info.label}</p>
          <p className="mt-0.5 text-xs text-ink-400">
            {info.hint} À créer sur{' '}
            <button type="button" className="font-semibold text-grass-300 hover:text-grass-400" onClick={() => void window.api.openExternal(info.url)}>
              {info.site}
            </button>
            .
          </p>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 text-xs ${status?.valid ? 'text-grass-400' : status?.valid === false ? 'text-red-300' : 'text-ink-400'}`}>
          {status?.valid ? <CircleCheck size={14} /> : status?.valid === false ? <CircleX size={14} /> : null}
          {state}
        </span>
      </div>
      <div className="mt-2.5 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={status?.source === 'saved' ? 'Coller pour remplacer…' : 'Coller ici…'}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg bg-ink-950/60 px-3 py-1.5 font-mono text-sm text-ink-100 ring-1 ring-tint/10 outline-none placeholder:font-sans placeholder:text-ink-500 focus:ring-grass-400/50"
        />
        <Button size="sm" icon={KeyRound} disabled={busy || !value.trim()} onClick={() => void save(value)}>
          Vérifier et enregistrer
        </Button>
        {status?.source === 'saved' && (
          <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => void save(null)}>
            Retirer
          </Button>
        )}
      </div>
    </div>
  )
}

/** Clé de l'API et jeton d'auteur CurseForge (publieurs), chiffrés pour la session Windows. */
export function CurseForgeAccountSetting() {
  const [status, setStatus] = useState<CurseForgeAuthStatus | null>(null)
  const load = useCallback(() => void window.api.getCurseForgeAuth().then(setStatus), [])
  useEffect(load, [load])
  return (
    <>
      <div className="divide-y divide-tint/[0.05]">
        <SecretRow kind="apiKey" status={status?.apiKey ?? null} onChange={load} />
        <SecretRow kind="uploadToken" status={status?.uploadToken ?? null} onChange={load} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-400">
        Vérifiés par CurseForge avant d’être enregistrés, chiffrés par Windows pour ton compte : ni l’application, ni le terminal,
        ni Claude ne les affichent.
      </p>
    </>
  )
}

/** Paramètres → Compte Modrinth (publieurs) : le jeton d'accès personnel qui met les mods en ligne sur Modrinth. */
export function ModrinthAccountSetting() {
  const pushToast = useStore((s) => s.pushToast)
  const [status, setStatus] = useState<ModrinthAuthStatus | null>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => void window.api.getModrinthAuth().then(setStatus), [])
  useEffect(load, [load])

  async function save(next: string | null) {
    setBusy(true)
    try {
      const result = await window.api.saveModrinthToken(next)
      if (result.ok) {
        pushToast({ kind: 'success', title: next === null ? 'Jeton Modrinth retiré' : 'Jeton Modrinth enregistré' })
        setValue('')
      } else {
        pushToast({ kind: 'error', title: 'Enregistrement impossible', message: result.error })
      }
    } finally {
      setBusy(false)
      load()
    }
  }

  const state = !status
    ? 'Vérification…'
    : !status.source
      ? 'Absent.'
      : status.valid
        ? `${status.source === 'saved' ? 'Enregistré' : status.source === 'env' ? 'Trouvé dans une variable d’environnement' : 'Trouvé dans un fichier .env'}, compte ${status.username ?? '?'}.`
        : status.valid === false
          ? 'Refusé par Modrinth : remplace-le.'
          : (status.error ?? 'Non vérifié.')

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-100">Jeton d’accès personnel</p>
          <p className="mt-0.5 text-xs text-ink-400">
            Pour mettre tes mods en ligne sur leur projet Modrinth. À créer sur{' '}
            <button type="button" className="font-semibold text-grass-300 hover:text-grass-400" onClick={() => void window.api.openExternal('https://modrinth.com/settings/pats')}>
              modrinth.com/settings/pats
            </button>{' '}
            avec les droits « Read user data », « Read projects », « Read versions » et « Create versions ».
          </p>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 text-xs ${status?.valid ? 'text-grass-400' : status?.valid === false ? 'text-red-300' : 'text-ink-400'}`}>
          {status?.valid ? <CircleCheck size={14} /> : status?.valid === false ? <CircleX size={14} /> : null}
          {state}
        </span>
      </div>
      <div className="mt-2.5 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={status?.source === 'saved' ? 'Coller pour remplacer…' : 'mrp_…'}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg bg-ink-950/60 px-3 py-1.5 font-mono text-sm text-ink-100 ring-1 ring-tint/10 outline-none placeholder:font-sans placeholder:text-ink-500 focus:ring-grass-400/50"
        />
        <Button size="sm" icon={KeyRound} disabled={busy || !value.trim()} onClick={() => void save(value)}>
          Vérifier et enregistrer
        </Button>
        {status?.source === 'saved' && (
          <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => void save(null)}>
            Retirer
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-400">
        Vérifié par Modrinth avant d’être enregistré, chiffré par Windows pour ton compte : ni l’application, ni le terminal, ni
        Claude ne l’affichent.
      </p>
    </>
  )
}

/** Paramètres → Compte Hangar (publieurs) : la clé d'API qui met les plugins en ligne sur Hangar. */
export function HangarAccountSetting() {
  const pushToast = useStore((s) => s.pushToast)
  const [status, setStatus] = useState<HangarAuthStatus | null>(null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => void window.api.getHangarAuth().then(setStatus), [])
  useEffect(load, [load])

  async function save(next: string | null) {
    setBusy(true)
    try {
      const result = await window.api.saveHangarKey(next)
      if (result.ok) {
        pushToast({ kind: 'success', title: next === null ? 'Clé Hangar retirée' : 'Clé Hangar enregistrée' })
        setValue('')
      } else {
        pushToast({ kind: 'error', title: 'Enregistrement impossible', message: result.error })
      }
    } finally {
      setBusy(false)
      load()
    }
  }

  const state = !status
    ? 'Vérification…'
    : !status.source
      ? 'Absente.'
      : status.valid
        ? `${status.source === 'saved' ? 'Enregistrée' : status.source === 'env' ? 'Trouvée dans une variable d’environnement' : 'Trouvée dans un fichier .env'}, compte ${status.username ?? '?'}.`
        : status.valid === false
          ? 'Refusée par Hangar : remplace-la.'
          : (status.error ?? 'Non vérifié.')

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-100">Clé d’API</p>
          <p className="mt-0.5 text-xs text-ink-400">
            Pour mettre tes plugins en ligne sur leur projet Hangar. À créer sur{' '}
            <button type="button" className="font-semibold text-grass-300 hover:text-grass-400" onClick={() => void window.api.openExternal('https://hangar.papermc.io/auth/settings/api-keys')}>
              hangar.papermc.io (Paramètres → Clés d’API)
            </button>{' '}
            avec le droit « create_version ».
          </p>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 text-xs ${status?.valid ? 'text-grass-400' : status?.valid === false ? 'text-red-300' : 'text-ink-400'}`}>
          {status?.valid ? <CircleCheck size={14} /> : status?.valid === false ? <CircleX size={14} /> : null}
          {state}
        </span>
      </div>
      <div className="mt-2.5 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={status?.source === 'saved' ? 'Coller pour remplacer…' : 'Coller ici…'}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg bg-ink-950/60 px-3 py-1.5 font-mono text-sm text-ink-100 ring-1 ring-tint/10 outline-none placeholder:font-sans placeholder:text-ink-500 focus:ring-grass-400/50"
        />
        <Button size="sm" icon={KeyRound} disabled={busy || !value.trim()} onClick={() => void save(value)}>
          Vérifier et enregistrer
        </Button>
        {status?.source === 'saved' && (
          <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => void save(null)}>
            Retirer
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-400">
        Vérifiée par Hangar avant d’être enregistrée, chiffrée par Windows pour ton compte : ni l’application, ni le terminal, ni
        Claude ne l’affichent.
      </p>
    </>
  )
}

const formatTime = (iso: string) => `${formatDate(iso)} à ${new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`

/** Tâche planifiée des mises à jour automatiques, et Claude pour les échecs (publieurs), dans les paramètres. */
export function MaintenanceSetting() {
  const pushToast = useStore((s) => s.pushToast)
  const status = useMaintenance((s) => s.status)
  const refresh = useMaintenance((s) => s.refresh)
  const [time, setTime] = useState<string | null>(null)
  const [wake, setWake] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const task: MaintenanceTask | null = status?.task ?? null
  const shownTime = time ?? task?.time ?? '04:00'
  const shownWake = wake ?? (task?.installed ? task.wake : true)
  const scheduled = (status?.packs ?? []).filter((p) => ['weekly', 'biweekly', 'monthly'].includes(p.updates.frequency)).length

  async function schedule(next: { time: string; wake: boolean } | null) {
    setBusy(true)
    try {
      const result = await window.studio.scheduleMaintenance(next)
      if (!result.ok) pushToast({ kind: 'error', title: 'Tâche planifiée impossible', message: result.error })
      else pushToast({ kind: 'success', title: next ? `Passage chaque jour à ${next.time}` : 'Tâche planifiée retirée' })
      setTime(null)
      setWake(null)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex gap-3">
        <AlarmClock size={18} className="mt-0.5 shrink-0 text-ink-400" />
        <div className="text-sm">
          <p className="text-ink-200">
            {!status
              ? 'Lecture de la tâche planifiée…'
              : task?.installed
                ? `Chaque jour à ${task.time ?? '?'}${task.wake ? ', en réveillant le PC' : ''}, les modpacks dont le tour est venu sont mis à jour et testés.`
                : 'Pas de tâche planifiée : les mises à jour ne se font qu’à la demande.'}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {task?.installed && task.nextRunAt ? `Prochain passage : ${formatTime(task.nextRunAt)}. ` : ''}
            {task?.lastRunAt ? `Dernier : ${formatTime(task.lastRunAt)}. ` : ''}
            {scheduled ? `${scheduled} modpack${scheduled > 1 ? 's ont' : ' a'} une fréquence.` : 'Règle la fréquence de chaque modpack sur sa carte.'}
          </p>
          {task?.foreign && (
            <p className="mt-1 text-xs text-amber-glow">Elle lance une autre installation de l’application : enregistre-la à nouveau d’ici.</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink-200">
          Heure
          <input
            type="time"
            value={shownTime}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg bg-ink-950/60 px-2.5 py-1.5 text-sm text-ink-100 ring-1 ring-tint/10 ring-inset focus:ring-grass-400/60 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-200">
          <Toggle size="sm" label="Réveiller le PC" checked={shownWake} onChange={setWake} />
          Réveiller le PC en veille
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" icon={AlarmClock} disabled={busy || !status} onClick={() => void schedule({ time: shownTime, wake: shownWake })}>
          {task?.installed ? 'Enregistrer' : 'Activer'}
        </Button>
        {task?.installed && (
          <Button size="sm" variant="ghost" icon={Trash2} disabled={busy} onClick={() => void schedule(null)}>
            Retirer la tâche
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-400">
        La tâche tourne sous ton compte, quand ta session Windows est ouverte (verrouillée suffit). Pour le réveil, il faut
        aussi « Autoriser les minuteurs de réveil » dans les options d’alimentation de Windows.
      </p>

      <div className="mt-5 flex items-center justify-between gap-6">
        <div className="flex gap-3">
          <Bot size={18} className="mt-0.5 shrink-0 text-ink-400" />
          <div>
            <div className="text-sm font-medium text-ink-100">Confier les échecs à Claude Code</div>
            <div className="mt-0.5 text-xs text-ink-400">
              Quand une mise à jour échoue aux tests, Claude Code en cherche la cause et propose quoi faire. Il ne peut rien
              modifier. Utilise ton abonnement Claude.
            </div>
          </div>
        </div>
        <Toggle
          label="Confier les échecs à Claude Code"
          checked={status?.claude ?? false}
          disabled={!status}
          onChange={(enabled) => void window.studio.setMaintenanceClaude(enabled).then(refresh)}
        />
      </div>
    </>
  )
}
