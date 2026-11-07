// Recalcule le blockmap d'un installeur (`<installeur>.exe.blockmap`, à côté de lui), avec le même code
// qu'electron-builder. La CI s'en sert après la signature, qui modifie l'installeur : le blockmap écrit par
// electron-builder décrirait encore l'installeur non signé, et la mise à jour différentielle échouerait.
//
//   npx tsx scripts/blockmap.ts dist/Modding-Manager-Setup-2.3.2.exe
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap') as {
  buildBlockMap: (file: string, format: 'gzip', output: string) => Promise<{ size: number; sha512: string }>
}

async function main(files: string[]): Promise<void> {
  if (files.length === 0) throw new Error('Usage : npx tsx scripts/blockmap.ts <installeur.exe>…')
  for (const file of files) {
    const { size } = await buildBlockMap(file, 'gzip', `${file}.blockmap`)
    console.log(`${file}.blockmap (${size} octets décrits)`)
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
