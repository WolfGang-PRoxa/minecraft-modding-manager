// Lecture et réduction d'images PNG, sans dépendance, pour les générateurs d'images du build.
// Lit les PNG 8 bits par canal, RVB ou RVBA, non entrelacés : le format de build/icon.png.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

/** Image en mémoire : 4 octets par pixel (R, V, B, alpha), ligne après ligne. */
export interface Rgba {
  width: number
  height: number
  data: Uint8Array
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function readPng(file: string): Rgba {
  const png = readFileSync(file)
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${file} n'est pas une image PNG.`)
  let width = 0
  let height = 0
  let channels = 0
  const idat: Buffer[] = []
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const body = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const [depth, colorType, , , interlace] = body.subarray(8)
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
      if (depth !== 8 || !channels || interlace !== 0) {
        throw new Error(`${file} : seuls les PNG RVB ou RVBA 8 bits non entrelacés sont lus.`)
      }
    } else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = y * stride
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[out + i - channels] : 0
      const up = y > 0 ? pixels[out - stride + i] : 0
      const upLeft = y > 0 && i >= channels ? pixels[out - stride + i - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = (left + up) >> 1
      else if (filter === 4) {
        const p = left + up - upLeft
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)]
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
      }
      pixels[out + i] = (line[i] + predictor) & 0xff
    }
  }

  if (channels === 4) return { width, height, data: pixels }
  const data = new Uint8Array(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    data.set(pixels.subarray(p * 3, p * 3 + 3), p * 4)
    data[p * 4 + 3] = 255
  }
  return { width, height, data }
}

/**
 * Réduit une image carrée à `size` × `size` : chaque pixel est la moyenne des pixels source qu'il couvre (au prorata
 * de leur surface), couleurs pondérées par leur opacité pour ne pas assombrir les bords transparents.
 */
export function resize(image: Rgba, size: number): Rgba {
  const scale = image.width / size
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    const y0 = y * scale
    const y1 = y0 + scale
    for (let x = 0; x < size; x++) {
      const x0 = x * scale
      const x1 = x0 + scale
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let area = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1) && sy < image.height; sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0)
        for (let sx = Math.floor(x0); sx < Math.ceil(x1) && sx < image.width; sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0))
          const i = (sy * image.width + sx) * 4
          const alpha = (image.data[i + 3] / 255) * w
          r += image.data[i] * alpha
          g += image.data[i + 1] * alpha
          b += image.data[i + 2] * alpha
          a += alpha
          area += w
        }
      }
      const o = (y * size + x) * 4
      if (a > 0) {
        data[o] = Math.round(r / a)
        data[o + 1] = Math.round(g / a)
        data[o + 2] = Math.round(b / a)
      }
      data[o + 3] = Math.round((a / area) * 255)
    }
  }
  return { width: size, height: size, data }
}
