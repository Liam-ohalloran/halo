// Records /motion to screenshots/<card>/ as webm, at normal speed and x0.25.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync, renameSync, rmSync, readdirSync } from 'node:fs'

const card = process.argv[2] ?? '03'
const dir = `screenshots/${card}`
const tmp = `${dir}/_rec`
mkdirSync(tmp, { recursive: true })

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch()
const size = { width: 720, height: 820 }

async function record(name, slow, ms) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, colorScheme: 'dark', recordVideo: { dir: tmp, size } })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5199/halo/motion/')
  await page.waitForTimeout(1200)
  if (slow) { await page.getByRole('tab', { name: 'x0.25' }).click(); await page.waitForTimeout(600) }
  await page.getByRole('button', { name: 'Play all' }).click()
  await page.waitForTimeout(ms)
  await ctx.close()
  const file = readdirSync(tmp).find((f) => f.endsWith('.webm'))
  renameSync(`${tmp}/${file}`, `${dir}/${name}.webm`)
}
await record('motion-normal', false, 15000)
await record('motion-x0.25', true, 15000 * 4)
await browser.close()
await server.close()
rmSync(tmp, { recursive: true, force: true })

console.log('saved to', dir)
