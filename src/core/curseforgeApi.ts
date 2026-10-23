// Client de l'API de lecture de CurseForge (api.curseforge.com), avec la clé du publieur : projets (mods, packs de
// textures, shaders), leurs fichiers et leurs notes de version. Seulement les champs dont l'application se sert.
import { downloadCurseForgeFile } from './addonFiles'
import { curseForgeApis, curseForgeSecret } from './curseforgeAuth'
import { StudioError } from './studio/analyze'

/** Catégories de projets CurseForge qu'un profil peut contenir (`categoryClassID` dans installedAddons). */
export const CLASS_IDS = { mod: 6, resourcepack: 12, shader: 6552 } as const

/** ModLoaderType de l'API. */
export const LOADER_TYPES = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 } as const

/** FileRelationType : dépendance obligatoire. */
export const REQUIRED_DEPENDENCY = 3

export interface CfFileIndex {
  gameVersion: string
  fileId: number
  filename: string
  /** 1 release, 2 beta, 3 alpha. */
  releaseType: number
  modLoader: number | null
}

export interface CfMod {
  id: number
  name: string
  slug: string
  classId: number | null
  isAvailable: boolean
  allowModDistribution: boolean | null
  links: { websiteUrl: string | null }
  latestFilesIndexes: CfFileIndex[]
  authors?: Array<{ id: number; name: string }>
  logo?: { thumbnailUrl: string | null } | null
  categories?: Array<{ id: number }>
  primaryCategoryId?: number
}

export interface CfFile {
  id: number
  modId: number
  displayName: string
  fileName: string
  releaseType: number
  fileDate: string
  fileLength: number
  downloadUrl: string | null
  isAvailable: boolean
  gameVersions: string[]
  hashes: Array<{ value: string; algo: number }>
  dependencies: Array<{ modId: number; relationType: number }>
  /** FileStatus de CurseForge (3 en modération, 4 approuvé, 5 refusé, 10 publié…). */
  fileStatus?: number
  /** Pack serveur joint à une version (non listé par l'API publique, d'après les fichiers du propriétaire). */
  isServerPack?: boolean
}

export class CurseForgeApiError extends StudioError {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

/** Taille de page la plus grande acceptée par l'API, et nombre de pages lues au plus (1 000 fichiers). */
const FILE_PAGE_SIZE = 50
const MAX_FILE_PAGES = 20

export class CurseForgeClient {
  constructor(private readonly apiKey: string) {}

  /** Client avec la clé du publieur (enregistrée, variable d'environnement ou .env), ou une erreur qui dit quoi faire. */
  static async create(options: { dotenvDir?: string } = {}): Promise<CurseForgeClient> {
    const key = await curseForgeSecret('apiKey', options)
    if (!key) {
      throw new StudioError('Aucune clé de l’API CurseForge : enregistre-la dans Paramètres → Compte CurseForge.')
    }
    return new CurseForgeClient(key.value)
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    return (await this.send<{ data: T }>(method, path, body)).data
  }

  private async send<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${curseForgeApis().core}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'x-api-key': this.apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000)
      })
    } catch {
      throw new StudioError('CurseForge est injoignable. Vérifie ta connexion internet.')
    }
    if (res.status === 403) {
      throw new CurseForgeApiError('CurseForge refuse la clé d’API : vérifie-la dans Paramètres → Compte CurseForge.', 403)
    }
    if (res.status === 404) throw new CurseForgeApiError(`Introuvable sur CurseForge (${method} ${path}).`, 404)
    if (!res.ok) throw new CurseForgeApiError(`CurseForge a répondu ${res.status} (${method} ${path}).`, res.status)
    return (await res.json()) as T
  }

  /** Projets, par lots (l'API les accepte en une requête ; on reste raisonnable). */
  async getMods(ids: number[]): Promise<CfMod[]> {
    const mods: CfMod[] = []
    for (let i = 0; i < ids.length; i += 200) {
      mods.push(...(await this.request<CfMod[]>('POST', '/v1/mods', { modIds: ids.slice(i, i + 200), filterPcOnly: true })))
    }
    return mods
  }

  async getFiles(ids: number[]): Promise<CfFile[]> {
    const files: CfFile[] = []
    for (let i = 0; i < ids.length; i += 200) {
      files.push(...(await this.request<CfFile[]>('POST', '/v1/mods/files', { fileIds: ids.slice(i, i + 200) })))
    }
    return files
  }

  /** Un modpack d'après l'adresse de sa page (slug), ou null. */
  async searchModpackBySlug(slug: string): Promise<CfMod | null> {
    return this.searchBySlug(slug, 4471)
  }

  /** Projet d'une classe (mods 6, modpacks 4471…) d'après son slug, ou null. */
  async searchBySlug(slug: string, classId: number): Promise<CfMod | null> {
    const found = await this.request<CfMod[]>('GET', `/v1/mods/search?gameId=432&classId=${classId}&slug=${encodeURIComponent(slug)}`)
    return found[0] ?? null
  }

  /** Fichiers d'un projet, du plus récent au plus ancien, pour une version de Minecraft et un chargeur. */
  getModFiles(modId: number, filter: { gameVersion?: string; modLoaderType?: number | null } = {}): Promise<CfFile[]> {
    const query = new URLSearchParams({ pageSize: '50' })
    if (filter.gameVersion) query.set('gameVersion', filter.gameVersion)
    if (filter.modLoaderType) query.set('modLoaderType', String(filter.modLoaderType))
    return this.request<CfFile[]>('GET', `/v1/mods/${modId}/files?${query}`)
  }

  /** Tous les fichiers d'un projet (pages de 50), du plus récent au plus ancien ; pour un modpack, pas pour un mod. */
  async getAllModFiles(modId: number): Promise<CfFile[]> {
    const files: CfFile[] = []
    for (let page = 0; page < MAX_FILE_PAGES; page++) {
      const query = new URLSearchParams({ pageSize: String(FILE_PAGE_SIZE), index: String(files.length) })
      const { data, pagination } = await this.send<{ data: CfFile[]; pagination?: { totalCount?: number } }>('GET', `/v1/mods/${modId}/files?${query}`)
      files.push(...data)
      if (data.length < FILE_PAGE_SIZE || files.length >= (pagination?.totalCount ?? 0)) break
    }
    return files
  }

  /** Télécharge un fichier de CurseForge (avec la clé) et vérifie son empreinte. */
  download(file: CfFile, destination: string): Promise<void> {
    return downloadCurseForgeFile(file, destination, this.apiKey)
  }

  /** Notes de version d'un fichier, en HTML. */
  getChangelog(modId: number, fileId: number): Promise<string> {
    return this.request<string>('GET', `/v1/mods/${modId}/files/${fileId}/changelog`)
  }
}
