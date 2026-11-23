import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isNewer, updateRow, versionFromTag } from '../src/lib/updates.ts'

test('a release tag is v and three numbers, nothing else builds a release', () => {
  assert.equal(versionFromTag('v0.2.0'), '0.2.0')
  assert.equal(versionFromTag('v10.20.30'), '10.20.30')
  for (const bad of ['0.2.0', 'v0.2', 'v1.2.3-beta', 'latest', 'v1.2.3.4', '', 'vx.y.z']) assert.equal(versionFromTag(bad), null, bad)
})

test('newer versions compare by number, not by text', () => {
  assert.equal(isNewer('0.10.0', '0.9.0'), true)
  assert.equal(isNewer('0.2.0', '0.2.0'), false)
  assert.equal(isNewer('v1.0.0', '0.9.9'), true)
  assert.equal(isNewer('0.1.0', '0.2.0'), false)
  assert.equal(isNewer('abc', '0.1.0'), false)
})

test('the update row says one thing and offers the one button that makes sense', () => {
  assert.deepEqual(updateRow('0.1.0', { kind: 'idle' }), { label: 'Halo 0.1.0', sub: 'Checks for updates when it starts', button: 'Check for updates', busy: false })
  assert.equal(updateRow('0.1.0', { kind: 'checking' }).button, null)
  assert.equal(updateRow('0.1.0', { kind: 'latest' }).sub, 'You have the newest Halo')
  const a = updateRow('0.1.0', { kind: 'available', version: '0.2.0' })
  assert.deepEqual([a.sub, a.button], ['Halo 0.2.0 is ready', 'Install and restart'])
  assert.equal(updateRow('0.1.0', { kind: 'installing', version: '0.2.0' }).busy, true)
  assert.equal(updateRow('', { kind: 'idle' }).label, 'Halo', 'before the app says its version')
  assert.equal(updateRow('0.1.0', { kind: 'error', message: 'Nope.' }).sub, 'Nope.')
  for (const k of ['idle', 'checking', 'latest'] as const) assert.ok(!/[;—]|\s-\s/.test(updateRow('0.1.0', { kind: k }).sub), 'no dashes or semicolons')
})

test('the app is set up to update itself from this repository, with a signed key', () => {
  const conf = JSON.parse(readFileSync(new URL('../desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
  assert.equal(conf.bundle.createUpdaterArtifacts, true)
  assert.deepEqual(conf.bundle.targets, ['nsis'])
  assert.deepEqual(conf.plugins.updater.endpoints, ['https://github.com/Liam-ohalloran/halo/releases/latest/download/latest.json'])
  assert.match(conf.plugins.updater.pubkey, /^[A-Za-z0-9+/=]{100,}$/, 'a real public key, not a placeholder')
  assert.ok(!/PRIVATE|SECRET/i.test(JSON.stringify(conf)), 'the private key is never in the repo')
  const cap = JSON.parse(readFileSync(new URL('../desktop/src-tauri/capabilities/default.json', import.meta.url), 'utf8'))
  assert.ok(cap.permissions.includes('updater:default'))
})

test('the release workflow builds on a version tag, signs the update, and attaches Halo-Setup.exe', () => {
  const y = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
  assert.match(y, /tags: \['v\*'\]/)
  assert.match(y, /windows-latest/)
  assert.match(y, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/)
  assert.match(y, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD: \$\{\{ secrets\./)
  assert.match(y, /uploadUpdaterJson: true/)
  assert.match(y, /Halo-Setup\.exe/)
  assert.match(y, /npm run helper:build/, 'the helper sidecar is built before the app')
  assert.match(y, /set-version\.mjs/)
  assert.ok(!/-----BEGIN|untrusted comment/.test(y), 'no key material in the workflow')
})
