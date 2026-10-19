// Vérification à la main du report d'un essai face à un vrai verrou Windows (Windows seulement) :
//   npx tsx scripts/verify-promote-lock.ts
// Un PowerShell ouvre l'ancien fichier d'un mod sans partage (comme CurseForge qui le lit), le report est lancé
// pendant ce temps. Verrou court (2 s) : le report attend et réussit. Verrou long (15 s) : le report est annulé et le
// profil reste comme avant.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyToTrial, promoteTrial } from '../src/core/trialUpdates'
import type { CfFile } from '../src/core/curseforgeApi'

async function makeProfile(instances: string, name: string): Promise<string> {
  const dir = join(instances, name)
  const mods = ['alpha', 'beta', 'gamma']
  const instance = {
    name,
    gameVersion: '1.20.1',
    baseModLoader: { name: 'forge-47.4.0' },
    installedAddons: mods.map((m, i) => ({
      addonID: i + 1,
      name: m,
      isEnabled: true,
      fileNameOnDisk: `${m}-old.jar`,
      installedFile: { id: (i + 1) * 100, fileName: `${m}-old.jar`, fileNameOnDisk: `${m}-old.jar` }
    }))
  }
  await mkdir(join(dir, 'mods'), { recursive: true })
  await writeFile(join(dir, 'minecraftinstance.json'), JSON.stringify(instance))
  for (const m of mods) await writeFile(join(dir, 'mods', `${m}-old.jar`), `ancien ${m}`)
  const file = (id: number, modId: number, fileName: string): CfFile => ({
    id, modId, displayName: fileName, fileName, releaseType: 1, fileDate: '2026-10-19T00:00:00Z', fileLength: 1,
    downloadUrl: `https://cdn/${id}`, isAvailable: true, gameVersions: ['1.20.1'], hashes: [], dependencies: []
  })
  const files = mods.map((m, i) => file((i + 1) * 100 + 1, i + 1, `${m}-new.jar`))
  await applyToTrial(
    {
      profile: name, profilePath: dir, minecraftVersion: '1.20.1', modLoader: 'forge-47.4.0', channel: 'release', checked: 3,
      updates: files.map((f, i) => ({
        projectId: i + 1, name: mods[i], kind: 'mod' as const,
        from: { fileId: (i + 1) * 100, fileName: `${mods[i]}-old.jar`, date: null, releaseType: 1 },
        to: { fileId: f.id, fileName: f.fileName, date: f.fileDate, releaseType: 1 }, requiredBy: [], url: null, downloadable: true
      })),
      pinned: [], untracked: [], warnings: []
    },
    { getFiles: async () => files, getMods: async () => [], download: async (f, d) => writeFile(d, `nouveau ${f.fileName}`) }
  )
  return dir
}

/** Ouvre le fichier sans partage pendant `seconds` ; résolu une fois le verrou posé. */
function lock(path: string, seconds: number): Promise<void> {
  const script = `$f = [System.IO.File]::Open('${path.replace(/'/g, "''")}', 'Open', 'Read', 'None'); 'pose'; Start-Sleep -Seconds ${seconds}; $f.Close()`
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['ignore', 'pipe', 'inherit'] })
  return new Promise((resolve) => child.stdout.once('data', () => resolve()))
}

async function state(dir: string) {
  const instance = JSON.parse(await readFile(join(dir, 'minecraftinstance.json'), 'utf8'))
  return {
    mods: (await readdir(join(dir, 'mods'))).sort().join(', '),
    suivis: instance.installedAddons.map((a: { fileNameOnDisk: string }) => a.fileNameOnDisk).sort().join(', ')
  }
}

async function run(label: string, seconds: number) {
  const instances = await mkdtemp(join(tmpdir(), 'mpm-verrou-'))
  try {
    const dir = await makeProfile(instances, label)
    await lock(join(dir, 'mods', 'beta-old.jar'), seconds)
    const started = Date.now()
    let outcome: string
    try {
      outcome = `réussi (${(await promoteTrial(dir)).length} projets)`
    } catch (err) {
      outcome = `refusé : ${(err as Error).message}`
    }
    console.log(`\n${label} — verrou de ${seconds} s, ${((Date.now() - started) / 1000).toFixed(1)} s : ${outcome}`)
    console.log(await state(dir))
  } finally {
    await new Promise((r) => setTimeout(r, 500))
    await rm(instances, { recursive: true, force: true, maxRetries: 40, retryDelay: 500 }).catch(() => {})
  }
}

void (async () => {
  await run('Verrou court', 2)
  await run('Verrou long', 15)
})()
