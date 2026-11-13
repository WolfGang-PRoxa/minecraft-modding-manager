// Taille et position de la fenêtre à l'ouverture : réglage relu prudemment, emplacement abandonné s'il n'est plus visible.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_WINDOW_PLACEMENT, normalizeWindowPlacement, usableBounds } from '../src/shared/windowPlacement'

const screen = { x: 0, y: 0, width: 1920, height: 1040 }

describe('fenêtre à l’ouverture', () => {
  it('sans réglage ou réglage abîmé : grande fenêtre', () => {
    assert.deepEqual(normalizeWindowPlacement(undefined), DEFAULT_WINDOW_PLACEMENT)
    assert.deepEqual(normalizeWindowPlacement({ mode: 'bizarre', bounds: { x: 'a' } }), DEFAULT_WINDOW_PLACEMENT)
  })

  it('un emplacement trop petit est agrandi à la taille minimale', () => {
    const placement = normalizeWindowPlacement({ mode: 'custom', bounds: { x: 10.4, y: 20, width: 300, height: 200 } })
    assert.deepEqual(placement, { mode: 'custom', bounds: { x: 10, y: 20, width: 960, height: 640 } })
  })

  it('l’emplacement personnalisé sert tant qu’il reste visible', () => {
    const placement = normalizeWindowPlacement({ mode: 'custom', bounds: { x: 100, y: 50, width: 1200, height: 800 } })
    assert.deepEqual(usableBounds(placement, [screen]), { x: 100, y: 50, width: 1200, height: 800 })
    assert.equal(usableBounds({ ...placement, mode: 'maximized' }, [screen]), null)
  })

  it('sur un écran débranché, la fenêtre s’ouvre en grand', () => {
    const placement = normalizeWindowPlacement({ mode: 'custom', bounds: { x: 2200, y: 50, width: 1200, height: 800 } })
    assert.equal(usableBounds(placement, [screen]), null)
    assert.ok(usableBounds(placement, [screen, { x: 1920, y: 0, width: 1920, height: 1040 }]))
  })
})
