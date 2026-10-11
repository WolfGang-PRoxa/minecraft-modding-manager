// Options de la ligne de commande déduites du schéma de chaque commande : `--nom-en-kebab valeur`, `--drapeau` /
// `--no-drapeau` pour un booléen, option répétée pour une liste. Les paramètres obligatoires peuvent aussi être
// donnés dans l'ordre, sans leur nom (`mpm packs show Mon_Pack`).
import { z } from 'zod'
import type { Command } from '../core/commands/registry'
import { StudioError } from '../core/studio/analyze'

interface ParamInfo {
  key: string
  flag: string
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
  itemType?: 'string' | 'number' | 'integer'
  description: string
  required: boolean
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

type JsonProp = { type?: string; description?: string; items?: { type?: string } }

export function paramsOf(command: Command): ParamInfo[] {
  const schema = z.toJSONSchema(command.params) as { properties?: Record<string, JsonProp>; required?: string[] }
  return Object.entries(schema.properties ?? {}).map(([key, prop]) => ({
    key,
    flag: `--${kebab(key)}`,
    type: (prop.type ?? 'string') as ParamInfo['type'],
    itemType: prop.items?.type as ParamInfo['itemType'],
    description: prop.description ?? '',
    required: schema.required?.includes(key) ?? false
  }))
}

function convert(value: string, type: string | undefined, flag: string): string | number {
  if (type !== 'number' && type !== 'integer') return value
  const number = Number(value.replace(',', '.'))
  if (!Number.isFinite(number)) throw new StudioError(`${flag} attend un nombre (reçu : ${value}).`)
  return number
}

/** Valeurs brutes des paramètres d'une commande, avant validation par son schéma. */
export function parseParams(command: Command, args: string[]): Record<string, unknown> {
  const params = paramsOf(command)
  const byFlag = new Map(params.map((p) => [p.flag, p]))
  const values: Record<string, unknown> = {}
  const positionals: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const [name, inline] = arg.split(/=(.*)/s, 2)
    const negated = name.startsWith('--no-') ? byFlag.get(`--${name.slice(5)}`) : undefined
    if (negated?.type === 'boolean' && inline === undefined) {
      values[negated.key] = false
      continue
    }
    const param = byFlag.get(name)
    if (!param) {
      const known = params.map((p) => p.flag).join(', ') || 'aucune'
      throw new StudioError(`Option inconnue pour « ${command.name} » : ${name}. Options : ${known}.`)
    }
    if (param.type === 'boolean') {
      values[param.key] = inline === undefined ? true : !/^(false|non|0)$/i.test(inline)
      continue
    }
    const value = inline ?? args[++i]
    if (value === undefined) throw new StudioError(`${name} attend une valeur.`)
    if (param.type === 'array') {
      values[param.key] = [...((values[param.key] as unknown[]) ?? []), convert(value, param.itemType, name)]
    } else {
      values[param.key] = convert(value, param.type, name)
    }
  }
  const free = params.filter((p) => p.required && values[p.key] === undefined && p.type !== 'boolean')
  for (const [i, value] of positionals.entries()) {
    const param = free[i]
    if (!param) throw new StudioError(`Argument en trop : « ${value} ». Voir mpm ${command.name} --help.`)
    values[param.key] = param.type === 'array' ? [convert(value, param.itemType, param.flag)] : convert(value, param.type, param.flag)
  }
  return values
}

/** Aide d'une commande. */
export function commandHelp(command: Command): string {
  const params = paramsOf(command)
  const usage = params.map((p) => (p.required ? `${p.flag} <${p.key}>` : `[${p.flag}${p.type === 'boolean' ? '' : ' …'}]`))
  const lines = [`mpm ${command.name} ${usage.join(' ')}`.trim(), '', command.summary]
  if (command.description) lines.push('', command.description)
  if (params.length) {
    lines.push('', 'Options :')
    for (const p of params) {
      const repeat = p.type === 'array' ? ' (répétable)' : ''
      lines.push(`  ${p.flag.padEnd(24)} ${p.description}${repeat}${p.required ? ' Obligatoire.' : ''}`)
    }
  }
  if (command.kind === 'destructive') lines.push('', 'Demande confirmation (sauf --yes).')
  return lines.join('\n')
}
