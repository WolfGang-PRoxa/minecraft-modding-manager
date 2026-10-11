// Le Java qu'il faut à une version de Minecraft : celle-ci l'indique (versions/<v>/<v>.json, `javaVersion`), et
// CurseForge a déjà téléchargé les environnements de Mojang (Install/java/<component>). À défaut, un JDK installé
// sur le PC (Eclipse Adoptium, Microsoft, Oracle…) de la bonne version majeure.
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathExists, readJson } from '../fsutil'
import { StudioError } from '../studio/analyze'

export interface JavaRequirement {
  /** Environnement de Mojang (« java-runtime-delta »), si la version le dit. */
  component: string | null
  majorVersion: number
}

/** Dossier Install de CurseForge, à côté du dossier Instances. */
export const curseForgeInstallDir = (instancesDir: string) => join(dirname(instancesDir), 'Install')

/** Java demandé par une version de Minecraft, d'après CurseForge ; sinon déduit du numéro de version. */
export async function javaRequirement(installDir: string, minecraftVersion: string): Promise<JavaRequirement> {
  const json = await readJson<{ javaVersion?: { component?: string; majorVersion?: number } }>(
    join(installDir, 'versions', minecraftVersion, `${minecraftVersion}.json`)
  )
  const major = json?.javaVersion?.majorVersion
  if (major) return { component: json?.javaVersion?.component ?? null, majorVersion: major }
  return { component: null, majorVersion: guessMajor(minecraftVersion) }
}

/** Java attendu d'après le numéro de Minecraft, quand CurseForge ne l'a pas encore installé. */
export function guessMajor(minecraftVersion: string): number {
  const [major, minor = 0, patch = 0] = minecraftVersion.split('.').map(Number)
  if (major >= 26) return 25
  if (minor >= 21 || (minor === 20 && patch >= 5)) return 21
  if (minor >= 18) return 17
  if (minor === 17) return 16
  return 8
}

async function releaseMajor(home: string): Promise<number | null> {
  const release = await readFile(join(home, 'release'), 'utf8').catch(() => '')
  const version = /JAVA_VERSION="(\d+)(?:\.(\d+))?/.exec(release)
  if (!version) return null
  return version[1] === '1' ? Number(version[2]) : Number(version[1])
}

/** Dossiers où des JDK et JRE sont habituellement installés sous Windows. */
function vendorRoots(): string[] {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  return ['Eclipse Adoptium', 'Microsoft', 'Java', 'Zulu', 'BellSoft', 'Amazon Corretto'].map((v) => join(programFiles, v))
}

/** java.exe qui convient : l'environnement de CurseForge, sinon un Java installé de la même version majeure. */
export async function findJava(installDir: string, requirement: JavaRequirement): Promise<string> {
  const candidates: string[] = []
  if (requirement.component) candidates.push(join(installDir, 'java', requirement.component))
  for (const entry of await readdir(join(installDir, 'java')).catch(() => [] as string[])) {
    candidates.push(join(installDir, 'java', entry))
  }
  for (const root of vendorRoots()) {
    for (const entry of await readdir(root).catch(() => [] as string[])) candidates.push(join(root, entry))
  }
  for (const home of candidates) {
    const java = join(home, 'bin', 'java.exe')
    if ((await releaseMajor(home)) === requirement.majorVersion && (await pathExists(java))) return java
  }
  throw new StudioError(
    `Java ${requirement.majorVersion} introuvable : lance une fois ce profil depuis CurseForge (il installe le bon Java), ou installe Java ${requirement.majorVersion}.`
  )
}
