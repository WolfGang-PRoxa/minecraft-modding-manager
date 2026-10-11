import { Bot, FolderCog, FolderOpen, Plug, RotateCcw, TerminalSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ClaudeCodeStatus } from '../../../shared/types'
import { Button } from '../components/Button'
import { useStore } from '../store'
import { openPath, refreshStudioIfOpen } from './store'

/** Réglage « Dossier des modpacks » (publieurs), dans les paramètres de l'application. */
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
      <div className="rounded-xl bg-ink-950/60 px-4 py-3 font-mono text-[13px] break-all text-ink-100 ring-1 ring-inset ring-white/[0.06] select-text">
        {workspaceDir ?? 'Pas encore choisi : le Studio te le demandera.'}
      </div>
      <p className="mt-2 text-xs text-ink-400">Un sous-dossier par modpack, avec les zips de ses mises à jour.</p>
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
