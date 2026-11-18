import '../styles/tokens.css'
import '../styles/signin.css'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMAIL_KEY = 'halo.email'

function savedEmail(): string {
  try { return localStorage.getItem(EMAIL_KEY) ?? '' } catch { return '' }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function plainError(message: string): string {
  if (/rate|too many|seconds/i.test(message)) return 'Too many tries. Wait a minute, then try again.'
  if (/fetch|network/i.test(message)) return "Can't reach Halo. Check your connection and try again."
  if (/expired|invalid/i.test(message)) return 'That link or code has expired. Send a new one.'
  return 'Something went wrong. Try again.'
}

/**
 * Magic link sign-in. The link opens in the default browser, so the second step also takes
 * a pasted link or a 6 digit code, which is how it works inside the NotchPixel web tab.
 */
export function mountSignIn(app: HTMLElement, client: SupabaseClient, notice?: string): void {
  document.documentElement.classList.add('signin')
  let email = savedEmail()

  const card = el('main', 'signin-card')
  card.setAttribute('aria-labelledby', 'signin-title')
  const wrap = el('div', 'signin-wrap')
  wrap.append(card)
  app.replaceChildren(wrap)

  function head(title: string, body: string): HTMLElement[] {
    const t = el('h1', 'signin-title', title)
    t.id = 'signin-title'
    return [el('div', 'signin-label', 'Halo'), t, el('p', 'signin-body', body)]
  }

  function showEmail(msgText = notice ?? '', isErr = Boolean(notice)) {
    const input = el('input', 'signin-field')
    input.type = 'email'
    input.required = true
    input.value = email
    input.placeholder = 'you@email.com'
    input.autocomplete = 'email'
    input.setAttribute('aria-label', 'Email')
    const btn = el('button', 'signin-btn', 'Send magic link')
    btn.type = 'submit'
    const msg = el('p', `signin-msg${isErr ? ' err' : ''}`, msgText)
    msg.setAttribute('role', 'status')
    const form = el('form', 'signin-form')
    form.append(input, btn, msg)
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      email = input.value.trim()
      if (!email) return
      btn.disabled = true
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
      })
      btn.disabled = false
      if (error) {
        msg.className = 'signin-msg err'
        msg.textContent = plainError(error.message)
        return
      }
      try { localStorage.setItem(EMAIL_KEY, email) } catch { /* private mode */ }
      showSent()
    })
    card.replaceChildren(...head('Sign in', 'We email you a link. No password.'), form)
    if (!email) input.focus()
  }

  function showSent() {
    const input = el('input', 'signin-field')
    input.placeholder = 'Paste link or 6 digit code'
    input.autocomplete = 'one-time-code'
    input.setAttribute('aria-label', 'Magic link or code')
    const go = el('button', 'signin-btn secondary', 'Continue')
    go.type = 'submit'
    const msg = el('p', 'signin-msg')
    msg.setAttribute('role', 'status')
    const back = el('button', 'signin-link', 'Use a different email')
    back.type = 'button'
    back.addEventListener('click', () => showEmail('', false))
    const form = el('form', 'signin-form')
    form.append(input, go, msg, back)
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const v = input.value.trim()
      if (/^https?:\/\/\S+/.test(v)) { location.href = v; return }
      if (/^\d{6,10}$/.test(v)) {
        go.disabled = true
        const { error } = await client.auth.verifyOtp({ email, token: v, type: 'email' })
        go.disabled = false
        if (error) {
          msg.className = 'signin-msg err'
          msg.textContent = plainError(error.message)
        }
        return
      }
      msg.className = 'signin-msg err'
      msg.textContent = "That isn't the link or code from the email."
    })
    card.replaceChildren(...head('Check your inbox', `We sent a link to ${email}. Tap it, or paste it here if it opened somewhere else.`), form)
    input.focus()
  }

  showEmail()
}

/** Small signed-in note under the island so it is obvious the session worked. */
export function mountSignedInNote(app: HTMLElement, client: SupabaseClient, email: string): void {
  const note = el('div', 'signed-note')
  const who = el('span', 'signed-who', `Signed in as ${email}`)
  const out = el('button', 'signin-link', 'Sign out')
  out.type = 'button'
  out.addEventListener('click', () => void client.auth.signOut())
  note.append(who)
  // Offer the install guide until Halo is running from the home screen.
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (!standalone) {
    const guide = el('a', 'signin-link', 'Add to Home Screen')
    guide.href = `${import.meta.env.BASE_URL}install/`
    note.append(guide)
  }
  note.append(out)
  app.append(note)
}
