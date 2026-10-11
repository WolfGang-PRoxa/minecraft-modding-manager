import { createHash } from 'node:crypto'

/** Un mod : un .jar posé directement dans le dossier mods (ni sous-dossier, ni mod désactivé). */
export const isModJar = (fileName: string): boolean => /\.jar$/i.test(fileName)

/**
 * Empreinte de l'ensemble des mods d'une instance : le nom et la taille de chaque .jar du dossier mods.
 * Même empreinte = mêmes mods. C'est ce qui permet de reconnaître la version d'un modpack dans un profil
 * CurseForge créé hors de l'application (celui du publieur, un zip importé à la main…), sans rien lire
 * de volumineux. null s'il n'y a aucun mod : rien ne distinguerait alors deux instances.
 */
export function modsSignature(jars: Array<{ name: string; size: number }>): string | null {
  if (jars.length === 0) return null
  const lines = jars.map((jar) => `${jar.name.toLowerCase()}\t${jar.size}`).sort()
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}
