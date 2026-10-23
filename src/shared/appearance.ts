// Apparence de l'application : styles de couleurs (fournis ou créés par l'utilisateur) et taille de l'interface.
// Un style se résume à trois couleurs et quelques choix d'aspect ; toutes les nuances de l'interface (variables
// --color-ink-*, --color-grass-*…) en sont calculées dans l'espace OKLab, pour garder les mêmes écarts de clarté
// que le style d'origine.

/** Arrondi des angles : facteur appliqué aux rayons de Tailwind. */
export type Corners = 'square' | 'soft' | 'round' | 'extra'
/** Police des titres. */
export type DisplayFont = 'grotesk' | 'inter' | 'system'

export interface ThemeColors {
  /** Fond le plus profond (fenêtre, champs). */
  background: string
  /** Texte principal. */
  text: string
  /** Couleur d'accent : boutons principaux, liens, sélection. */
  accent: string
}

export interface Theme {
  id: string
  name: string
  colors: ThemeColors
  corners: Corners
  displayFont: DisplayFont
  /** Animations et transitions de l'interface. */
  animations: boolean
  /** Flou derrière les fenêtres de dialogue et lueurs décoratives. */
  blur: boolean
}

export interface AppearanceSettings {
  /** Style choisi : un style fourni ou un style personnalisé. */
  theme: string
  /** Taille de l'interface (facteur de zoom de la fenêtre). */
  scale: number
  customThemes: Theme[]
}

export const DEFAULT_THEME_ID = 'herbe'

const ASPECT_DEFAULTS = { corners: 'round', displayFont: 'grotesk', animations: true, blur: true } as const

/** Styles fournis avec l'application. « Herbe » est le style d'origine : il garde exactement les couleurs du CSS. */
export const PRESET_THEMES: Theme[] = [
  { id: DEFAULT_THEME_ID, name: 'Herbe', colors: { background: '#07090d', text: '#e9edf3', accent: '#7ed957' }, ...ASPECT_DEFAULTS },
  { id: 'ocean', name: 'Océan', colors: { background: '#050a12', text: '#e5eef7', accent: '#4cc4ef' }, ...ASPECT_DEFAULTS },
  { id: 'amethyste', name: 'Améthyste', colors: { background: '#0a0711', text: '#ede8f5', accent: '#b48cff' }, ...ASPECT_DEFAULTS },
  { id: 'nether', name: 'Nether', colors: { background: '#0f0807', text: '#f4ebe8', accent: '#ff7a4d' }, ...ASPECT_DEFAULTS },
  { id: 'contraste', name: 'Contraste élevé', colors: { background: '#000000', text: '#ffffff', accent: '#9dff6b' }, ...ASPECT_DEFAULTS },
  { id: 'neige', name: 'Neige', colors: { background: '#f5f7fa', text: '#141922', accent: '#3a8a22' }, ...ASPECT_DEFAULTS }
]

export const SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5]
export const MIN_SCALE = SCALE_STEPS[0]
export const MAX_SCALE = SCALE_STEPS[SCALE_STEPS.length - 1]
/** Nombre de styles personnalisés au plus. */
export const MAX_CUSTOM_THEMES = 24
export const MAX_THEME_NAME = 40

export const DEFAULT_APPEARANCE: AppearanceSettings = { theme: DEFAULT_THEME_ID, scale: 1, customThemes: [] }

export const CORNER_LABELS: Record<Corners, string> = { square: 'Carrés', soft: 'Légers', round: 'Arrondis', extra: 'Très arrondis' }
export const FONT_LABELS: Record<DisplayFont, string> = { grotesk: 'Space Grotesk', inter: 'Inter', system: 'Segoe UI' }

const CORNER_FACTORS: Record<Corners, number> = { square: 0, soft: 0.5, round: 1, extra: 1.6 }
const FONT_STACKS: Record<DisplayFont, string> = {
  grotesk: "'Space Grotesk Variable', 'Inter Variable', 'Segoe UI', sans-serif",
  inter: "'Inter Variable', 'Segoe UI', sans-serif",
  system: "'Segoe UI', system-ui, sans-serif"
}
/** Rayons de Tailwind (rem), multipliés selon l'arrondi choisi. */
const RADII: Record<string, number> = { xs: 0.125, sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, '2xl': 1, '3xl': 1.5, '4xl': 2 }
/** Flous de Tailwind (px), à zéro sans effets de flou. */
const BLURS: Record<string, number> = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 40, '3xl': 64 }

