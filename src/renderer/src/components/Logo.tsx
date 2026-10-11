// Logo de l'application : l'icône de l'exécutable (build/icon.png), seule source du logo.
import icon from '../../../../build/icon.png'

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return <img src={icon} width={size} height={size} alt="" draggable={false} className={className} />
}
