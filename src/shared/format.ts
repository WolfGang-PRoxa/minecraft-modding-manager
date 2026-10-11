/** « forge-47.2.0 » → « Forge 47.2.0 » */
export function formatLoader(loader: string | null): string | null {
  if (!loader) return null
  const match = /^(neoforge|forge|fabric|quilt)[-\s]?(.*)$/i.exec(loader.trim())
  if (!match) return loader
  const names: Record<string, string> = { neoforge: 'NeoForge', forge: 'Forge', fabric: 'Fabric', quilt: 'Quilt' }
  const name = names[match[1].toLowerCase()]
  const version = match[2].replace(/^loader-/i, '')
  return version ? `${name} ${version}` : name
}

const sizeFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${sizeFormatter.format(value)} ${units[index]}`
}
