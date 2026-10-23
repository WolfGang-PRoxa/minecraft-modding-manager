// Apparence : styles fournis et personnalisés, couleurs calculées, réglages remis au propre.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampScale,
  colorVariables,
  DEFAULT_THEME_ID,
  findTheme,
  isLightTheme,
  lightness,
  MAX_CUSTOM_THEMES,
  normalizeAppearance,
  PRESET_THEMES,
  stepScale,
  themeVariables,
  windowBackground
} from '../src/shared/appearance'

const custom = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: 'Mon style',
  colors: { background: '#101010', text: '#F0F0F0', accent: '#00aaff' },
  ...extra
})

describe('styles de couleurs', () => {
  it('garde au style d’origine ses couleurs exactes', () => {
    const vars = themeVariables(findTheme(normalizeAppearance(undefined)))
    assert.equal(vars['--color-ink-900'], '#0a0d12')
    assert.equal(vars['--color-grass-400'], '#7ed957')
    assert.equal(vars['--color-tint'], '#fff')
    assert.equal(windowBackground(PRESET_THEMES[0]), '#0a0d12')
  })

  it('calcule une palette proche de l’originale à partir de ses trois couleurs', () => {
    const vars = colorVariables(PRESET_THEMES[0].colors)
    for (const [name, original] of [['--color-ink-850', '#0f131a'], ['--color-ink-500', '#4a5568'], ['--color-grass-300', '#a6f08a']]) {
      assert.ok(Math.abs(lightness(vars[name]) - lightness(original)) < 0.01, `${name} : ${vars[name]} au lieu de ${original}`)
    }
  })

  it('ordonne les nuances du fond vers le texte, en sombre comme en clair', () => {
    for (const theme of PRESET_THEMES) {
      const vars = colorVariables(theme.colors)
      const steps = ['950', '900', '850', '800', '750', '700', '600', '500', '400', '300', '200', '100'].map((n) => lightness(vars[`--color-ink-${n}`]))
      const light = isLightTheme(theme.colors)
      for (let i = 1; i < steps.length; i++) {
        assert.ok(light ? steps[i] < steps[i - 1] : steps[i] > steps[i - 1], `${theme.name} : ink n° ${i} mal placé`)
      }
    }
  })

  it('sépare encore les surfaces sur un fond noir', () => {
    const vars = colorVariables({ background: '#000000', text: '#ffffff', accent: '#ff0000' })
    assert.equal(vars['--color-ink-950'], '#000000')
    assert.ok(lightness(vars['--color-ink-850']) - lightness(vars['--color-ink-950']) > 0.15)
  })

  it('reconnaît un style clair', () => {
    assert.equal(isLightTheme(PRESET_THEMES.find((t) => t.id === 'neige')!.colors), true)
    assert.equal(isLightTheme(PRESET_THEMES[0].colors), false)
  })

  it('traduit l’aspect en variables', () => {
    const base = { ...PRESET_THEMES[1], corners: 'square' as const, displayFont: 'system' as const, blur: false }
    const vars = themeVariables(base)
    assert.equal(vars['--radius-xl'], '0rem')
    assert.match(vars['--font-display'], /Segoe UI/)
    assert.equal(vars['--blur-sm'], '0px')
    assert.equal(themeVariables(PRESET_THEMES[1])['--radius-xl'], '0.75rem')
    assert.equal(themeVariables(PRESET_THEMES[1])['--blur-sm'], '8px')
  })
})

describe('réglages d’apparence', () => {
  it('donne les valeurs par défaut sans réglage', () => {
    assert.deepEqual(normalizeAppearance(undefined), { theme: DEFAULT_THEME_ID, scale: 1, customThemes: [] })
  })

  it('garde les styles personnalisés valides et écarte les autres', () => {
    const appearance = normalizeAppearance({
      theme: 'custom-a',
      customThemes: [
        custom('custom-a', { corners: 'extra', displayFont: 'inter', animations: false }),
        custom('custom-a'),
        custom('autre-id'),
        custom('custom-b', { colors: { background: 'rouge', text: '#fff', accent: '#000' } }),
        null
      ]
    })
    assert.equal(appearance.theme, 'custom-a')
    assert.equal(appearance.customThemes.length, 1)
    assert.deepEqual(appearance.customThemes[0], {
      id: 'custom-a',
      name: 'Mon style',
      colors: { background: '#101010', text: '#f0f0f0', accent: '#00aaff' },
      corners: 'extra',
      displayFont: 'inter',
      animations: false,
      blur: true
    })
  })

  it('revient au style d’origine quand le style choisi n’existe plus', () => {
    assert.equal(normalizeAppearance({ theme: 'custom-disparu' }).theme, DEFAULT_THEME_ID)
    assert.equal(normalizeAppearance({ theme: 'neige' }).theme, 'neige')
  })

  it('limite le nombre de styles personnalisés', () => {
    const many = Array.from({ length: MAX_CUSTOM_THEMES + 5 }, (_, i) => custom(`custom-${i}`))
    assert.equal(normalizeAppearance({ customThemes: many }).customThemes.length, MAX_CUSTOM_THEMES)
  })

  it('borne la taille de l’interface et passe d’un palier à l’autre', () => {
    assert.equal(clampScale(3), 1.5)
    assert.equal(clampScale(0.1), 0.8)
    assert.equal(clampScale('grand'), 1)
    assert.equal(stepScale(1, 1), 1.1)
    assert.equal(stepScale(1.1, 1), 1.25)
    assert.equal(stepScale(1, -1), 0.9)
    assert.equal(stepScale(1.5, 1), 1.5)
    assert.equal(stepScale(0.8, -1), 0.8)
    assert.equal(stepScale(1.17, -1), 1.1)
  })
})
