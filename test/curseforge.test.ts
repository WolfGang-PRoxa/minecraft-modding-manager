// Reconnaissance des processus de CurseForge, à fermer avant d'écrire dans un profil.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matchCurseForgeProcess } from '../src/core/curseforge'
import { CURSEFORGE_OVERWOLF_UID } from '../src/shared/config'

const roots = ['c:\\users\\moi\\appdata\\local\\programs\\curseforge windows\\']
const gameRoot = 'c:\\users\\moi\\curseforge\\minecraft\\'
const overwolf = 'c:\\program files (x86)\\overwolf\\0.311.0.6\\'
const match = (path: string, commandLine = '') => matchCurseForgeProcess(path, commandLine, roots, gameRoot)

describe('processus de CurseForge', () => {
  it('reconnaît l’application autonome', () => {
    assert.deepEqual(match(`${roots[0]}curseforge.exe`), { overwolfPage: false })
  })

  it('reconnaît l’application Overwolf, page comprise, mais jamais Overwolf lui-même', () => {
    // Page de CurseForge dans Overwolf : le module de CurseForge (Curse.Plugin.dll) y est chargé.
    const page = `"${overwolf}overwolfbrowser.exe" --type=renderer --owapp="curseforge  - background" --uid=${CURSEFORGE_OVERWOLF_UID} --ow-process-id=40808`
    assert.deepEqual(match(`${overwolf}overwolfbrowser.exe`, page), { overwolfPage: true })
    // Anciennes versions : exécutable propre à l'application.
    assert.deepEqual(match(`c:\\users\\moi\\appdata\\local\\overwolf\\processcache\\0.200\\${CURSEFORGE_OVERWOLF_UID}\\curseforge.exe`), {
      overwolfPage: false
    })
    assert.equal(match(`${overwolf}overwolf.exe`, '"c:\\program files (x86)\\overwolf\\overwolflauncher.exe" -overwolfsilent'), null)
    assert.equal(match(`${overwolf}overwolfbrowser.exe`, '--type=gpu-process'), null)
    assert.equal(match(`${overwolf}overwolfbrowser.exe`, '--type=renderer --uid=autreapplication'), null)
  })

  it('laisse Minecraft et ce qui tourne depuis le dossier du jeu', () => {
    assert.equal(match('c:\\program files\\java\\bin\\javaw.exe', `--uid=${CURSEFORGE_OVERWOLF_UID}`), null)
    assert.equal(match(`${gameRoot}install\\minecraft.exe`), null)
  })
})
