import type { SupabaseClient } from '@supabase/supabase-js'
import { friendlyError, h, icon } from '../ui'

const EMAIL_KEY = 'halo.email'

function savedEmail(): string {
  try { return localStorage.getItem(EMAIL_KEY) ?? '' } catch { return '' }
}

/**
 * Magic-link sign-in. NotchPixel panels open email links in the default browser,
 * so the "sent" step lets you paste the link (or the 6-digit code) back into the panel.
 */
export function mountAuth(root: HTMLElement, client: SupabaseClient, initialError?: string): () => void {
  let email = savedEmail()

  function askEmail(err?: string) {
    const input = h('input', {
      type: 'email', class: 'field', placeholder: 'you@email.com', autocomplete: 'email',
      required: true, value: email, 'aria-label': 'Email',
    })
    const btn = h('button', { class: 'btn primary', type: 'submit' }, icon('mail', 14), 'Send magic link')
    const msg = h('div', { class: `form-msg${err ? ' err' : ''}`, role: 'status' }, err ?? '')
    const form = h('form', {
      class: 'auth-form',
      onsubmit: async (e: Event) => {
        e.preventDefault()
        email = input.value.trim()
        if (!email) return
        btn.setAttribute('aria-busy', 'true')
        btn.disabled = true
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
        })
        btn.removeAttribute('aria-busy')
        btn.disabled = false
        if (error) {
          msg.className = 'form-msg err'
          msg.textContent = friendlyError(error.message)
          return
        }
        try { localStorage.setItem(EMAIL_KEY, email) } catch { /* ignore */ }
        sent()
      },
    }, input, btn, msg)
    root.replaceChildren(shell('Sign in to Halo', 'A magic link keeps it simple. No passwords.', form))
    if (!email) input.focus()
  }

  function sent() {
    const paste = h('input', {
      class: 'field', placeholder: 'Paste link or 6-digit code', 'aria-label': 'Magic link or code',
      autocomplete: 'one-time-code', inputmode: 'text',
    })
    const msg = h('div', { class: 'form-msg', role: 'status' })
    const go = h('button', { class: 'btn ghost', type: 'submit' }, 'Continue')
    const form = h('form', {
      class: 'auth-form',
      onsubmit: async (e: Event) => {
        e.preventDefault()
        const v = paste.value.trim()
        if (/^https?:\/\/\S+/.test(v)) {
          location.href = v // the link verifies, then redirects back here with the session
          return
        }
        if (/^\d{6,10}$/.test(v)) {
          go.setAttribute('aria-busy', 'true')
          const { error } = await client.auth.verifyOtp({ email, token: v, type: 'email' })
          go.removeAttribute('aria-busy')
          if (error) {
            msg.className = 'form-msg err'
            msg.textContent = friendlyError(error.message)
          }
          return
        }
        msg.className = 'form-msg err'
        msg.textContent = "That doesn't look like the link or code."
      },
    },
      paste, go, msg,
      h('button', { class: 'link', type: 'button', onclick: () => askEmail() }, 'Use a different email'),
    )
    root.replaceChildren(
      shell('Check your inbox', `We sent a link to ${email}. Tap it here, or copy it into this box if it opened in another browser.`, form, true),
    )
  }

  askEmail(initialError)
  return () => {}
}

function shell(title: string, body: string, form: HTMLElement, sent = false): HTMLElement {
  return h('div', { class: 'auth pop' },
    h('div', { class: `auth-orb${sent ? ' sent' : ''}` }, icon(sent ? 'mail' : 'spark', 22)),
    h('h1', { class: 'auth-title' }, title),
    h('p', { class: 'auth-body' }, body),
    form,
  )
}
