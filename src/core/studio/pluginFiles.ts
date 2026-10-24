// Plugins de serveur (Bukkit, Spigot, Paper…) : un jar qui déclare son nom, sa version et son API dans plugin.yml (ou
// paper-plugin.yml pour un plugin propre à Paper).
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { PluginPlatform } from '../../shared/content'
import { openEntry, openZip, readEntries } from '../zip'
import { StudioError } from './analyze'
import type { ContentAnalysis, JarFile } from './mods'

type YamlValue = string | string[]

/**
 * Juste ce qu'utilise plugin.yml : les clés de premier niveau, leur valeur simple, et les listes (`[a, b]` ou une
 * ligne `- a` par élément). Le reste (commandes, permissions…) est ignoré.
 */
export function parsePluginYml(text: string): Record<string, YamlValue> {
  const result: Record<string, YamlValue> = {}
  let listKey: string | null = null
  const clean = (value: string) => value.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2')
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const item = /^\s+-\s+(.*)$/.exec(raw)
    if (item && listKey) {
      ;(result[listKey] as string[]).push(clean(item[1]))
      continue
    }
    const entry = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw)
    if (!entry) {
      if (!/^\s/.test(raw)) listKey = null
      continue
    }
    const [, key, value] = entry
    const text = clean(value)
    listKey = null
    if (!text) {
      result[key] = []
      listKey = key
    } else if (text.startsWith('[') && text.endsWith(']')) {
      result[key] = text.slice(1, -1).split(',').map(clean).filter(Boolean)
    } else {
      result[key] = text
    }
  }
  return result
}

const scalar = (value: YamlValue | undefined) => (typeof value === 'string' && value ? value : null)
const list = (value: YamlValue | undefined) => (Array.isArray(value) ? value : typeof value === 'string' && value ? [value] : [])

async function hashes(file: string): Promise<{ sha256: string; sha1: string }> {
  const sha256 = createHash('sha256')
  const sha1 = createHash('sha1')
  for await (const chunk of createReadStream(file)) {
    sha256.update(chunk as Buffer)
    sha1.update(chunk as Buffer)
  }
  return { sha256: sha256.digest('hex'), sha1: sha1.digest('hex') }
}

const memo = new Map<string, { size: number; mtimeMs: number; analysis: ContentAnalysis }>()

/** Lit le jar d'un plugin (mis en mémoire tant que sa taille et sa date ne changent pas). */
export async function analyzePluginJar(file: JarFile): Promise<ContentAnalysis> {
  const known = memo.get(file.path)
  if (known && known.size === file.size && known.mtimeMs === file.mtimeMs) return known.analysis
  let zip
  try {
    zip = await openZip(file.path)
  } catch {
    throw new StudioError('Ce fichier n’est pas un .jar lisible.')
  }
  let text: string | null = null
  let paperOnly = false
  try {
    const entries = await readEntries(zip)
    const entry = entries.find((e) => e.fileName === 'paper-plugin.yml') ?? entries.find((e) => e.fileName === 'plugin.yml')
    if (entry) {
      paperOnly = entry.fileName === 'paper-plugin.yml'
      const chunks: Buffer[] = []
      for await (const chunk of await openEntry(zip, entry)) chunks.push(chunk as Buffer)
      text = Buffer.concat(chunks).toString('utf8')
    }
  } finally {
    zip.close()
  }
  if (text === null) throw new StudioError('Ce jar ne déclare aucun plugin (ni plugin.yml, ni paper-plugin.yml).')
  const yml = parsePluginYml(text)
  const name = scalar(yml.name)
  const version = scalar(yml.version)
  if (!name) throw new StudioError('plugin.yml ne donne pas de nom (name).')
  if (!version || version.includes('${')) throw new StudioError(`Le plugin « ${name} » ne déclare pas sa version (ou elle n’a pas été remplie au build).`)
  // Un plugin.yml classique tourne sur Bukkit et tout ce qui en descend ; paper-plugin.yml, seulement sur Paper.
  const loaders: PluginPlatform[] = paperOnly ? ['paper', 'purpur'] : ['paper', 'spigot', 'bukkit', 'purpur']
  if (scalar(yml['folia-supported']) === 'true') loaders.push('folia')
  const api = scalar(yml['api-version'])
  const analysis: ContentAnalysis = {
    ...(await hashes(file.path)),
    contentId: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    name,
    description: scalar(yml.description),
    version,
    loaders,
    // api-version est la plus ancienne version de l'API visée : seulement un point de départ, à préciser à la main.
    minecraftVersions: api && /^\d+(\.\d+)+$/.test(api) ? [api] : [],
    minecraftRange: api ? `api-version ${api}` : null,
    side: 'server',
    dependencies: list(yml.depend)
  }
  memo.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, analysis })
  return analysis
}
