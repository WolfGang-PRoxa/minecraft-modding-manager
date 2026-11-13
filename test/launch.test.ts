// Comment la fenêtre s'ouvre au lancement : lancement avec Windows (réglage launchMode), relance par l'installeur
// après une mise à jour, lancement ordinaire.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { launchWindow } from '../src/main/startup'

describe('ouverture de la fenêtre au lancement', () => {
  it('lancée à la main, la fenêtre s’affiche', () => {
    assert.equal(launchWindow(['Modding Manager.exe'], 'background'), 'shown')
    assert.equal(launchWindow(['Modding Manager.exe', '--updated'], 'window'), 'shown')
  })

  it('lancée avec Windows, elle suit le réglage : arrière-plan par défaut, sinon réduite', () => {
    assert.equal(launchWindow(['Modding Manager.exe', '--minimized'], 'background'), 'hidden')
    assert.equal(launchWindow(['Modding Manager.exe', '--minimized'], 'window'), 'minimized')
  })

  it('relancée après une mise à jour alors qu’elle tournait en arrière-plan, elle y reste', () => {
    assert.equal(launchWindow(['Modding Manager.exe', '--updated', '--background'], 'window'), 'hidden')
  })
})
