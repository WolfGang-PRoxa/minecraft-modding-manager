import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { CONTENT_MANIFEST_ASSET, MODPACK_MANIFEST_ASSET } from '../../shared/config'
import {
  CONTENT_KINDS,
  contentTag,
  isContentManifest,
  LOADER_LABELS,
  parseContentTag,
  type ContentKind,
  type ContentManifest,
  type ModLoader
} from '../../shared/content'
import { formatLoader } from '../../shared/format'
import {
  findManifestAsset,
  isModpackManifest,
  modpackTag,
  parseModpackTag,
  type GhAsset,
  type GhRelease
} from '../../shared/releases'
import {
  matchesDisabledMod,
  type DisabledMod,
  type PublishProgress,
  type PublishResult,
  type SyncAction,
  type SyncPlan
} from '../../shared/studio'
import type { ModpackManifest } from '../../shared/types'
import { describeError, type AnalyzedMod, type CachedAnalysis } from './analyze'
import { CancelledError, GitHubError, type GitHubClient, type UploadSource } from './githubApi'
import type { LocalModVersion } from './mods'
import type { LocalPack, LocalVersion, LocalWorkspace } from './workspace'

// ---------------------------------------------------------------------------------------------
// État de GitHub

export interface RemoteState {
  releases: GhRelease[]
  /** modpack.json déjà lus, par « id:date » de l'asset (conservés d'une lecture à l'autre). */
  manifests: Map<string, ModpackManifest | null>
  /** content.json des autres contenus (mods…), de même. */
  contents: Map<string, ContentManifest | null>
}

/** Types autres que le modpack que le Studio publie déjà : leurs releases sont lues, mises à jour et retirées. */
const PUBLISHED_CONTENT = (Object.keys(CONTENT_KINDS) as ContentKind[]).filter((k) => k !== 'modpack' && CONTENT_KINDS[k].supported)

/** Type d'un tag de release que la publication gère (modpack ou contenu pris en charge), sinon null. */
function managedKind(tag: string): ContentKind | null {
  const parsed = parseContentTag(tag)
  return parsed && (parsed.kind === 'modpack' || PUBLISHED_CONTENT.includes(parsed.kind)) ? parsed.kind : null
}

const assetKey = (asset: GhAsset) => `${asset.id}:${asset.updated_at}`

async function mapLimit<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item)
    })
  )
}

export async function fetchRemoteState(client: GitHubClient, previous: RemoteState | null): Promise<RemoteState> {
  const releases = await client.listReleases()
  const manifests = new Map<string, ModpackManifest | null>()
  const contents = new Map<string, ContentManifest | null>()
  const assets: Array<{ asset: GhAsset; content: boolean }> = []
  for (const release of releases) {
    const kind = managedKind(release.tag_name)
    if (!kind) continue
    const asset = release.assets.find((a) => a.name === CONTENT_KINDS[kind].manifest)
    if (asset) assets.push({ asset, content: kind !== 'modpack' })
  }

  await mapLimit(assets, 6, async ({ asset, content }) => {
    const key = assetKey(asset)
    if (content && previous?.contents.has(key)) {
      contents.set(key, previous.contents.get(key)!)
      return
    }
    if (!content && previous?.manifests.has(key)) {
      manifests.set(key, previous.manifests.get(key)!)
      return
    }
    // Une erreur réseau fait échouer la lecture : un manifeste considéré à tort comme absent
    // provoquerait le renvoi de toute la version.
    const text = await client.downloadAssetText(asset)
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      // illisible : comme absent
    }
    if (content) contents.set(key, isContentManifest(json) ? json : null)
    else manifests.set(key, isModpackManifest(json) ? json : null)
  })
  return { releases, manifests, contents }
}

function contentManifestOf(release: GhRelease, remote: RemoteState): ContentManifest | null {
  const asset = release.assets.find((a) => a.name === CONTENT_MANIFEST_ASSET)
  return asset ? (remote.contents.get(assetKey(asset)) ?? null) : null
}

function manifestOf(release: GhRelease, remote: RemoteState): ModpackManifest | null {
  const asset = findManifestAsset(release)
  return asset ? (remote.manifests.get(assetKey(asset)) ?? null) : null
}

// ---------------------------------------------------------------------------------------------
// Ce qui doit exister sur GitHub

export interface Desired {
  pack: LocalPack
  version: LocalVersion & { analysis: CachedAnalysis }
  tag: string
  releaseName: string
  body: string
  zipName: string
  coverName: string | null
  /** Manifeste attendu, sans date de création. */
  manifest: ModpackManifest
}

