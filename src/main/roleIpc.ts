import { ipcMain } from 'electron'
import { repoSlug } from '../shared/repo'
import type { RoleResult, Settings } from '../shared/types'
import { checkPublicRepo, checkPublisherAccess, parseRepoInput, RepoError, resolveCredential } from '../core/auth'
import { updateSettings } from '../core/settings'

async function roleResult(run: () => Promise<Omit<Extract<RoleResult, { ok: true }>, 'ok'>>): Promise<RoleResult> {
  try {
    return { ok: true, ...(await run()) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      needsLogin: err instanceof RepoError && err.needsLogin
    }
  }
}

/** Canaux `role:*` (récepteur / publieur), enregistrés à l'identique par l'application et par le studio. */
export function registerRoleIpc(): void {
  ipcMain.handle('role:receiver', (_e, repoInput: string | null) =>
    roleResult(async () => {
      const patch: Partial<Settings> = { role: 'receiver' }
      // Un récepteur peut suivre les modpacks d'un autre publieur : le dépôt doit être public.
      if (typeof repoInput === 'string') patch.repo = (await checkPublicRepo(parseRepoInput(repoInput))).repo
      return { settings: await updateSettings(patch), account: null, warning: null }
    })
  )

  ipcMain.handle('role:publisher', (_e, repoInput: string) =>
    roleResult(async () => {
      const repo = parseRepoInput(String(repoInput ?? ''))
      const credential = await resolveCredential()
      if (!credential) throw new RepoError('Connecte-toi à GitHub pour prouver que tu peux publier sur ce dépôt.', true)
      const { info, account } = await checkPublisherAccess(repo, credential)
      const warning = info.private
        ? `Le dépôt ${repoSlug(info.repo)} est privé : tes joueurs ne verront aucun modpack tant qu’il n’est pas public.`
        : null
      return { settings: await updateSettings({ role: 'publisher', repo: info.repo }), account, warning }
    })
  )
}
