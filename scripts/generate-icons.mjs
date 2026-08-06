/**
 * Растеризует иконки PWA из SVG.
 *
 * Запускается вручную (`pnpm icons`), а не на каждой сборке: иконки меняются
 * раз в жизни проекта, а sharp — тяжёлая зависимость, которой нечего делать
 * в CI-пайплайне деплоя.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')

const TARGETS = [
  { source: '../public/favicon.svg', out: 'pwa-192x192.png', size: 192 },
  { source: '../public/favicon.svg', out: 'pwa-512x512.png', size: 512 },
  // iOS не поддерживает maskable и не скругляет углы сам — берём обычную иконку.
  { source: '../public/favicon.svg', out: 'apple-touch-icon.png', size: 180 },
  { source: './icon-maskable.svg', out: 'maskable-512x512.png', size: 512 },
]

await mkdir(publicDir, { recursive: true })

for (const target of TARGETS) {
  const svg = await readFile(resolve(here, target.source))
  const png = await sharp(svg, { density: 384 })
    .resize(target.size, target.size)
    .png({ compressionLevel: 9 })
    .toBuffer()

  await writeFile(resolve(publicDir, target.out), png)
  console.log(`${target.out} — ${target.size}×${target.size}, ${png.length} байт`)
}
