// Faux .jar de mods pour les tests : un zip en mémoire avec les fichiers donnés (fabric.mod.json, mods.toml…).
import { ZipArchive } from 'archiver'

export function makeJar(files: Record<string, string | Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipArchive({ zlib: { level: 1 } })
    const chunks: Buffer[] = []
    zip.on('data', (chunk: Buffer) => chunks.push(chunk))
    zip.on('end', () => resolve(Buffer.concat(chunks)))
    zip.on('error', reject)
    for (const [name, content] of Object.entries(files)) zip.append(content, { name })
    void zip.finalize()
  })
}

export const fabricJar = (id: string, depends: Record<string, string> = {}, extra: Record<string, unknown> = {}, files: Record<string, Buffer> = {}) =>
  makeJar({ 'fabric.mod.json': JSON.stringify({ schemaVersion: 1, id, version: '1.0.0', depends, ...extra }), ...files })

export function forgeToml(id: string, deps: Array<{ modId: string; mandatory?: boolean; type?: string; side?: string }> = [], header = ''): string {
  return [
    header,
    'modLoader="javafml"',
    'loaderVersion="[47,)"',
    '[[mods]]',
    `modId="${id}"`,
    'version="1.0.0"',
    `description='''Un mod
sur plusieurs lignes'''`,
    ...deps.flatMap((d) => [
      `[[dependencies.${id}]]`,
      `    modId="${d.modId}"`,
      ...(d.mandatory !== undefined ? [`    mandatory=${d.mandatory}`] : []),
      ...(d.type ? [`    type="${d.type}"`] : []),
      `    versionRange="[1,)"`,
      ...(d.side ? [`    side="${d.side}"`] : [])
    ])
  ].join('\n')
}