export function releaseBody(notes: string, analysis: CachedAnalysis): string {
  const footer = [
    analysis.minecraftVersion && `Minecraft ${analysis.minecraftVersion}`,
    formatLoader(analysis.modLoader),
    analysis.modCount !== null && `${analysis.modCount} mod${analysis.modCount > 1 ? 's' : ''}`
  ]
    .filter(Boolean)
    .join(' · ')
  const text = notes.trim()
  return `${text}${text && footer ? '\n\n---\n' : ''}${footer ? `_${footer}_` : ''}`
}

/** Fichiers des mods de cette version que les joueurs reçoivent désactivés (ceux déjà désactivés dans le zip le sont d'office). */
export function disabledFilesOf(mods: AnalyzedMod[], disabledMods: DisabledMod[]): string[] {
  if (!disabledMods.length) return []
  return mods
    .filter((mod) => !mod.disabled && disabledMods.some((entry) => matchesDisabledMod(mod, entry)))
    .map((mod) => mod.file)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

function desiredFor(pack: LocalPack, version: LocalVersion & { analysis: CachedAnalysis }, author: string): Desired {
  const { id, name, description, notes, disabledMods, keepPlayerConfigs } = pack.meta
  const number = String(version.number)
  const coverName = pack.cover ? `cover${extname(pack.cover.fileName).toLowerCase()}` : null
  const zipName = `${id}-${number}.zip`
  const a = version.analysis
  const disabled = disabledFilesOf(a.mods, disabledMods)
  return {
    pack,
    version,
    tag: modpackTag(id, number),
    releaseName: `${name} v${number}`,
    body: releaseBody(notes[number] ?? '', a),
    zipName,
    coverName,
    manifest: {
      schema: 1,
      id,
      name,
      version: number,
      minecraftVersion: a.minecraftVersion,
      modLoader: a.modLoader,
      modCount: a.modCount,
      description,
      archive: zipName,
      archiveSize: version.size,
      archiveSha256: a.sha256,
      cover: coverName,
      coverSha256: pack.cover?.sha256 ?? null,
      modsSignature: a.modsSignature,
      // Réglages pour les joueurs : absents tant qu'ils ne servent pas, pour ne rien renvoyer aux releases existantes.
      ...(disabled.length ? { disabledMods: disabled } : {}),
      ...(keepPlayerConfigs ? { keepPlayerConfigs: true } : {}),
      author,
      createdAt: ''
    }
  }
}

/** Un fichier à joindre à la release d'un contenu. */
export interface ContentAsset {
  name: string
  path: string
  size: number
  sha256: string
  type: string
}

/** Ce qui doit exister sur GitHub pour une version d'un contenu qui n'est pas un modpack (un mod…). */
export interface ContentDesired {
  pack: LocalPack
  version: LocalModVersion
  tag: string
  releaseName: string
  body: string
  /** Les jars, puis l'image s'il y en a une. */
  assets: ContentAsset[]
  /** Manifeste attendu, sans date de création. */
  manifest: ContentManifest
}

const JAR_TYPE = 'application/java-archive'

/** Chargeurs à afficher : Quilt charge les mods Fabric, il n'est cité que pour un mod qui le vise seul. */
export function shownLoaders(loaders: ModLoader[]): string[] {
  const unique = [...new Set(loaders)]
  return unique.filter((l) => !(l === 'quilt' && unique.includes('fabric'))).map((l) => LOADER_LABELS[l])
}

function contentDesiredFor(pack: LocalPack, version: LocalModVersion, author: string): ContentDesired {
  const { id, name, description, notes } = pack.meta
  const coverName = pack.cover ? `cover${extname(pack.cover.fileName).toLowerCase()}` : null
  const files = version.files.map((f) => ({
    name: f.fileName,
    size: f.size,
    sha256: f.analysis.sha256,
    sha1: f.analysis.sha1,
    loaders: f.analysis.loaders,
    minecraftVersions: f.analysis.minecraftVersions
  }))
  const minecraftVersions = [...new Set(files.flatMap((f) => f.minecraftVersions))]
  const loaders = [...new Set(files.flatMap((f) => f.loaders))]
  const footer = [minecraftVersions.length ? `Minecraft ${minecraftVersions.join(', ')}` : '', shownLoaders(loaders).join(', ')].filter(Boolean).join(' · ')
  const text = (notes[version.version] ?? '').trim()
  const assets: ContentAsset[] = version.files.map((f) => ({ name: f.fileName, path: f.path, size: f.size, sha256: f.analysis.sha256, type: JAR_TYPE }))
  if (pack.cover && coverName) {
    assets.push({ name: coverName, path: pack.cover.path, size: pack.cover.size, sha256: pack.cover.sha256, type: IMAGE_TYPES[extname(coverName)] ?? 'image/png' })
  }
  return {
    pack,
    version,
    tag: contentTag(pack.meta.type, id, version.version),
    releaseName: `${name} ${version.version}`,
    body: `${text}${text && footer ? '\n\n---\n' : ''}${footer ? `_${footer}_` : ''}`,
    assets,
    manifest: {
      schema: 1,
      type: pack.meta.type,
      id,
      name,
      version: version.version,
      description,
      minecraftVersions,
      loaders,
      files,
      cover: coverName,
      coverSha256: pack.cover?.sha256 ?? null,
      author,
      createdAt: ''
    }
  }
}

/** Manifeste comparable (sans date de création). */
const contentComparable = (m: ContentManifest) => JSON.stringify({ ...m, createdAt: '' })

const MANIFEST_FIELDS: Array<keyof ModpackManifest> = [
  'schema',
  'id',
  'name',
  'version',
  'minecraftVersion',
  'modLoader',
  'modCount',
  'description',
  'archive',
  'archiveSize',
  'archiveSha256',
  'cover',
  'coverSha256',
  'modsSignature',
  'disabledMods',
  'keepPlayerConfigs',
  'author'
]

/** Champs réglés dans « Réglages des versions » : un changement ne renvoie que modpack.json. */
const PLAYER_SETTINGS_FIELDS: Array<keyof ModpackManifest> = ['disabledMods', 'keepPlayerConfigs']

/** Valeur comparable d'un champ : absent, vide et faux se valent. */
function comparable(value: unknown): string | null {
  if (value === undefined || value === null || value === false) return null
  if (Array.isArray(value) && value.length === 0) return null
  return JSON.stringify(value)
}

function differingFields(a: ModpackManifest, b: ModpackManifest): Array<keyof ModpackManifest> {
  return MANIFEST_FIELDS.filter((field) => comparable(a[field]) !== comparable(b[field]))
}

/** Ce qui change pour les joueurs quand seuls les réglages des versions ont changé. */
function settingsChanges(fields: Array<keyof ModpackManifest>, manifest: ModpackManifest): string[] {
  const changes: string[] = []
  if (fields.includes('disabledMods')) {
    const count = manifest.disabledMods?.length ?? 0
    changes.push(
      count
        ? `Mods désactivés chez les joueurs : ${count} dans cette version`
        : 'Plus aucun mod désactivé chez les joueurs dans cette version'
    )
  }
  if (fields.includes('keepPlayerConfigs')) {
    changes.push(
      manifest.keepPlayerConfigs
        ? 'Les configurations modifiées par les joueurs seront gardées à la mise à jour'
        : 'Le dossier config des joueurs sera de nouveau remplacé à la mise à jour'
    )
  }
  return changes
}

const normalizeText = (text: string | null) => (text ?? '').replace(/\r\n/g, '\n').trim()

// ---------------------------------------------------------------------------------------------
// Plan

export type Step =
  | { kind: 'create'; action: SyncAction; desired: Desired; drafts: GhRelease[] }
  | {
      kind: 'update'
      action: SyncAction
      desired: Desired
      release: GhRelease
      drafts: GhRelease[]
      createdAt: string | null
      archive: boolean
      cover: boolean
      manifest: boolean
      release_: boolean
      extraneous: GhAsset[]
    }
  | { kind: 'delete'; action: SyncAction; releases: GhRelease[] }
  | { kind: 'create-content'; action: SyncAction; desired: ContentDesired; drafts: GhRelease[] }
  | {
      kind: 'update-content'
      action: SyncAction
      desired: ContentDesired
      release: GhRelease
      drafts: GhRelease[]
      createdAt: string | null
      /** Fichiers à (r)envoyer. */
      replace: ContentAsset[]
      manifest: boolean
      release_: boolean
      extraneous: GhAsset[]
    }

export interface InternalPlan {
  view: SyncPlan
  steps: Step[]
  /** Statut GitHub de chaque version locale, par tag. */
  statuses: Map<string, { status: 'published' | 'create' | 'update'; changes: string[] }>
}

function formatSize(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go']
  let i = 0
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024
    i++
  }
  return `${bytes.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[i]}`
}

