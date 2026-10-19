import { spawn } from 'node:child_process'

/**
 * Lance un script PowerShell sans fenêtre et renvoie sa sortie. `input` arrive sur l'entrée standard du script
 * (`[Console]::In.ReadToEnd()`) : jamais dans la ligne de commande, où un chemin ou un secret pourrait être mal
 * interprété ou rester visible.
 */
export function powershell(script: string, input = ''): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolvePromise(out.trim()) : reject(new Error(err.trim() || `PowerShell ${code}`))))
    child.stdin.end(input)
  })
}

/** Met un fichier ou un dossier à la corbeille de Windows (sans fenêtre de confirmation). */
export async function moveToRecycleBin(path: string): Promise<void> {
  await powershell(
    "Add-Type -AssemblyName Microsoft.VisualBasic; $p=[Console]::In.ReadToEnd().Trim(); $f='Microsoft.VisualBasic.FileIO.FileSystem' -as [type];" +
      " if (Test-Path -LiteralPath $p -PathType Container) { $f::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin') }" +
      " elseif (Test-Path -LiteralPath $p) { $f::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin') }" +
      " else { throw 'introuvable' }",
    path
  )
}

const DPAPI = "Add-Type -AssemblyName System.Security; $d=[Console]::In.ReadToEnd().Trim(); $s='CurrentUser';"

/**
 * Chiffre un secret pour la session Windows de l'utilisateur (DPAPI) : seul ce compte, sur ce PC, peut le relire.
 * Résultat en base64, à enregistrer dans un fichier.
 */
export const protectSecret = (text: string): Promise<string> =>
  powershell(
    `${DPAPI} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($d),$null,$s))`,
    text
  )

export const unprotectSecret = (base64: string): Promise<string> =>
  powershell(
    `${DPAPI} [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($d),$null,$s))`,
    base64
  )

/**
 * Arrête ces processus et tous ceux qu'ils ont lancés, même s'ils leur survivent : un mod comme Crash Assistant relance
 * son propre Java par un processus intermédiaire qui disparaît aussitôt. Sont donc aussi arrêtés les processus de cet
 * exécutable lancés depuis `since` dont le parent n'existe plus (un jeu lancé par CurseForge garde son parent).
 */
export async function stopProcessTrees(pids: number[], orphans?: { executable: string; since: Date }): Promise<void> {
  if (!pids.length) return
  await powershell(
    '$in=[Console]::In.ReadToEnd() | ConvertFrom-Json; $all=@(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, ExecutablePath, CreationDate);' +
      ' $alive=@{}; foreach ($p in $all) { $alive[[int]$p.ProcessId]=$true }; $found=New-Object System.Collections.Generic.HashSet[int];' +
      ' $queue=New-Object System.Collections.Generic.Queue[int]; foreach ($r in $in.pids) { [void]$found.Add([int]$r); $queue.Enqueue([int]$r) };' +
      ' while ($queue.Count) { $p=$queue.Dequeue(); foreach ($c in $all) { if ($c.ParentProcessId -eq $p -and $found.Add([int]$c.ProcessId)) { $queue.Enqueue([int]$c.ProcessId) } } };' +
      ' if ($in.executable) { $since=[datetime]::Parse($in.since); foreach ($c in $all) { if ($c.ExecutablePath -and $c.ExecutablePath -ieq $in.executable -and $c.CreationDate -ge $since -and -not $alive[[int]$c.ParentProcessId]) { [void]$found.Add([int]$c.ProcessId) } } };' +
      ' foreach ($id in $found) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }',
    JSON.stringify({ pids, executable: orphans?.executable ?? null, since: orphans?.since.toISOString() ?? null })
  ).catch(() => {})
}

/**
 * Passe les fenêtres de ces processus sous les autres, sans les activer ni les réduire (le jeu continue de s'afficher
 * normalement) : les joueurs d'un test ne restent pas devant l'utilisateur. Renvoie les processus dont une fenêtre a
 * été trouvée.
 */
export async function sendWindowsToBack(pids: number[]): Promise<number[]> {
  if (!pids.length) return []
  const out = await powershell(
    'Add-Type -Namespace Mpm -Name Win -MemberDefinition \'' +
      '[DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc f, IntPtr p);' +
      ' public delegate bool EnumWindowsProc(IntPtr h, IntPtr p);' +
      ' [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);' +
      ' [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);' +
      ' [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);\';' +
      ' $pids=[Console]::In.ReadToEnd().Trim() -split "," | ForEach-Object { [uint32]$_ }; $done=New-Object System.Collections.Generic.HashSet[uint32];' +
      ' [Mpm.Win]::EnumWindows({ param($h, $p) $id=[uint32]0; [void][Mpm.Win]::GetWindowThreadProcessId($h, [ref]$id);' +
      ' if ($pids -contains $id -and [Mpm.Win]::IsWindowVisible($h)) { [void][Mpm.Win]::SetWindowPos($h, [IntPtr]1, 0, 0, 0, 0, 0x13); [void]$done.Add($id) }; $true }, [IntPtr]::Zero) | Out-Null;' +
      ' $done -join ","',
    pids.join(',')
  ).catch(() => '')
  return out ? out.split(',').map(Number) : []
}
