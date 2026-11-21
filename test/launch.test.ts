// Comment la fenêtre s'ouvre au lancement : lancement avec Windows (réglage launchMode), relance par l'installeur
// après une mise à jour, lancement ordinaire.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextStep } from '../src/main/backgroundUpdate'
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

describe('mise à jour régulière en arrière-plan', () => {
  const minute = 60_000
  it('relit les releases à l’intervalle réglé', () => {
    assert.equal(nextStep({ lastCheck: 0, intervalMs: 10 * minute, pending: false, hidden: true, now: 9 * minute }), 'wait')
    assert.equal(nextStep({ lastCheck: 0, intervalMs: 10 * minute, pending: false, hidden: false, now: 10 * minute }), 'check')
    assert.equal(nextStep({ lastCheck: 0, intervalMs: minute, pending: false, hidden: false, now: minute }), 'check')
  })

  it('installe une version trouvée seulement quand la fenêtre est cachée', () => {
    assert.equal(nextStep({ lastCheck: 0, intervalMs: 10 * minute, pending: true, hidden: false, now: minute }), 'wait')
    assert.equal(nextStep({ lastCheck: 0, intervalMs: 10 * minute, pending: true, hidden: true, now: minute }), 'install')
  })

  it('fenêtre ouverte, une version trouvée n’empêche pas de vérifier encore', () => {
    assert.equal(nextStep({ lastCheck: 0, intervalMs: 10 * minute, pending: true, hidden: false, now: 10 * minute }), 'check')
  })
})
