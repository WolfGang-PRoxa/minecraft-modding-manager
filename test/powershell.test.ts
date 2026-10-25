// Scripts PowerShell (Windows seulement) : un texte accentué passe intact dans les deux sens.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { powershell } from '../src/core/powershell'
import { tempDir } from './support/fixtures'

const windows = process.platform === 'win32'

describe('scripts PowerShell', { skip: !windows && 'Windows seulement' }, () => {
  it('reçoit et rend un texte accentué sans le déformer', async () => {
    const text = 'Lumière – MA3D (légende) ✓'
    assert.equal(await powershell('[Console]::In.ReadToEnd().Trim()', text), text)
  })

  it('trouve un chemin accentué reçu sur l’entrée standard', async () => {
    const root = await tempDir()
    try {
      const dir = join(root.dir, 'MA3D_–_Plants_(légende)')
      await mkdir(dir)
      await writeFile(join(dir, 'pack.json'), '{}')
      assert.equal(await powershell('Test-Path -LiteralPath ([Console]::In.ReadToEnd().Trim()) -PathType Container', dir), 'True')
    } finally {
      await root.cleanup()
    }
  })
})
