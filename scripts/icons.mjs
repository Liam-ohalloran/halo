// Renders public/icons/halo.svg to the PNG sizes the PWA and iOS need, plus the iPhone splash screens.
// Usage: npm run icons
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url))
// iOS and the maskable mask round the corners themselves, so the PNGs are full-bleed squares.
const svg = readFileSync(path('../public/icons/halo.svg'), 'utf8').replace('rx="112"', 'rx="0"')
const ring = svg.replace(/<rect[^>]*\/>/, '') // the ring alone, for the splash

const browser = await chromium.launch()
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>*{margin:0}body{background:#000}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: path(`../public/icons/${name}`) })
  await page.close()
}

// iPhone splash screens: [css width, css height, pixel ratio]. Page background #0b0b10, gold ring in the middle,
// and the resting island hanging from the top edge so the launch reads as Halo.
const SPLASH = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [414, 896, 3], [414, 896, 2],
  [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2],
]
mkdirSync(path('../public/splash'), { recursive: true })
for (const [w, h, dpr] of SPLASH) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
  await page.setContent(`<style>
    *{margin:0}body{width:${w}px;height:${h}px;background:#0b0b10;position:relative;overflow:hidden}
    .ring{position:absolute;left:50%;top:50%;width:240px;height:240px;transform:translate(-50%,-50%)}
    .ring svg{width:100%;height:100%;display:block;overflow:visible}
    .isl{position:absolute;top:0;left:50%;width:200px;height:34px;margin-left:-100px;background:#000;border-radius:0 0 17px 17px;box-shadow:0 0 26px rgba(255,181,71,.25),0 0 110px rgba(255,181,71,.12)}
  </style><div class="isl"></div><div class="ring">${ring}</div>`)
  await page.screenshot({ path: path(`../public/splash/splash-${w * dpr}x${h * dpr}.png`) })
  await page.close()
}
await browser.close()
console.log('icons and splash screens written')
