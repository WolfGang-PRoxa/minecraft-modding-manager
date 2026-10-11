// Génère les images de l'installeur Windows (build/installer/logo-<n>.bmp) à partir du logo de l'application
// (build/icon.png) : le logo sur le fond sombre de l'application, avec un léger halo. Une image par échelle de
// Windows, n = ppp / 24 de 4 à 12 (4 à 100 %, 5 à 125 %, 6 à 150 %…) : image de 24 × n pixels, logo de 16 × n.
// Lancé par `npm run build:win` ; les fichiers produits ne sont pas versionnés.
// Usage : npx tsx scripts/generate-installer-images.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPng, resize } from './png'

/** Fond des fenêtres de l'installeur (ink-900 de l'application). */
const BACKGROUND = [0x0a, 0x0d, 0x12]
/** Couleur du halo (bleu de l'engrenage du logo) et son opacité au centre. */
const GLOW = [0x3a, 0x8c, 0xff]
const GLOW_ALPHA = 0.3

/** BMP 24 bits (lignes de bas en haut, complétées à un multiple de 4 octets). */
function bmp(width: number, height: number, pixel: (x: number, y: number) => number[]): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const data = Buffer.alloc(rowSize * height)
  for (let y = 0; y < height; y++) {
    const row = (height - 1 - y) * rowSize
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      data[row + x * 3] = b
      data[row + x * 3 + 1] = g
      data[row + x * 3 + 2] = r
    }
  }
  const header = Buffer.alloc(54)
  header.write('BM', 0, 'ascii')
  header.writeUInt32LE(54 + data.length, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(data.length, 34)
  header.writeInt32LE(2835, 38) // 72 ppp
  header.writeInt32LE(2835, 42)
  return Buffer.concat([header, data])
}

const root = join(import.meta.dirname, '..')
const source = readPng(join(root, 'build', 'icon.png'))
const outDir = join(root, 'build', 'installer')
mkdirSync(outDir, { recursive: true })

for (let n = 4; n <= 12; n++) {
  const size = 24 * n
  const logo = resize(source, 16 * n)
  const margin = 4 * n
  const center = size / 2
  const image = bmp(size, size, (x, y) => {
    // Halo : dégradé radial adouci, qui rejoint exactement le fond au bord de l'image.
    const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center) / center
    const glow = GLOW_ALPHA * Math.max(0, 1 - distance) ** 2
    const behind = BACKGROUND.map((channel, i) => channel + (GLOW[i] - channel) * glow)
    const lx = x - margin
    const ly = y - margin
    if (lx < 0 || ly < 0 || lx >= logo.width || ly >= logo.height) return behind.map(Math.round)
    const i = (ly * logo.width + lx) * 4
    const alpha = logo.data[i + 3] / 255
    return behind.map((channel, c) => Math.round(channel + (logo.data[i + c] - channel) * alpha))
  })
  writeFileSync(join(outDir, `logo-${n}.bmp`), image)
}
console.log(`Images de l'installeur écrites dans ${outDir}`)
