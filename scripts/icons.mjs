// Renders public/icons/halo.svg to the PNG sizes the PWA and iOS need.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const svg = readFileSync(new URL('../public/icons/halo.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') })
  await page.close()
}
await browser.close()
console.log('icons written')
