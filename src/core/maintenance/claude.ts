// Claude dans la boucle : quand un passage échoue, Claude Code (celui du publieur, sur son PC) est lancé sans fenêtre
// pour en chercher la cause. Il n'a que des commandes en lecture du serveur MCP de l'application : il explique et
// propose, il ne change rien. Sa réponse est gardée avec le passage, affichée dans le Studio et lisible par Claude.
import type { MaintenanceRecord } from '../../shared/studio'

/** Nom du serveur MCP de l'application dans Claude Code. */
export const MCP_SERVER_NAME = 'modding-manager'

/** Outils MCP permis pour analyser un échec : lecture seulement. */
export const ANALYSIS_TOOLS = [
  'status',
  'packs_show',
  'profiles_list',
  'maintenance_status',
  'updates_check',
  'updates_changelog',
  'tests_check',
  'journal'
].map((tool) => `mcp__${MCP_SERVER_NAME}__${tool}`)

/** La demande faite à Claude pour un passage qui a échoué. */
export function failurePrompt(record: MaintenanceRecord): string {
  return [
    `Le passage automatique des mises à jour du modpack « ${record.name} » (dossier ${record.folder}) a échoué :`,
    record.message,
    '',
    record.changes.length ? `Mises à jour essayées :\n${record.changes.map((c) => `- ${c}`).join('\n')}` : 'Aucune mise à jour essayée.',
    record.trialPath ? `\nCopie d’essai (profil CurseForge) : ${record.trialPath}` : '',
    '',
    'Cherche la cause avec les outils modding-manager (maintenance_status, tests_check sur la copie d’essai, ' +
      'updates_changelog des mods en cause). Tu ne peux rien modifier. Réponds en français, en 6 lignes au plus, sans ' +
      'titre : la cause probable, le ou les mods en cause, et ce que tu proposes au publieur (figer un mod avec ' +
      '« maintenance configure », attendre une version corrigée, valider quand même…).'
  ].join('\n')
}
