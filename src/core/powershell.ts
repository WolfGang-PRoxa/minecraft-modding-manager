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
