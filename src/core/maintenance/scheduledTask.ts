// La tâche planifiée de Windows qui lance chaque jour les passages dont le tour est venu. Elle tourne sous le compte
// de l'utilisateur, seulement quand sa session est ouverte (verrouillée ou non) : il faut sa session pour lire ses
// jetons (DPAPI) et pour fermer et rouvrir CurseForge. Elle peut réveiller le PC en veille.
import type { MaintenanceTask } from '../../shared/studio'
import { powershell } from '../powershell'

export const MAINTENANCE_TASK_NAME = 'Modpack Manager - mises a jour des modpacks'

/** Ce que la tâche lance : l'exécutable de l'application avec ses arguments. */
export interface MaintenanceLauncher {
  execute: string
  arguments: string
}

// Les données passent par l'entrée standard, en UTF-8 (chemins accentués), jamais dans la ligne de commande.
const UTF8 = '[Console]::InputEncoding=[Text.Encoding]::UTF8; [Console]::OutputEncoding=[Text.Encoding]::UTF8;'

const READ = `${UTF8}
$n=[Console]::In.ReadToEnd().Trim()
$t=Get-ScheduledTask -TaskPath '\\' -TaskName $n -ErrorAction SilentlyContinue
if (-not $t) { 'null'; exit }
$i=Get-ScheduledTaskInfo -InputObject $t
$a=$t.Actions | Select-Object -First 1
$g=$t.Triggers | Select-Object -First 1
function d($x) { if ($x -and $x.Year -gt 2000) { $x.ToString('o') } else { $null } }
[pscustomobject]@{ execute=$a.Execute; arguments=$a.Arguments; start=$g.StartBoundary; wake=[bool]$t.Settings.WakeToRun;
  lastRun=(d $i.LastRunTime); nextRun=(d $i.NextRunTime) } | ConvertTo-Json -Compress`

const REGISTER = `${UTF8}
$d=[Console]::In.ReadToEnd() | ConvertFrom-Json
$a=New-ScheduledTaskAction -Execute $d.execute -Argument $d.arguments
$g=New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($d.time,'HH:mm',$null))
$s=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 8) -MultipleInstances IgnoreNew
$s.WakeToRun=[bool]$d.wake
$p=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskPath '\\' -TaskName $d.name -Description $d.description -Action $a -Trigger $g -Settings $s -Principal $p -Force | Out-Null`

const UNREGISTER = `${UTF8}
$n=[Console]::In.ReadToEnd().Trim()
if (Get-ScheduledTask -TaskPath '\\' -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskPath '\\' -TaskName $n -Confirm:$false }`

const sameLauncher = (a: MaintenanceLauncher, b: { execute?: string; arguments?: string }) =>
  a.execute.toLowerCase() === (b.execute ?? '').toLowerCase() && a.arguments === (b.arguments ?? '')

/** La tâche telle que Windows la connaît ; `launcher` : ce qu'elle devrait lancer depuis ce programme. */
export async function readMaintenanceTask(launcher: MaintenanceLauncher | null, name = MAINTENANCE_TASK_NAME): Promise<MaintenanceTask> {
  const raw = JSON.parse((await powershell(READ, name)) || 'null') as {
    execute?: string
    arguments?: string
    start?: string
    wake?: boolean
    lastRun?: string | null
    nextRun?: string | null
  } | null
  if (!raw) return { installed: false, time: null, wake: false, lastRunAt: null, nextRunAt: null, foreign: false }
  return {
    installed: true,
    time: /T(\d\d:\d\d)/.exec(raw.start ?? '')?.[1] ?? null,
    wake: raw.wake === true,
    lastRunAt: raw.lastRun ?? null,
    nextRunAt: raw.nextRun ?? null,
    foreign: !launcher || !sameLauncher(launcher, raw)
  }
}

/** Crée (ou remplace) la tâche : un passage par jour à `time` (« HH:MM »). */
export async function installMaintenanceTask(
  launcher: MaintenanceLauncher,
  options: { time: string; wake: boolean },
  name = MAINTENANCE_TASK_NAME
): Promise<void> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(options.time)) throw new Error(`Heure invalide : « ${options.time} » (attendu : HH:MM).`)
  await powershell(
    REGISTER,
    JSON.stringify({
      name,
      description: 'Mises a jour automatiques des modpacks de Modpack Manager (modpacks dont le tour est venu).',
      execute: launcher.execute,
      arguments: launcher.arguments,
      time: options.time,
      wake: options.wake
    })
  )
}

export async function removeMaintenanceTask(name = MAINTENANCE_TASK_NAME): Promise<void> {
  await powershell(UNREGISTER, name)
}
