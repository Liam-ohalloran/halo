import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHaloLink, parseAuthLink } from '../src/lib/auth-link.ts'

test('halo:// link after the browser followed the email link: tokens in the hash', () => {
  assert.deepEqual(parseAuthLink('halo://auth#access_token=AAA&refresh_token=RRR&expires_in=3600&token_type=bearer&type=magiclink'), { kind: 'session', access_token: 'AAA', refresh_token: 'RRR' })
})

test('the link as pasted from the email: verify URL with a one time token', () => {
  assert.deepEqual(parseAuthLink('https://brqrszaljxeduelpuyty.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=halo%3A%2F%2Fauth'), { kind: 'otp', token_hash: 'abc123', type: 'magiclink' })
  assert.deepEqual(parseAuthLink('halo://auth?token_hash=h1&type=email'), { kind: 'otp', token_hash: 'h1', type: 'email' })
})

test('a code', () => {
  assert.deepEqual(parseAuthLink('halo://auth?code=xyz'), { kind: 'code', code: 'xyz' })
})

test('errors from Supabase come back as a message', () => {
  assert.deepEqual(parseAuthLink('halo://auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), { kind: 'error', message: 'Email link is invalid or has expired' })
})

test('anything else is not a sign-in link', () => {
  assert.equal(parseAuthLink('hello'), null)
  assert.equal(parseAuthLink('https://example.com/page'), null)
  assert.equal(parseAuthLink('https://x.supabase.co/auth/v1/verify?token=a&type=evil'), null)
})

test('only halo:// links come from the app link handler', () => {
  assert.ok(isHaloLink('halo://auth#a=b'))
  assert.ok(!isHaloLink('https://halo://'))
})
