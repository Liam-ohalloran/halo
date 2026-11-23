import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_PASSWORD, passwordProblem, passwordSaveError, signInError } from '../src/lib/auth-form.ts'
import { recoverSession, shouldWaitForSession } from '../src/lib/session-recover.ts'

test('a password needs at least 8 characters', () => {
  assert.equal(MIN_PASSWORD, 8)
  assert.equal(passwordProblem('1234567'), 'Use at least 8 characters.')
  assert.equal(passwordProblem(''), 'Use at least 8 characters.')
  assert.equal(passwordProblem('12345678'), null)
  assert.equal(passwordProblem('a much longer pass phrase'), null)
})

test('errors are plain words and never echo what Supabase said', () => {
  assert.match(signInError('Invalid login credentials'), /Wrong email or password/)
  assert.match(signInError('Email not confirmed'), /Confirm your email/)
  assert.match(signInError('Email rate limit exceeded'), /Too many tries/)
  assert.match(signInError('Failed to fetch'), /Can't reach Halo/)
  assert.equal(signInError('weird: secret-123'), 'Something went wrong. Try again.')
  assert.match(passwordSaveError('New password should be different from the old password.'), /already your password/)
  assert.match(passwordSaveError('Password should be at least 8 characters'), /at least 8/)
  assert.doesNotMatch(passwordSaveError('boom hunter2'), /hunter2/)
})

test('a stored session that cannot refresh yet waits instead of signing out', async () => {
  assert.equal(shouldWaitForSession(true, 0), true)
  assert.equal(shouldWaitForSession(false, 0), false)
  assert.equal(shouldWaitForSession(true, 12), false)
  let calls = 0
  const session = await recoverSession(
    async () => ({ data: { session: ++calls >= 3 ? { id: 1 } : null } }),
    async () => true,
    async () => {},
  )
  assert.deepEqual(session, { id: 1 })
  assert.equal(calls, 3)
})

test('no stored session means the sign-in card straight away', async () => {
  let calls = 0
  const session = await recoverSession(async () => { calls++; return { data: { session: null } } }, async () => false, async () => {})
  assert.equal(session, null)
  assert.equal(calls, 1)
})

test('a stored session that never recovers gives up after the limit', async () => {
  let calls = 0
  const session = await recoverSession(async () => { calls++; return { data: { session: null } } }, async () => true, async () => {})
  assert.equal(session, null)
  assert.equal(calls, 13)
})
