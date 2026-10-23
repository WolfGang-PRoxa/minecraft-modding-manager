import { useState } from 'react'

function hashHue(text: string): number {
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}

function initials(name: string): string {
  const words = name.split(/[\s-_]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
}

/** Rapports largeur / hauteur proches du format conseillé (16:9) : l'image remplit le cadre, quitte à être un peu rognée. */
const WIDE = { min: 1.6, max: 2 }

interface CoverProps {
  id: string
  name: string
  url: string | null
  className?: string
  imgClassName?: string
  /** Bannière dont le texte est à gauche : une image réduite s'y cale à droite. */
  align?: 'center' | 'right'
}

/**
 * Image du modpack, ou visuel généré à partir de son nom s'il n'en a pas. Une image d'un autre format (carrée,
 * en portrait…) n'est pas rognée : elle est réduite pour tenir entière dans le cadre, sur un fond tiré d'elle-même.
 */
export function Cover({ id, name, url, className = '', imgClassName = '', align = 'center' }: CoverProps) {
  const [failed, setFailed] = useState(false)
  // Connu une fois l'image chargée ; rattaché à son adresse, pour une image remplacée entre-temps.
  const [fit, setFit] = useState<{ url: string; contain: boolean } | null>(null)
  const contain = fit?.url === url && fit.contain

  if (url && !failed) {
    return (
      <div className={`overflow-hidden bg-ink-800 ${className}`}>
        <div className="relative size-full">
          {contain && (
            <img
              src={url}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl"
            />
          )}
          <img
            src={url}
            alt=""
            draggable={false}
            loading="lazy"
            onError={() => setFailed(true)}
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget
              const ratio = naturalWidth / naturalHeight
              setFit({ url, contain: !(ratio >= WIDE.min && ratio <= WIDE.max) })
            }}
            className={`relative size-full ${
              contain ? `object-contain ${align === 'right' ? 'origin-right object-right' : ''}` : 'object-cover'
            } ${imgClassName}`}
          />
        </div>
      </div>
    )
  }

  const hue = hashHue(id)
  // Le positionnement vient de `className` (souvent « absolute inset-0 ») : le contenu a son propre
  // conteneur relatif, sinon « relative » et « absolute » se contrediraient et le visuel ne remplirait pas le cadre.
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(120% 90% at 20% 10%, hsl(${hue} 65% 42%), transparent 60%),
          linear-gradient(135deg, hsl(${(hue + 30) % 360} 55% 24%), hsl(${(hue + 70) % 360} 45% 12%))`
      }}
    >
      <div className="relative flex size-full items-center justify-center">
        <div className="pixel-grid absolute inset-0 opacity-70" />
        <span className="font-display text-[clamp(2.5rem,8vw,7rem)] font-bold tracking-tight text-tint/15 select-none">
          {initials(name)}
        </span>
      </div>
    </div>
  )
}
