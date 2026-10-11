// Textes tirés des mises à jour : une ligne par projet (journal, fenêtre, Claude) et notes de la version créée.
import type { AddonUpdate, MaintenanceRecord } from '../../shared/studio'

const KIND = { mod: '', resourcepack: ' (pack de textures)', shader: ' (shader)' }

/** « Fabric API : fabric-api-0.92.1.jar → fabric-api-0.92.2.jar », ou l'ajout d'une dépendance. */
export function changeLine(update: AddonUpdate): string {
  const name = `${update.name}${KIND[update.kind]}`
  if (!update.from) return `${name} : ajouté, ${update.to.fileName} (demandé par ${update.requiredBy.join(', ')})`
  return `${name} : ${update.from.fileName} → ${update.to.fileName}`
}

/** Notes de la version créée par un passage (Markdown), que Claude ou le publieur peuvent réécrire ensuite. */
export function versionNotes(record: Pick<MaintenanceRecord, 'changes'>): string {
  const updated = record.changes.filter((c) => !c.includes(' : ajouté, '))
  const added = record.changes.filter((c) => c.includes(' : ajouté, '))
  return [
    'Mises à jour des mods, testées sur un serveur avant publication.',
    ...(updated.length ? ['', '**Mis à jour**', '', ...updated.map((c) => `- ${c}`)] : []),
    ...(added.length ? ['', '**Ajouté**', '', ...added.map((c) => `- ${c}`)] : [])
  ].join('\n')
}
