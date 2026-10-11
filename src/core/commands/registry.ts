// Registre des commandes du moteur : chaque opération sur les modpacks est décrite une fois (nom, description,
// paramètres, nature), puis exposée telle quelle par la ligne de commande `mpm` et par le serveur MCP. Ajouter une
// commande = l'écrire dans un fichier de ce dossier et l'ajouter à COMMANDS (index.ts).
import type { z } from 'zod'
import type { StudioService } from '../studio/service'

/**
 * - `read` : ne change rien ;
 * - `write` : change le dossier des modpacks ou les réglages, sans rien retirer de GitHub ;
 * - `destructive` : supprime ou remplace quelque chose (sur le PC ou sur GitHub). La ligne de commande demande
 *   confirmation, le serveur MCP le signale au client.
 */
export type CommandKind = 'read' | 'write' | 'destructive'

export interface CommandContext {
  service: StudioService
  /** Dossier Instances de CurseForge (réglage, logs de CurseForge, ou emplacement par défaut). */
  instancesDir(): Promise<string>
  /** Avancement d'une opération longue. `total` absent : on ne sait pas combien il reste. */
  progress(message: string, done?: number, total?: number): void
  signal: AbortSignal
}

export interface Command<P extends z.ZodObject = z.ZodObject, R = unknown> {
  /** Mots séparés par des espaces : « packs list ». Outil MCP : « packs_list ». */
  name: string
  /** Une phrase, en français. */
  summary: string
  /** Précisions pour l'aide et pour Claude : quand l'utiliser, ce qu'elle renvoie, ses limites. */
  description?: string
  params: P
  kind: CommandKind
  run(params: z.infer<P>, ctx: CommandContext): Promise<R>
  /** Affichage lisible par la ligne de commande (sans --json). Par défaut : le résultat en JSON. */
  print?(result: R): string
}

/** Déclare une commande en gardant le lien entre ses paramètres et sa fonction. */
export function command<P extends z.ZodObject, R>(definition: Command<P, R>): Command<P, R> {
  return definition
}

export const toolName = (command: Pick<Command, 'name'>) => command.name.replace(/ /g, '_')
