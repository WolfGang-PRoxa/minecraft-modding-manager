// Mise en ligne sur CurseForge avec le jeton d'auteur du publieur (API de minecraft.curseforge.com) : un fichier de
// modpack sur un projet existant, puis suivi de sa modération par l'API de lecture.
import { openAsBlob } from 'node:fs'
import { basename } from 'node:path'
import type { CurseForgeClient } from './curseforgeApi'
import { curseForgeApis, curseForgeSecret } from './curseforgeAuth'
import { StudioError } from './studio/analyze'

interface GameVersion {
  id: number
  gameVersionTypeID: number
  name: string
}

/** États d'un fichier sur CurseForge (FileStatus de l'API), tels qu'on les dit au publieur. */
export const FILE_STATUS_LABELS: Record<number, string> = {
  1: 'en traitement',
  2: 'modifications demandées',
  3: 'en cours de modération',
  4: 'approuvé',
  5: 'refusé',
  6: 'refusé (logiciel malveillant détecté)',
  7: 'supprimé',
  8: 'archivé',
  9: 'en test',
  10: 'publié',
  11: 'prêt pour la modération',
  12: 'obsolète',
  13: 'en traitement',
  14: 'en attente de publication',
  15: 'échec de la publication',
  16: 'en traitement',
  17: 'en traitement',
  18: 'en cours de modération',
  19: 'analyse antivirus en cours',
  20: 'en traitement',
  21: 'publication programmée',
  22: 'en traitement',
  23: 'en traitement'
}

/** Visible des joueurs (approuvé ou publié). */
export const isLiveStatus = (status: number) => status === 4 || status === 10

export class CurseForgeUploader {
  private versions: Promise<{ versions: GameVersion[]; minecraftTypes: Set<number> }> | null = null

  constructor(private readonly token: string) {}

  static async create(options: { dotenvDir?: string } = {}): Promise<CurseForgeUploader> {
    const token = await curseForgeSecret('uploadToken', options)
    if (!token) throw new StudioError('Aucun jeton d’auteur CurseForge : enregistre-le dans Paramètres → Compte CurseForge.')
    return new CurseForgeUploader(token.value)
  }

  private async get<T>(path: string): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${curseForgeApis().upload}/${path}`, { headers: { 'X-Api-Token': this.token }, signal: AbortSignal.timeout(60_000) })
    } catch {
      throw new StudioError('CurseForge est injoignable. Vérifie ta connexion internet.')
    }
    if (res.status === 401 || res.status === 403) throw new StudioError('CurseForge refuse le jeton d’auteur : vérifie-le dans Paramètres → Compte CurseForge.')
    if (!res.ok) throw new StudioError(`CurseForge a répondu ${res.status} (${path}).`)
    return (await res.json()) as T
  }

  /**
   * Identifiants de la version de Minecraft et du chargeur pour la mise en ligne. Une version de Minecraft existe en
   * plusieurs exemplaires (Minecraft, Bukkit, addons…) : on prend celle dont le type est un « minecraft-… ».
   */
  async gameVersionIds(minecraftVersion: string, loader: string | null): Promise<number[]> {
    this.versions ??= Promise.all([
      this.get<GameVersion[]>('game/versions'),
      this.get<Array<{ id: number; slug: string }>>('game/version-types')
    ]).then(([versions, types]) => ({ versions, minecraftTypes: new Set(types.filter((t) => t.slug.startsWith('minecraft-')).map((t) => t.id)) }))
    const { versions, minecraftTypes } = await this.versions
    const game = versions.find((v) => v.name === minecraftVersion && minecraftTypes.has(v.gameVersionTypeID))
    if (!game) throw new StudioError(`CurseForge ne connaît pas Minecraft ${minecraftVersion}.`)
    const loaderName = { forge: 'Forge', neoforge: 'NeoForge', fabric: 'Fabric', quilt: 'Quilt' }[/^(neoforge|forge|fabric|quilt)/i.exec(loader ?? '')?.[1].toLowerCase() ?? '']
    const loaderVersion = loaderName ? versions.find((v) => v.name === loaderName) : undefined
    return loaderVersion ? [game.id, loaderVersion.id] : [game.id]
  }

  /** Met un fichier en ligne sur un projet ; renvoie l'identifiant du fichier créé (il passe ensuite en modération). */
  async upload(
    projectId: number,
    file: string,
    metadata: { displayName: string; changelog: string; releaseType: 'release' | 'beta' | 'alpha'; gameVersions: number[] }
  ): Promise<number> {
    const form = new FormData()
    form.set('metadata', JSON.stringify({ ...metadata, changelogType: 'markdown' }))
    form.set('file', await openAsBlob(file), basename(file))
    let res: Response
    try {
      res = await fetch(`${curseForgeApis().upload}/projects/${projectId}/upload-file`, {
        method: 'POST',
        headers: { 'X-Api-Token': this.token },
        body: form,
        signal: AbortSignal.timeout(600_000)
      })
    } catch {
      throw new StudioError('Envoi vers CurseForge interrompu : vérifie ta connexion internet.')
    }
    const text = await res.text()
    if (!res.ok) {
      let detail = text.slice(0, 300)
      try {
        detail = (JSON.parse(text) as { errorMessage?: string }).errorMessage ?? detail
      } catch {
        // réponse non JSON
      }
      if (res.status === 403 || res.status === 401) throw new StudioError(`CurseForge refuse l’envoi : ${detail} (le jeton doit appartenir à un auteur du projet).`)
      if (res.status === 404) throw new StudioError(`Projet CurseForge ${projectId} introuvable.`)
      throw new StudioError(`CurseForge a refusé le fichier (${res.status}) : ${detail}`)
    }
    const id = Number((JSON.parse(text) as { id?: unknown }).id)
    if (!Number.isInteger(id)) throw new StudioError('CurseForge n’a pas renvoyé l’identifiant du fichier envoyé.')
    return id
  }
}

/** État de modération des fichiers donnés (API de lecture). */
export async function fileStatuses(client: CurseForgeClient, fileIds: number[]): Promise<Map<number, { status: number; label: string; displayName: string }>> {
  const files = fileIds.length ? await client.getFiles(fileIds) : []
  return new Map(
    files.map((f) => {
      const status = Number((f as unknown as { fileStatus?: number }).fileStatus ?? 0)
      return [f.id, { status, label: FILE_STATUS_LABELS[status] ?? `état ${status}`, displayName: f.displayName }]
    })
  )
}