// --- Couleurs -------------------------------------------------------------------------------------------------

type Lab = [number, number, number]

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function toLab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

function toHex([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255).toString(16).padStart(2, '0')).join('')}`
}

const mix = (x: Lab, y: Lab, t: number): Lab => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]
const chroma = ([, a, b]: Lab) => Math.hypot(a, b)

/** Même teinte, autre clarté et autre intensité. */
function shade([, a, b]: Lab, L: number, chromaFactor: number): Lab {
  return [L, a * chromaFactor, b * chromaFactor]
}

/** Clarté relative (0 noir, 1 blanc) d'une couleur. */
export function lightness(hex: string): number {
  return toLab(hex)[0]
}

/** Style clair : le fond est plus clair que le texte. */
export function isLightTheme(colors: ThemeColors): boolean {
  return lightness(colors.background) > lightness(colors.text)
}

/**
 * Position de chaque nuance « ink » entre le fond (950) et le texte (100), mesurée sur le style d'origine, et
 * intensité ajoutée aux tons moyens (le style d'origine est plus coloré au milieu qu'aux extrémités).
 */
const INK_STEPS: [string, number, number][] = [
  ['950', 0, 0],
  ['900', 0.0236, 0.15],
  ['850', 0.058, 0.4],
  ['800', 0.0911, 0.6],
  ['750', 0.1285, 0.8],
  ['700', 0.1751, 1],
  ['600', 0.2352, 1.2],
  ['500', 0.3826, 1.25],
  ['400', 0.5473, 1.2],
  ['300', 0.7163, 0.75],
  ['200', 0.8786, 0.35],
  ['100', 1, 0]
]

/** Variables CSS des couleurs d'un style. */
export function colorVariables(colors: ThemeColors): Record<string, string> {
  const bg = toLab(colors.background)
  const text = toLab(colors.text)
  const accent = toLab(colors.accent)
  const vars: Record<string, string> = {}

  // Tons moyens : un peu plus de couleur, dans la teinte du fond (rien pour un fond gris ou noir).
  const bgChroma = chroma(bg)
  const extra = Math.min(0.025, bgChroma * 2.5)
  const hue = bgChroma > 0.002 ? [bg[1] / bgChroma, bg[2] / bgChroma] : [0, 0]
  // Près du noir, OKLab ne sépare plus les nuances à l'œil : les surfaces partent d'un fond au moins aussi clair que
  // celui du style d'origine, le fond lui-même restant celui choisi.
  const light = bg[0] > text[0]
  const base: Lab = !light && bg[0] < 0.13 ? [0.13, bg[1], bg[2]] : bg
  for (const [name, t, boost] of INK_STEPS) {
    const [L, a, b] = t === 0 ? bg : mix(base, text, t)
    vars[`--color-ink-${name}`] = toHex([L, a + hue[0] * extra * boost, b + hue[1] * extra * boost])
  }

  // Accent : 300 vers le texte (plus lisible), 500 et 600 vers le fond, 950 presque le fond.
  const c = chroma(accent)
  const towardText = text[0] - accent[0]
  const towardBg = bg[0] - accent[0]
  vars['--color-grass-300'] = toHex(shade(accent, accent[0] + towardText * (light ? 0.3 : 0.58), c > 0 ? 0.82 : 0))
  vars['--color-grass-400'] = colors.accent
  vars['--color-grass-500'] = toHex(shade(accent, accent[0] + towardBg * 0.17, 0.95))
  vars['--color-grass-600'] = toHex(shade(accent, accent[0] + towardBg * 0.35, light ? 0.75 : 0.8))
  vars['--color-grass-950'] = toHex(shade(accent, bg[0] + (accent[0] - bg[0]) * 0.13, light ? 0.12 : 0.26))
  // Voiles et filets (bg-tint/[0.06]…) : la couleur du texte, qui éclaircit un fond sombre et assombrit un fond clair.
  vars['--color-tint'] = colors.text
  return vars
}

/** Couleurs exactes du style d'origine, celles de styles.css (le calcul n'en donne qu'une approximation). */
const ORIGINAL_COLORS: Record<string, string> = {
  '--color-ink-950': '#07090d',
  '--color-ink-900': '#0a0d12',
  '--color-ink-850': '#0f131a',
  '--color-ink-800': '#141922',
  '--color-ink-750': '#1a202b',
  '--color-ink-700': '#212938',
  '--color-ink-600': '#2c3547',
  '--color-ink-500': '#4a5568',
  '--color-ink-400': '#6f7b8f',
  '--color-ink-300': '#9aa4b5',
  '--color-ink-200': '#c7cdd8',
  '--color-ink-100': '#e9edf3',
  '--color-grass-300': '#a6f08a',
  '--color-grass-400': '#7ed957',
  '--color-grass-500': '#5cb338',
  '--color-grass-600': '#3f8a26',
  '--color-grass-950': '#0d1f08',
  '--color-tint': '#fff'
}

/**
 * Variables CSS d'un style complet. Tout y est, même ce qui ne diffère pas du style d'origine : un aperçu dessiné à
 * l'intérieur d'un autre style ne doit rien hériter de lui.
 */
export function themeVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = theme.id === DEFAULT_THEME_ID ? { ...ORIGINAL_COLORS } : colorVariables(theme.colors)
  const factor = CORNER_FACTORS[theme.corners]
  for (const [name, rem] of Object.entries(RADII)) vars[`--radius-${name}`] = `${rem * factor}rem`
  vars['--font-display'] = FONT_STACKS[theme.displayFont]
  for (const [name, px] of Object.entries(BLURS)) vars[`--blur-${name}`] = `${theme.blur ? px : 0}px`
  return vars
}

/** Couleur du fond de la fenêtre (ink-900), pour qu'elle s'ouvre déjà aux couleurs du style. */
export function windowBackground(theme: Theme): string {
  return themeVariables(theme)['--color-ink-900']
}

// --- Réglages -------------------------------------------------------------------------------------------------

export function findTheme(appearance: AppearanceSettings, id = appearance.theme): Theme {
  return PRESET_THEMES.find((t) => t.id === id) ?? appearance.customThemes.find((t) => t.id === id) ?? PRESET_THEMES[0]
}

const isCorners = (v: unknown): v is Corners => typeof v === 'string' && v in CORNER_FACTORS
const isFont = (v: unknown): v is DisplayFont => typeof v === 'string' && v in FONT_STACKS

/** Taille de l'interface ramenée dans les bornes permises. */
export function clampScale(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 1
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, n)) * 100) / 100
}

/** Taille suivante (direction 1) ou précédente (-1) parmi les paliers proposés. */
export function stepScale(current: number, direction: 1 | -1): number {
  if (direction > 0) return SCALE_STEPS.find((s) => s > current + 0.001) ?? MAX_SCALE
  return [...SCALE_STEPS].reverse().find((s) => s < current - 0.001) ?? MIN_SCALE
}

/** Style personnalisé lu dans les réglages (ou reçu de la fenêtre), remis au propre ; null s'il est inutilisable. */
export function normalizeTheme(value: unknown): Theme | null {
  if (!value || typeof value !== 'object') return null
  const t = value as Record<string, unknown>
  const colors = (t.colors ?? {}) as Record<string, unknown>
  if (typeof t.id !== 'string' || !/^custom-[a-z0-9-]{1,40}$/.test(t.id)) return null
  if (!isHexColor(colors.background) || !isHexColor(colors.text) || !isHexColor(colors.accent)) return null
  const name = typeof t.name === 'string' ? t.name.trim().slice(0, MAX_THEME_NAME) : ''
  return {
    id: t.id,
    name: name || 'Style personnalisé',
    colors: { background: colors.background.toLowerCase(), text: colors.text.toLowerCase(), accent: colors.accent.toLowerCase() },
    corners: isCorners(t.corners) ? t.corners : ASPECT_DEFAULTS.corners,
    displayFont: isFont(t.displayFont) ? t.displayFont : ASPECT_DEFAULTS.displayFont,
    animations: t.animations !== false,
    blur: t.blur !== false
  }
}

export function normalizeAppearance(value: unknown): AppearanceSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const customThemes = (Array.isArray(v.customThemes) ? v.customThemes : [])
    .map(normalizeTheme)
    .filter((t): t is Theme => t !== null && !seen.has(t.id) && Boolean(seen.add(t.id)))
    .slice(0, MAX_CUSTOM_THEMES)
  const appearance = { theme: DEFAULT_THEME_ID, scale: clampScale(v.scale), customThemes }
  const theme = typeof v.theme === 'string' ? v.theme : DEFAULT_THEME_ID
  appearance.theme = findTheme(appearance, theme).id
  return appearance
}

/** Identifiant d'un nouveau style personnalisé. */
export function newThemeId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
