// Bibliothèque : ajouter un mod, un pack de ressources ou un shader publié à un profil installé par l'application, ou
// l'en retirer (canaux extras:*). La version et le fichier sont relus dans le catalogue : rien ne vient de la fenêtre
// d'autre qu'un identifiant et une version.
import { ipcMain } from 'electron'
import { dirname, resolve } from 'node:path'
import { incompatibility } from '../shared/contentReleases'
import type { ContentRelease, InstalledExtra } from '../shared/types'
import { resolveInstancesDir } from '../core/curseforge'
import { installExtra, removeExtra } from '../core/extras'
import { removeQuietly } from '../core/fsutil'
import { readProfile } from '../core/profiles'
import { getSettings } from '../core/settings'
import { describeError, StudioError } from '../core/studio/analyze'
import { appUpdateTask } from './appUpdate'
import { downloadFile } from './download'
import { getCatalog } from './github'
import { isInstalling } from './installer'

/** Un profil du dossier Instances (jamais ailleurs). */
async function profileIn(path: string) {
  const { dir } = await resolveInstancesDir(await getSettings())
  if (dirname(resolve(path)).toLowerCase() !== resolve(dir).toLowerCase()) throw new StudioError('Ce profil n’est pas dans le dossier Instances de CurseForge.')
  const profile = await readProfile(path)
  if (!profile) throw new StudioError('Ce profil CurseForge est introuvable.')
  return profile
}

function busy(): void {
  if (isInstalling()) throw new StudioError('Patiente : un modpack est en cours d’installation.')
  const updating = appUpdateTask()
  if (updating) throw new StudioError(`Patiente : ${updating} est en cours.`)
}

/** Télécharge en vérifiant l'empreinte publiée : un fichier qui ne correspond pas n'est jamais posé. */
async function download(url: string, destination: string, sha256: string): Promise<void> {
  const result = await downloadFile({ url, destination })
  if (result.sha256 !== sha256.toLowerCase()) {
    await removeQuietly(destination)
    throw new StudioError('Le fichier téléchargé ne correspond pas à celui publié (empreinte différente) : rien n’a été ajouté.')
  }
}

export function registerExtrasIpc(): void {
  ipcMain.handle('extras:install', async (_e, profilePath: string, kind: ContentRelease['kind'], id: string, version: string) => {
    try {
      busy()
      const profile = await profileIn(String(profilePath))
      const item = (await getCatalog()).contents.find((c) => c.kind === kind && c.id === id)
      const release = item?.versions.find((v) => v.version === version)
      if (!release) throw new StudioError('Cette version n’est plus publiée : actualise la Bibliothèque.')
      // Le premier fichier qui convient au profil (un mod peut avoir un jar par chargeur ou par version de Minecraft).
      const file = release.files.find((f) => !incompatibility(release.kind, f, profile))
      if (!file) throw new StudioError(`${release.name} ${version} ne convient pas à ce profil : ${incompatibility(release.kind, release.files[0], profile)}.`)
      const extra: InstalledExtra = await installExtra(profile.path, release, file, download)
      return { ok: true, extra }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    }
  })
  ipcMain.handle('extras:remove', async (_e, profilePath: string, kind: ContentRelease['kind'], id: string) => {
    try {
      busy()
      const profile = await profileIn(String(profilePath))
      await removeExtra(profile.path, kind, String(id))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: describeError(err) }
    }
  })
}
