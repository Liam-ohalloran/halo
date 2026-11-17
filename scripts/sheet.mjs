// Contact sheet of the screenshots for review.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const [size, ...names] = process.argv.slice(2)
const w = size === 'panel' ? 400 : 393
const imgs = names.map((n) => `<figure><img src="data:image/png;base64,${readFileSync(`shots/${size}-${n}.png`).toString('base64')}"><figcaption>${n}</figcaption></figure>`).join('')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: (w + 24) * Math.min(4, names.length) + 24, height: 400 }, deviceScaleFactor: 1 })
await p.setContent(`<style>body{margin:0;padding:12px;background:#05030a;display:grid;grid-template-columns:repeat(${Math.min(4, names.length)},${w}px);gap:24px 24px;font:600 14px system-ui;color:#b3a6d4}figure{margin:0}img{width:${w}px;border-radius:14px;display:block;border:1px solid #2a1c46}figcaption{margin-top:6px;text-align:center}</style>${imgs}`)
await p.screenshot({ path: `shots/sheet-${size}.png`, fullPage: true })
await b.close()
