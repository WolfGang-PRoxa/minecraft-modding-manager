import type { CSSProperties } from 'react'
import { findTheme, isLightTheme, themeVariables, type AppearanceSettings, type Theme } from '../../../shared/appearance'

let applied: string[] = []

/** Applique le style choisi à toute la fenêtre (variables CSS sur la racine, ton clair ou sombre, animations). */
export function applyAppearance(appearance: AppearanceSettings): void {
  const theme = findTheme(appearance)
  const root = document.documentElement
  for (const name of applied) root.style.removeProperty(name)
  const vars = themeVariables(theme)
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
  applied = Object.keys(vars)
  root.dataset.tone = isLightTheme(theme.colors) ? 'light' : 'dark'
  root.dataset.motion = theme.animations ? 'on' : 'off'
}

/** Style d'un aperçu : les variables du style, limitées à l'élément qui les porte. */
export function themePreviewStyle(theme: Theme): CSSProperties {
  return { ...themeVariables(theme), colorScheme: isLightTheme(theme.colors) ? 'light' : 'dark' } as CSSProperties
}

/** Attribut de ton d'un aperçu : les couleurs d'état passent à leurs nuances foncées sur un style clair. */
export function themePreviewTone(theme: Theme): 'light' | 'dark' {
  return isLightTheme(theme.colors) ? 'light' : 'dark'
}
