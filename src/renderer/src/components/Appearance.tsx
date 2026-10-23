import { useState, type ReactNode } from 'react'
import { Check, Copy, Palette, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import {
  CORNER_LABELS,
  FONT_LABELS,
  isHexColor,
  lightness,
  MAX_CUSTOM_THEMES,
  MAX_THEME_NAME,
  newThemeId,
  PRESET_THEMES,
  SCALE_STEPS,
  findTheme,
  type Corners,
  type DisplayFont,
  type Theme,
  type ThemeColors
} from '../../../shared/appearance'
import { themePreviewStyle, themePreviewTone } from '../lib/appearance'
import { Modal, TextInput } from '../studio/Modal'
import { useStore } from '../store'
import { Button } from './Button'
import { Toggle } from './Toggle'

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-2 block text-xs font-semibold tracking-widest text-ink-400 uppercase">{children}</span>
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl bg-ink-950/60 p-1 ring-1 ring-inset ring-tint/[0.06]">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            option.value === value ? 'bg-tint/10 text-ink-100' : 'text-ink-400 hover:text-ink-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Vignette d'un style, dessinée avec ses propres couleurs. */
function ThemeSwatch({ theme, selected, onSelect }: { theme: Theme; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={theme.name}
      className={`group relative rounded-2xl p-1 text-left transition ${selected ? 'ring-2 ring-grass-400' : 'ring-1 ring-tint/[0.06] hover:ring-tint/20'}`}
    >
      <div style={themePreviewStyle(theme)} data-tone={themePreviewTone(theme)} className="overflow-hidden rounded-xl bg-ink-900">
        <div className="flex items-center gap-1 bg-ink-950 px-2.5 py-1.5">
          <span className="size-1.5 rounded-full bg-ink-600" />
          <span className="size-1.5 rounded-full bg-ink-600" />
          <span className="ml-auto h-1.5 w-6 rounded-full bg-ink-700" />
        </div>
        <div className="space-y-2 p-2.5">
          <div className="rounded-lg bg-ink-800 p-2 ring-1 ring-inset ring-tint/[0.06]">
            <div className="h-1.5 w-3/4 rounded-full bg-ink-100" />
            <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-ink-400" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-9 rounded-md bg-grass-400" />
            <span className="h-3 w-6 rounded-md bg-tint/10" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2 font-display text-[13px] font-semibold text-ink-100">
          <span className="truncate">{theme.name}</span>
          {selected && <Check size={14} className="shrink-0 text-grass-400" strokeWidth={3} />}
        </div>
      </div>
    </button>
  )
}

/** Paramètres → Apparence : style de couleurs et taille de l'interface. */
export function AppearanceSection() {
  const appearance = useStore((s) => s.settings?.appearance)
  const updateAppearance = useStore((s) => s.updateAppearance)
  const [editing, setEditing] = useState<{ theme: Theme; isNew: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (!appearance) return null

  const current = findTheme(appearance)
  const custom = appearance.customThemes.some((t) => t.id === current.id)
  const full = appearance.customThemes.length >= MAX_CUSTOM_THEMES
  const select = (id: string) => {
    setConfirmDelete(false)
    void updateAppearance({ theme: id })
  }
  const copyOf = (theme: Theme): Theme => ({ ...theme, id: newThemeId(), name: `${theme.name} (copie)`.slice(0, MAX_THEME_NAME) })

  const save = (theme: Theme) => {
    const exists = appearance.customThemes.some((t) => t.id === theme.id)
    const customThemes = exists ? appearance.customThemes.map((t) => (t.id === theme.id ? theme : t)) : [...appearance.customThemes, theme]
    void updateAppearance({ customThemes, theme: theme.id })
    setEditing(null)
  }
  const remove = () => {
    void updateAppearance({ customThemes: appearance.customThemes.filter((t) => t.id !== current.id), theme: PRESET_THEMES[0].id })
    setConfirmDelete(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <Label>Style</Label>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
          {[...PRESET_THEMES, ...appearance.customThemes].map((theme) => (
            <ThemeSwatch key={theme.id} theme={theme} selected={theme.id === current.id} onSelect={() => select(theme.id)} />
          ))}
          {!full && (
            <button
              type="button"
              onClick={() => setEditing({ theme: { ...copyOf(current), name: 'Mon style' }, isNew: true })}
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-tint/15 text-sm font-medium text-ink-300 transition hover:bg-tint/[0.04] hover:text-ink-100"
            >
              <Plus size={18} />
              Nouveau style
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {custom ? (
            <>
              <Button size="sm" icon={Pencil} onClick={() => setEditing({ theme: current, isNew: false })}>
                Modifier
              </Button>
              {!full && (
                <Button size="sm" variant="ghost" icon={Copy} onClick={() => setEditing({ theme: copyOf(current), isNew: true })}>
                  Dupliquer
                </Button>
              )}
              <Button size="sm" variant={confirmDelete ? 'danger' : 'ghost'} icon={Trash2} onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
                {confirmDelete ? 'Supprimer définitivement' : 'Supprimer'}
              </Button>
            </>
          ) : (
            !full && (
              <Button size="sm" variant="ghost" icon={Palette} onClick={() => setEditing({ theme: copyOf(current), isNew: true })}>
                Personnaliser « {current.name} »
              </Button>
            )
          )}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          Un style personnalisé part d’un style existant : ses couleurs, l’arrondi des angles, la police des titres, les
          animations et les effets de flou se règlent à volonté.
        </p>
      </div>

      <div>
        <Label>Taille de l’interface</Label>
        <Segmented
          label="Taille de l’interface"
          value={appearance.scale}
          options={SCALE_STEPS.map((step) => ({ value: step, label: `${Math.round(step * 100)} %` }))}
          onChange={(scale) => void updateAppearance({ scale })}
        />
        <p className="mt-2 text-xs leading-relaxed text-ink-400">
          Aussi au clavier, partout dans l’application : <Kbd>Ctrl</Kbd> + <Kbd>+</Kbd> pour agrandir, <Kbd>Ctrl</Kbd> +{' '}
          <Kbd>-</Kbd> pour réduire, <Kbd>Ctrl</Kbd> + <Kbd>0</Kbd> pour revenir à 100 %.
        </p>
      </div>

      {editing && <ThemeEditor initial={editing.theme} isNew={editing.isNew} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded bg-ink-950/60 px-1.5 py-0.5 font-mono text-[11px] text-ink-200 ring-1 ring-inset ring-tint/10">{children}</kbd>
}

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'background', label: 'Fond', hint: 'La fenêtre, les champs ; les cartes et les surfaces en sont tirées.' },
  { key: 'text', label: 'Texte', hint: 'Le texte principal ; les textes secondaires vont du fond vers lui.' },
  { key: 'accent', label: 'Accent', hint: 'Boutons principaux, liens, interrupteurs et sélection.' }
]

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-11 shrink-0 cursor-pointer rounded-xl bg-transparent p-0 ring-1 ring-tint/10 [&::-webkit-color-swatch]:rounded-[inherit] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink-100">{label}</div>
        <div className="text-xs text-ink-400">{hint}</div>
      </div>
      <TextInput
        aria-label={`${label} (code hexadécimal)`}
        value={draft}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value.trim()
          setDraft(next)
          const hex = next.startsWith('#') ? next : `#${next}`
          if (isHexColor(hex)) onChange(hex.toLowerCase())
        }}
        className="w-28! py-2! font-mono"
      />
    </div>
  )
}

/** Petite fenêtre de création ou de modification d'un style personnalisé, avec son aperçu. */
function ThemeEditor({ initial, isNew, onCancel, onSave }: { initial: Theme; isNew: boolean; onCancel: () => void; onSave: (theme: Theme) => void }) {
  const [theme, setTheme] = useState(initial)
  const set = (patch: Partial<Theme>) => setTheme((t) => ({ ...t, ...patch }))
  const setColor = (key: keyof ThemeColors, value: string) => setTheme((t) => ({ ...t, colors: { ...t.colors, [key]: value } }))
  const lowContrast = Math.abs(lightness(theme.colors.text) - lightness(theme.colors.background)) < 0.45
  const name = theme.name.trim()

  return (
    <Modal
      title={isNew ? 'Nouveau style' : 'Modifier le style'}
      subtitle="L’aperçu montre le style tel qu’il s’affichera dans l’application."
      onClose={onCancel}
      width="max-w-5xl"
      footer={
        <>
          <span className="mr-auto text-xs text-ink-400">Enregistré, le style est aussitôt appliqué.</span>
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="primary" icon={Check} disabled={!name} onClick={() => onSave({ ...theme, name })}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div>
            <Label>Nom</Label>
            <TextInput value={theme.name} maxLength={MAX_THEME_NAME} onChange={(e) => set({ name: e.target.value })} placeholder="Mon style" />
          </div>

          <div>
            <Label>Couleurs</Label>
            <div className="space-y-3">
              {COLOR_FIELDS.map((field) => (
                <ColorField key={field.key} label={field.label} hint={field.hint} value={theme.colors[field.key]} onChange={(v) => setColor(field.key, v)} />
              ))}
            </div>
            {lowContrast && (
              <p className="mt-3 flex gap-2 rounded-xl bg-amber-glow/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-glow ring-1 ring-inset ring-amber-glow/25">
                <TriangleAlert size={15} className="mt-px shrink-0" />
                Le texte et le fond sont proches : l’application risque d’être difficile à lire.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <Label>Aspect</Label>
            <div>
              <div className="mb-2 text-sm text-ink-200">Angles</div>
              <Segmented<Corners>
                label="Angles"
                value={theme.corners}
                options={(Object.keys(CORNER_LABELS) as Corners[]).map((c) => ({ value: c, label: CORNER_LABELS[c] }))}
                onChange={(corners) => set({ corners })}
              />
            </div>
            <div>
              <div className="mb-2 text-sm text-ink-200">Police des titres</div>
              <Segmented<DisplayFont>
                label="Police des titres"
                value={theme.displayFont}
                options={(Object.keys(FONT_LABELS) as DisplayFont[]).map((f) => ({ value: f, label: FONT_LABELS[f] }))}
                onChange={(displayFont) => set({ displayFont })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-ink-200">Animations</div>
                <div className="text-xs text-ink-400">Apparitions, transitions et survols animés.</div>
              </div>
              <Toggle label="Animations" checked={theme.animations} onChange={(animations) => set({ animations })} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-ink-200">Effets de flou</div>
                <div className="text-xs text-ink-400">Arrière-plan flouté derrière les fenêtres, lueurs décoratives.</div>
              </div>
              <Toggle label="Effets de flou" checked={theme.blur} onChange={(blur) => set({ blur })} />
            </div>
          </div>
        </div>

        <ThemePreview theme={theme} />
      </div>
    </Modal>
  )
}

/** Aperçu d'un style : quelques éléments de l'application, dessinés avec ses variables. */
function ThemePreview({ theme }: { theme: Theme }) {
  const [on, setOn] = useState(true)
  return (
    <div style={themePreviewStyle(theme)} data-tone={themePreviewTone(theme)} className="self-start overflow-hidden rounded-3xl bg-ink-900 text-ink-100 ring-1 ring-tint/10">
      <div className="flex items-center gap-3 border-b border-tint/[0.06] bg-ink-950 px-5 py-3">
        <span className="font-display text-sm font-bold">{theme.name.trim() || 'Mon style'}</span>
        <span className="ml-auto rounded-md bg-tint/[0.06] px-2 py-0.5 text-[11px] text-ink-300">Bibliothèque</span>
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-2xl bg-ink-850 p-4 ring-1 ring-inset ring-tint/[0.06]">
          <div className="text-xs font-semibold tracking-widest text-grass-400 uppercase">Modpack à la une</div>
          <div className="mt-1 font-display text-2xl font-bold tracking-tight">Aventure en Create</div>
          <p className="mt-1 text-sm text-ink-300">Version 12 · Forge 1.20.1 · 154 mods</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-lg bg-tint/[0.06] px-2.5 py-1 text-xs text-ink-200 ring-1 ring-inset ring-tint/[0.06]">Horreur</span>
            <span className="rounded-lg bg-grass-950 px-2.5 py-1 text-xs text-grass-300 ring-1 ring-inset ring-grass-400/30">Installé</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm">
              Installer
            </Button>
            <Button size="sm">Détails</Button>
            <Button variant="ghost" size="sm">
              Notes
            </Button>
          </div>
        </div>
        <div className="rounded-2xl bg-ink-800/50 p-4 ring-1 ring-inset ring-tint/[0.06]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Ouvrir CurseForge après une installation</div>
              <div className="text-xs text-ink-400">
                Comme dans les <span className="text-grass-300 underline underline-offset-2">paramètres</span>.
              </div>
            </div>
            <Toggle label="Exemple" checked={on} onChange={setOn} />
          </div>
          <div className="mt-3 rounded-xl bg-ink-950/60 px-3.5 py-2.5 font-mono text-xs text-ink-200 ring-1 ring-inset ring-tint/[0.06]">
            C:\Users\joueur\curseforge\minecraft\Instances
          </div>
        </div>
        <p className="rounded-xl bg-amber-glow/10 px-3.5 py-2.5 text-xs text-amber-glow ring-1 ring-inset ring-amber-glow/25">
          Une mise à jour de l’application est disponible.
        </p>
        <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300 ring-1 ring-inset ring-red-400/25">
          Le téléchargement a échoué : réessaie dans un instant.
        </p>
      </div>
    </div>
  )
}
