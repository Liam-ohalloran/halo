// Card 28: stamps a release tag's version into the desktop app before it is built, so the installer, the app's own version
// and the update check all agree.   node scripts/set-version.mjs v0.2.0
import { readFileSync, writeFileSync } from 'node:fs'
import { versionFromTag } from '../src/lib/updates.ts'

const tag = process.argv[2] ?? ''
const version = versionFromTag(tag)
if (!version) { console.error(`"${tag}" is not a release tag. Use v and three numbers, like v0.2.0.`); process.exit(1) }

const conf = 'desktop/src-tauri/tauri.conf.json'
const c = JSON.parse(readFileSync(conf, 'utf8'))
c.version = version
writeFileSync(conf, JSON.stringify(c, null, 2) + '\n')

const cargo = 'desktop/src-tauri/Cargo.toml'
const t = readFileSync(cargo, 'utf8')
// Only the [package] version, never a dependency's.
const next = t.replace(/(\[package\][^[]*?\nversion\s*=\s*")[^"]+(")/, `$1${version}$2`)
if (next === t && !t.includes(`version = "${version}"`)) { console.error('Could not find the package version in Cargo.toml.'); process.exit(1) }
writeFileSync(cargo, next)
console.log(`Halo ${version}`)
