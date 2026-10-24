// Publication d'un mod sur Modrinth : lien avec son projet (créé une fois sur le site), versions du projet, mise en
// ligne d'une version avec ses jars, ses versions de Minecraft, ses chargeurs et ses dépendances obligatoires.
import type { ModrinthVersionView, PackModrinth } from '../../shared/studio'
import type { ModrinthClient, MrVersion } from '../modrinth'
import { StudioError } from './analyze'

/** Identifiant ou slug d'un projet d'après sa page (modrinth.com/mod/<slug>), son slug ou son identifiant. */
export async function resolveModrinthProject(client: ModrinthClient, ref: string): Promise<PackModrinth> {
  const text = ref.trim()
  const key = /modrinth\.com\/[a-z]+\/([^/?#]+)/i.exec(text)?.[1] ?? text
  if (!key) throw new StudioError('Donne l’adresse du projet Modrinth, son slug ou son identifiant.')
  const project = await client.getProject(key)
  if (!project) throw new StudioError(`Aucun projet Modrinth « ${key} » (s’il n’est pas encore approuvé, le jeton doit pouvoir lire tes projets).`)
  if (project.project_type !== 'mod') throw new StudioError(`« ${project.title} » n’est pas un mod sur Modrinth (${project.project_type}).`)
  return { projectId: project.id, slug: project.slug, url: `https://modrinth.com/mod/${project.slug}`, versions: {} }
}

export interface ModrinthUploadFile {
  path: string
  fileName: string
  loaders: string[]
  minecraftVersions: string[]
  dependencies: string[]
}

export interface ModrinthPublishInput {
  name: string
  version: string
  files: ModrinthUploadFile[]
  notes: string
  releaseType: 'release' | 'beta' | 'alpha'
  modrinth: PackModrinth
  /** Versions déjà sur le projet. */
  published: MrVersion[]
}

/** Dépendances obligatoires dont l'identifiant est aussi un projet de mod Modrinth (fabric-api…) ; les autres à part. */
export async function modrinthDependencies(client: ModrinthClient, ids: string[]): Promise<{ projects: string[]; unknown: string[] }> {
  const projects: string[] = []
  const unknown: string[] = []
  for (const id of [...new Set(ids)]) {
    const project = await client.getProject(id.toLowerCase().replace(/_/g, '-'))
    if (project?.project_type === 'mod') projects.push(project.id)
    else unknown.push(id)
  }
  return { projects, unknown }
}

/** Met une version en ligne ; renvoie son identifiant Modrinth et les dépendances introuvables. */
export async function publishToModrinth(
  client: ModrinthClient,
  input: ModrinthPublishInput,
  onStep: (text: string) => void
): Promise<{ versionId: string; unknownDependencies: string[] }> {
  if (input.modrinth.versions[input.version]) throw new StudioError(`La version ${input.version} est déjà sur Modrinth.`)
  const same = input.published.find((v) => v.version_number === input.version || input.files.some((f) => v.files.some((x) => x.filename === f.fileName)))
  if (same) throw new StudioError(`La version ${input.version} est déjà sur Modrinth (« ${same.name} ») : publie une nouvelle version du mod.`)
  const gameVersions = [...new Set(input.files.flatMap((f) => f.minecraftVersions))]
  if (!gameVersions.length) throw new StudioError('Ses jars ne disent pas pour quelle version de Minecraft ils sont faits : Modrinth l’exige.')
  onStep('Dépendances sur Modrinth')
  const { projects, unknown } = await modrinthDependencies(client, input.files.flatMap((f) => f.dependencies))
  onStep('Envoi vers Modrinth')
  const created = await client.createVersion({
    projectId: input.modrinth.projectId,
    name: `${input.name} ${input.version}`,
    versionNumber: input.version,
    changelog: input.notes.trim() || `Version ${input.version}`,
    versionType: input.releaseType,
    gameVersions,
    loaders: [...new Set(input.files.flatMap((f) => f.loaders))],
    dependencies: projects,
    files: input.files.map((f) => f.path)
  })
  return { versionId: created.id, unknownDependencies: unknown }
}

/**
 * Les versions du projet, de la plus récente à la plus ancienne, rapprochées des versions locales : celles envoyées
 * par l'application, puis celles dont un fichier porte le nom d'un jar local.
 */
export function modrinthVersionViews(versions: MrVersion[], modrinth: PackModrinth, localFiles: Map<string, string>): ModrinthVersionView[] {
  const sent = new Map(Object.entries(modrinth.versions).map(([version, id]) => [id, version]))
  return [...versions]
    .sort((a, b) => b.date_published.localeCompare(a.date_published))
    .map((v) => ({
      versionId: v.id,
      versionNumber: v.version_number,
      name: v.name,
      status: v.status,
      versionType: v.version_type,
      date: v.date_published || null,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      version: sent.get(v.id) ?? v.files.map((f) => localFiles.get(f.filename)).find(Boolean) ?? null,
      sentByApp: sent.has(v.id),
      url: `${modrinth.url}/version/${v.id}`
    }))
}
