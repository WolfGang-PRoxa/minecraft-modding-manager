import { z } from 'zod'
import { curseForgeAuthStatus } from '../curseforgeAuth'
import { command } from './registry'

export const status = command({
  name: 'status',
  summary: 'État général : dossier des modpacks, connexion GitHub, modpacks, ce qui attend d’être rangé ou publié.',
  description: 'À appeler en premier. refresh relit GitHub (sinon l’état GitHub peut être « unchecked »).',
  params: z.object({ refresh: z.boolean().optional().describe('Relire GitHub.') }),
  kind: 'read',
  async run({ refresh }, ctx) {
    const overview = await ctx.service.overview({ refreshRemote: refresh })
    const { github } = overview
    return {
      workspaceDir: overview.settings.workspaceDir,
      workspaceExists: overview.workspaceExists,
      repo: github.repo,
      github: { state: github.state, login: github.login, canPush: github.canPush, private: github.repoPrivate, error: github.error },
      packs: overview.packs.length,
      packsWithErrors: overview.packs.filter((p) => p.errors.length).map((p) => p.folder),
      zipsToRange: overview.toRange,
      strayZips: overview.strayZips,
      packsOnlyOnGitHub: overview.orphanPacks.map((o) => o.name),
      toPublish: overview.plan ? overview.plan.actions.length : null,
      busyElsewhere: ctx.service.otherProcessTask
    }
  },
  print: (s) =>
    [
      `Dossier des modpacks : ${s.workspaceDir ?? 'non choisi'}${s.workspaceDir && !s.workspaceExists ? ' (introuvable)' : ''}`,
      `GitHub : ${s.repo} · ${s.github.state}${s.github.login ? ` (${s.github.login})` : ''}${s.github.error ? ` · ${s.github.error}` : ''}`,
      `${s.packs} modpack(s)${s.zipsToRange ? ` · ${s.zipsToRange} zip(s) à ranger` : ''}${s.toPublish !== null ? ` · ${s.toPublish} changement(s) à publier` : ''}`,
      ...(s.busyElsewhere ? [`En cours ailleurs : ${s.busyElsewhere}`] : [])
    ].join('\n')
})

export const journal = command({
  name: 'journal',
  summary: 'Dernières opérations d’écriture (application, ligne de commande, Claude), la plus récente en premier.',
  params: z.object({ limit: z.number().int().positive().max(500).optional().describe('Nombre d’entrées (20 par défaut).') }),
  kind: 'read',
  run: ({ limit }, ctx) => ctx.service.recentOperations(limit ?? 20),
  print: (entries) =>
    entries.length
      ? entries
          .map((e) => `${e.at.slice(0, 16).replace('T', ' ')} ${e.ok ? '✔' : '✖'} ${e.operation} — ${e.source}${e.detail ? ` · ${e.detail}` : ''}${e.error ? ` · ${e.error}` : ''}`)
          .join('\n')
      : 'Aucune opération enregistrée.'
})

const SOURCES = { saved: 'enregistré dans l’application', env: 'variable d’environnement', dotenv: 'fichier .env' } as const

export const curseforgeStatus = command({
  name: 'curseforge status',
  summary: 'Dit si la clé de l’API CurseForge et le jeton d’auteur sont disponibles et acceptés par CurseForge.',
  description:
    'Ne les affiche jamais. Ils s’enregistrent dans l’application (Paramètres → Compte CurseForge), pas par une commande. ' +
    'La clé sert à chercher les mises à jour des mods ; le jeton, à mettre des fichiers en ligne sur CurseForge.',
  params: z.object({}),
  kind: 'read',
  run: () => curseForgeAuthStatus({ dotenvDir: process.cwd() }),
  print: (status) =>
    (['apiKey', 'uploadToken'] as const)
      .map((kind) => {
        const s = status[kind]
        const [label, e] = kind === 'apiKey' ? ['Clé de l’API CurseForge', 'e'] : ['Jeton d’auteur CurseForge', '']
        if (!s.source) return `${label} : absent${e}`
        const verdict = s.valid ? `accepté${e}` : s.valid === false ? `refusé${e}` : `non vérifié${e}`
        return `${label} : ${SOURCES[s.source]}, ${verdict}${s.error ? ` (${s.error})` : ''}`
      })
      .join('\n')
})