/** `author` : propriétaire du dépôt, inscrit dans chaque modpack.json. */
export function computePlan(workspace: LocalWorkspace, remote: RemoteState, author: string): InternalPlan {
  const desired = new Map<string, Desired>()
  const contentDesired = new Map<string, ContentDesired>()
  /** Contenus en erreur ou pas publiés sur GitHub, par « type:id » : leurs releases ne sont jamais touchées. */
  const blockedContent = new Set<string>()
  const blockedIds = new Set<string>()
  const blockedTags = new Set<string>()
  const warnings: string[] = []
  let pendingZips = 0

  for (const pack of workspace.packs) {
    pendingZips += pack.pending.filter((zip) => !zip.error).length
    if (pack.errors.length) {
      if (pack.meta.type === 'modpack') blockedIds.add(pack.meta.id)
      else blockedContent.add(`${pack.meta.type}:${pack.meta.id}`)
      warnings.push(`« ${pack.meta.name} » est ignoré tant que ses erreurs ne sont pas corrigées.`)
      continue
    }
    // Autre contenu qu'un modpack : publié sous son propre préfixe de tag, jamais sous `pack-`.
    if (pack.meta.type !== 'modpack') {
      if (!pack.meta.github) blockedContent.add(`${pack.meta.type}:${pack.meta.id}`)
      else {
        for (const version of pack.modVersions) {
          const d = contentDesiredFor(pack, version, author)
          contentDesired.set(d.tag, d)
        }
      }
      continue
    }
    // Modpack publié seulement sur CurseForge : rien n'est publié sur GitHub, et ses releases n'y sont jamais retirées.
    if (!pack.meta.github) {
      blockedIds.add(pack.meta.id)
      continue
    }
    for (const version of pack.versions) {
      const tag = modpackTag(pack.meta.id, String(version.number))
      if (version.analysis) desired.set(tag, desiredFor(pack, version as Desired['version'], author))
      else blockedTags.add(tag)
    }
  }

  const byTag = new Map<string, GhRelease[]>()
  const contentByTag = new Map<string, GhRelease[]>()
  for (const release of remote.releases) {
    const kind = managedKind(release.tag_name)
    if (!kind) continue
    const map = kind === 'modpack' ? byTag : contentByTag
    map.set(release.tag_name, [...(map.get(release.tag_name) ?? []), release])
  }

  const steps: Step[] = []
  const statuses: InternalPlan['statuses'] = new Map()

  for (const [tag, d] of desired) {
    const releases = byTag.get(tag) ?? []
    const published = releases.find((r) => !r.draft)
    const drafts = releases.filter((r) => r !== published)
    const label = `${d.pack.meta.name} v${d.version.number}`
    const coverSize = d.pack.cover?.size ?? 0

    if (!published) {
      const details = [`Nouvelle release : ${d.version.fileName} (${formatSize(d.version.size)})`]
      if (d.coverName) details.push(`Image de couverture : ${d.pack.cover!.fileName}`)
      if (drafts.length) details.push('Un brouillon abandonné sera supprimé.')
      steps.push({
        kind: 'create',
        desired: d,
        drafts,
        action: { kind: 'create', tag, packId: d.pack.meta.id, label, details, warnings: [], uploadBytes: d.version.size + coverSize }
      })
      statuses.set(tag, { status: 'create', changes: ['Nouvelle version'] })
      continue
    }

    const remoteManifest = manifestOf(published, remote)
    const zipAsset = published.assets.find((a) => a.name === d.zipName)
    const archive =
      !zipAsset ||
      zipAsset.size !== d.version.size ||
      remoteManifest?.archiveSha256 !== d.version.analysis.sha256 ||
      remoteManifest?.archive !== d.zipName
    const coverAsset = d.coverName ? published.assets.find((a) => a.name === d.coverName) : null
    const cover =
      d.coverName !== null &&
      (!coverAsset || coverAsset.size !== coverSize || remoteManifest?.coverSha256 !== d.pack.cover!.sha256)
    const outdated = remoteManifest ? differingFields(remoteManifest, d.manifest) : []
    const manifest = archive || cover || !remoteManifest || outdated.length > 0
    const release_ =
      published.name !== d.releaseName || normalizeText(published.body) !== normalizeText(d.body) || published.prerelease
    const keep = new Set([d.zipName, MODPACK_MANIFEST_ASSET, d.coverName])
    const extraneous = published.assets.filter((a) => !keep.has(a.name))

    if (!archive && !cover && !manifest && !release_ && !extraneous.length && !drafts.length) {
      statuses.set(tag, { status: 'published', changes: [] })
      continue
    }

    const details: string[] = []
    const stepWarnings: string[] = []
    if (archive) {
      const changed = Boolean(remoteManifest?.archiveSha256 && zipAsset) && remoteManifest!.archiveSha256 !== d.version.analysis.sha256
      details.push(changed ? 'Zip remplacé : son contenu a changé' : 'Zip renvoyé (absent ou incomplet sur GitHub)')
      if (changed) {
        stepWarnings.push(
          `Les joueurs qui ont déjà la v${d.version.number} ne seront pas prévenus de ce changement : pour une mise à jour, dépose plutôt un nouveau zip.`
        )
      }
    }
    if (cover) details.push('Nouvelle image de couverture')
    if (manifest && !archive && !cover) {
      const settings = outdated.filter((field) => PLAYER_SETTINGS_FIELDS.includes(field))
      const others = outdated.filter((field) => !PLAYER_SETTINGS_FIELDS.includes(field))
      // Version publiée avant que l'empreinte des mods existe : seul modpack.json est renvoyé.
      if (others.length === 1 && others[0] === 'modsSignature') {
        details.push('Empreinte des mods ajoutée : cette version pourra être reconnue dans le CurseForge des joueurs')
      } else if (others.length || !remoteManifest) {
        details.push('Infos du modpack mises à jour (nom, description…)')
      }
      details.push(...settingsChanges(settings, d.manifest))
    }
    if (release_) details.push('Titre ou notes de version mis à jour')
    if (extraneous.length) details.push(`Fichiers en trop retirés : ${extraneous.map((a) => a.name).join(', ')}`)
    if (drafts.length) details.push('Brouillon abandonné supprimé')

    steps.push({
      kind: 'update',
      desired: d,
      release: published,
      drafts,
      createdAt: remoteManifest?.createdAt ?? null,
      archive,
      cover,
      manifest,
      release_,
      extraneous,
      action: {
        kind: 'update',
        tag,
        packId: d.pack.meta.id,
        label,
        details,
        warnings: stepWarnings,
        uploadBytes: (archive ? d.version.size : 0) + (cover ? coverSize : 0)
      }
    })
    statuses.set(tag, { status: 'update', changes: details })
  }

  for (const [tag, d] of contentDesired) {
    const releases = contentByTag.get(tag) ?? []
    const published = releases.find((r) => !r.draft)
    const drafts = releases.filter((r) => r !== published)
    const label = d.releaseName
    const jars = d.assets.filter((a) => a.type === JAR_TYPE)
    if (!published) {
      const details = [`Nouvelle release : ${jars.map((f) => `${f.name} (${formatSize(f.size)})`).join(', ')}`]
      if (d.manifest.cover) details.push(`Image de couverture : ${d.pack.cover!.fileName}`)
      if (drafts.length) details.push('Un brouillon abandonné sera supprimé.')
      const uploadBytes = d.assets.reduce((sum, a) => sum + a.size, 0)
      steps.push({ kind: 'create-content', desired: d, drafts, action: { kind: 'create', tag, packId: d.pack.meta.id, label, details, warnings: [], uploadBytes } })
      statuses.set(tag, { status: 'create', changes: ['Nouvelle version'] })
      continue
    }
    const remoteManifest = contentManifestOf(published, remote)
    const remoteSha = new Map<string, string>((remoteManifest?.files ?? []).map((f) => [f.name, f.sha256]))
    if (remoteManifest?.cover && remoteManifest.coverSha256) remoteSha.set(remoteManifest.cover, remoteManifest.coverSha256)
    const replace = d.assets.filter((a) => {
      const asset = published.assets.find((x) => x.name === a.name)
      return !asset || asset.size !== a.size || remoteSha.get(a.name) !== a.sha256
    })
    const manifest = replace.length > 0 || !remoteManifest || contentComparable(remoteManifest) !== contentComparable(d.manifest)
    const release_ = published.name !== d.releaseName || normalizeText(published.body) !== normalizeText(d.body) || published.prerelease
    const keep = new Set([...d.assets.map((a) => a.name), CONTENT_MANIFEST_ASSET])
    const extraneous = published.assets.filter((a) => !keep.has(a.name))
    if (!replace.length && !manifest && !release_ && !extraneous.length && !drafts.length) {
      statuses.set(tag, { status: 'published', changes: [] })
      continue
    }
    const details: string[] = []
    const stepWarnings: string[] = []
    const changedJars = replace.filter((a) => a.type === JAR_TYPE)
    if (changedJars.length) {
      const replaced = changedJars.filter((a) => published.assets.some((x) => x.name === a.name) && remoteSha.has(a.name))
      details.push(`${replaced.length ? 'Fichier remplacé' : 'Fichier envoyé'} : ${changedJars.map((a) => a.name).join(', ')}`)
      if (replaced.length) stepWarnings.push(`Le contenu de la version ${d.version.version} a changé : pour une mise à jour, publie plutôt une nouvelle version du mod.`)
    }
    if (replace.some((a) => a.type !== JAR_TYPE)) details.push('Nouvelle image de couverture')
    if (manifest && !replace.length) details.push('Infos du mod mises à jour (nom, description…)')
    if (release_) details.push('Titre ou notes de version mis à jour')
    if (extraneous.length) details.push(`Fichiers en trop retirés : ${extraneous.map((a) => a.name).join(', ')}`)
    if (drafts.length) details.push('Brouillon abandonné supprimé')
    steps.push({
      kind: 'update-content',
      desired: d,
      release: published,
      drafts,
      createdAt: remoteManifest?.createdAt ?? null,
      replace,
      manifest,
      release_,
      extraneous,
      action: { kind: 'update', tag, packId: d.pack.meta.id, label, details, warnings: stepWarnings, uploadBytes: replace.reduce((sum, a) => sum + a.size, 0) }
    })
    statuses.set(tag, { status: 'update', changes: details })
  }

  for (const [tag, releases] of contentByTag) {
    if (contentDesired.has(tag)) continue
    const parsed = parseContentTag(tag)!
    if (blockedContent.has(`${parsed.kind}:${parsed.id}`)) continue
    const published = releases.find((r) => !r.draft)
    const manifest = published ? contentManifestOf(published, remote) : null
    const pack = workspace.packs.find((p) => p.meta.type === parsed.kind && p.meta.id === parsed.id)
    const name = manifest?.name ?? pack?.meta.name ?? parsed.id
    steps.push({
      kind: 'delete',
      releases,
      action: {
        kind: 'delete',
        tag,
        packId: parsed.id,
        label: `${name} ${parsed.version}`,
        details: [
          !published
            ? 'Brouillon abandonné'
            : pack
              ? 'Ses fichiers ne sont plus dans le dossier'
              : `Le dossier de ce ${CONTENT_KINDS[parsed.kind].label} n’existe plus`
        ],
        warnings: [],
        uploadBytes: 0
      }
    })
  }

  for (const [tag, releases] of byTag) {
    if (desired.has(tag) || blockedTags.has(tag)) continue
    const parsed = parseModpackTag(tag)
    if (parsed && blockedIds.has(parsed.id)) continue
    const published = releases.find((r) => !r.draft)
    const manifest = published ? manifestOf(published, remote) : null
    const pack = workspace.packs.find((p) => p.meta.id === parsed?.id)
    const name = manifest?.name ?? pack?.meta.name ?? parsed?.id ?? tag
    steps.push({
      kind: 'delete',
      releases,
      action: {
        kind: 'delete',
        tag,
        packId: parsed?.id ?? '',
        label: parsed ? `${name} v${parsed.version}` : tag,
        details: [
          !published
            ? 'Brouillon abandonné'
            : pack
              ? 'Son zip n’est plus dans le dossier du modpack'
              : 'Le dossier de ce modpack n’existe plus'
        ],
        warnings: [],
        uploadBytes: 0
      }
    })
  }

  // Modpacks qui disparaîtraient complètement de l'application.
  const deletedIds = new Set(steps.filter((s) => s.kind === 'delete').map((s) => s.action.packId))
  const remainingIds = new Set([...desired.values(), ...contentDesired.values()].map((d) => d.pack.meta.id))
  for (const id of deletedIds) {
    if (!id || remainingIds.has(id)) continue
    const label = steps.find((s) => s.action.packId === id)!.action.label.replace(/ v[^ ]+$/, '')
    warnings.push(`« ${label} » n’aura plus aucune version : il disparaîtra de l’application des joueurs.`)
  }
  if (workspace.packs.length === 0 && deletedIds.size > 0) {
    warnings.unshift('Le dossier ne contient aucun modpack : publier supprimerait tout de GitHub. Vérifie le dossier choisi.')
  }

  const order = { create: 0, 'create-content': 0, update: 1, 'update-content': 1, delete: 2 }
  steps.sort((a, b) => order[a.kind] - order[b.kind] || a.action.label.localeCompare(b.action.label, 'fr', { numeric: true }))

  const actions = steps.map((s) => s.action)
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify(
        steps.map((s) => [
          s.kind,
          s.action.tag,
          s.action.details,
          s.kind === 'delete'
            ? s.releases.map((r) => r.id)
            : s.kind === 'create-content' || s.kind === 'update-content'
              ? [s.desired.manifest]
              : [s.desired.version.analysis.sha256, s.desired.manifest]
        ])
      )
    )
    .digest('hex')

  return {
    steps,
    statuses,
    view: {
      actions,
      fingerprint,
      warnings,
      uploadBytes: actions.reduce((sum, a) => sum + a.uploadBytes, 0),
      pendingZips
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Publication

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

class SpeedMeter {
  private samples: Array<{ t: number; bytes: number }> = []

  push(bytes: number): number {
    const now = Date.now()
    if (this.samples.length && bytes < this.samples[this.samples.length - 1].bytes) this.samples = []
    this.samples.push({ t: now, bytes })
    while (this.samples.length > 2 && now - this.samples[0].t > 4000) this.samples.shift()
    const first = this.samples[0]
    const elapsed = (now - first.t) / 1000
    return elapsed > 0.3 ? (bytes - first.bytes) / elapsed : 0
  }
}

export interface ApplyOptions {
  onProgress: (progress: PublishProgress) => void
  signal: AbortSignal
}

export async function applyPlan(client: GitHubClient, plan: InternalPlan, options: ApplyOptions): Promise<PublishResult> {
  const { signal } = options
  const progress: PublishProgress = {
    steps: plan.steps.map((s) => ({ tag: s.action.tag, kind: s.action.kind, label: s.action.label, status: 'pending' })),
    current: null
  }
  let lastEmit = 0
  const emit = (force = true) => {
    const now = Date.now()
    if (!force && now - lastEmit < 150) return
    lastEmit = now
    options.onProgress(structuredClone(progress))
  }
  const say = (text: string) => {
    progress.current = { text, done: 0, total: 0, bytesPerSecond: 0 }
    emit()
  }

  const upload = async (release: GhRelease, source: UploadSource, name: string, type: string): Promise<GhAsset> => {
    const meter = new SpeedMeter()
    for (let attempt = 1; ; attempt++) {
      say(`Envoi de ${name}`)
      try {
        return await client.uploadAsset(release, source, name, type, {
          signal,
          onProgress: (done, total) => {
            progress.current = { text: `Envoi de ${name}`, done, total, bytesPerSecond: meter.push(done) }
            emit(done === total)
          }
        })
      } catch (err) {
        const definitive = err instanceof GitHubError && err.status < 500
        if (signal.aborted || definitive || attempt >= 3) throw err
        // GitHub peut garder un fichier incomplet sous ce nom : on le retire avant de réessayer.
        const fresh = await client.getRelease(release.id)
        const stale = fresh.assets.find((a) => a.name === name)
        if (stale) await client.deleteAsset(stale.id)
      }
    }
  }

  /** Remplace un fichier sans que la release reste sans lui : envoi sous un autre nom, puis échange. */
  const replace = async (release: GhRelease, name: string, source: UploadSource, type: string): Promise<void> => {
    const existing = release.assets.find((a) => a.name === name)
    if (!existing) {
      await upload(release, source, name, type)
      return
    }
    const tempName = `${name}.new`
    const stale = release.assets.find((a) => a.name === tempName)
    if (stale) await client.deleteAsset(stale.id)
    const uploaded = await upload(release, source, tempName, type)
    await client.deleteAsset(existing.id)
    await client.renameAsset(uploaded.id, name)
  }

  const manifestData = (d: Desired | ContentDesired, createdAt: string | null): UploadSource => ({
    data: Buffer.from(JSON.stringify({ ...d.manifest, createdAt: createdAt ?? new Date().toISOString() }, null, 2))
  })
  const contentManifestData = manifestData

  let done = 0
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    const state = progress.steps[i]
    if (signal.aborted) break
    state.status = 'running'
    emit()
    try {
      if (step.kind === 'create') {
        const d = step.desired
        for (const draft of step.drafts) await client.deleteRelease(draft.id)
        say('Création de la release')
        const release = await client.createRelease({
          tag_name: d.tag,
          name: d.releaseName,
          body: d.body,
          draft: true,
          prerelease: false,
          make_latest: 'false'
        })
        try {
          await upload(release, { file: d.version.path }, d.zipName, 'application/zip')
          if (d.coverName && d.pack.cover) {
            await upload(release, { file: d.pack.cover.path }, d.coverName, IMAGE_TYPES[extname(d.coverName)] ?? 'image/png')
          }
          await upload(release, manifestData(d, null), MODPACK_MANIFEST_ASSET, 'application/json')
          say('Mise en ligne')
          // La release n'est visible qu'une fois complète.
          await client.updateRelease(release.id, { draft: false, make_latest: 'false' })
        } catch (err) {
          await client.deleteRelease(release.id).catch(() => {})
          throw err
        }
      } else if (step.kind === 'update') {
        const d = step.desired
        for (const draft of step.drafts) await client.deleteRelease(draft.id)
        const release = step.release
        if (step.archive) await replace(release, d.zipName, { file: d.version.path }, 'application/zip')
        if (step.cover && d.coverName && d.pack.cover) {
          await replace(release, d.coverName, { file: d.pack.cover.path }, IMAGE_TYPES[extname(d.coverName)] ?? 'image/png')
        }
        if (step.manifest) await replace(release, MODPACK_MANIFEST_ASSET, manifestData(d, step.createdAt), 'application/json')
        for (const asset of step.extraneous) await client.deleteAsset(asset.id)
        if (step.release_) {
          say('Mise à jour des notes')
          await client.updateRelease(release.id, { name: d.releaseName, body: d.body, prerelease: false, make_latest: 'false' })
        }
      } else if (step.kind === 'create-content') {
        const d = step.desired
        for (const draft of step.drafts) await client.deleteRelease(draft.id)
        say('Création de la release')
        const release = await client.createRelease({ tag_name: d.tag, name: d.releaseName, body: d.body, draft: true, prerelease: false, make_latest: 'false' })
        try {
          for (const asset of d.assets) await upload(release, { file: asset.path }, asset.name, asset.type)
          await upload(release, contentManifestData(d, null), CONTENT_MANIFEST_ASSET, 'application/json')
          say('Mise en ligne')
          await client.updateRelease(release.id, { draft: false, make_latest: 'false' })
        } catch (err) {
          await client.deleteRelease(release.id).catch(() => {})
          throw err
        }
      } else if (step.kind === 'update-content') {
        const d = step.desired
        for (const draft of step.drafts) await client.deleteRelease(draft.id)
        const release = step.release
        for (const asset of step.replace) await replace(release, asset.name, { file: asset.path }, asset.type)
        if (step.manifest) await replace(release, CONTENT_MANIFEST_ASSET, contentManifestData(d, step.createdAt), 'application/json')
        for (const asset of step.extraneous) await client.deleteAsset(asset.id)
        if (step.release_) {
          say('Mise à jour des notes')
          await client.updateRelease(release.id, { name: d.releaseName, body: d.body, prerelease: false, make_latest: 'false' })
        }
      } else {
        say('Suppression')
        for (const release of step.releases) await client.deleteRelease(release.id)
        await client.deleteTag(step.action.tag)
      }
      state.status = 'done'
      done++
      progress.current = null
      emit()
    } catch (err) {
      const cancelled = signal.aborted || err instanceof CancelledError
      state.status = cancelled ? 'skipped' : 'error'
      if (!cancelled) state.error = describeError(err)
      for (const next of progress.steps.slice(i + 1)) next.status = 'skipped'
      progress.current = null
      emit()
      return cancelled
        ? { ok: false, cancelled: true, error: 'Publication arrêtée.', done }
        : { ok: false, cancelled: false, error: `${step.action.label} : ${describeError(err)}`, done }
    }
  }

  if (signal.aborted && done < plan.steps.length) {
    for (const state of progress.steps) if (state.status === 'pending') state.status = 'skipped'
    emit()
    return { ok: false, cancelled: true, error: 'Publication arrêtée.', done }
  }
  return { ok: true, done }
}

/** Numéro de version le plus élevé publié pour un modpack (pour ne jamais réutiliser un numéro). */
export function highestRemoteNumber(remote: RemoteState, id: string): number {
  let highest = 0
  for (const release of remote.releases) {
    const parsed = parseModpackTag(release.tag_name)
    if (parsed?.id === id && /^\d+$/.test(parsed.version)) highest = Math.max(highest, Number(parsed.version))
  }
  return highest
}
