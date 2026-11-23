import '../styles/tokens.css'
import '../styles/signin.css'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isDesktop } from '../lib/desktop'
import { parseAuthLink } from '../lib/auth-link'
import { signInWithLink } from '../lib/desktop-auth'
import { rememberEmail, savedEmail, signInError } from '../lib/auth-form'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * Sign-in: email and password first, with the magic link underneath as "Email me a link instead". The link opens in the default browser, so the second step also takes
 * a pasted link, which is how it works inside the NotchPixel web tab and the iPhone app.
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

  /** Email and password. The password is read from the field when the form is sent and goes straight to Supabase. */
  function showPassword(msgText = notice ?? '', isErr = Boolean(notice)) {
    const input = el('input', 'signin-field')
    input.type = 'email'
    input.required = true
    input.value = email
    input.placeholder = 'you@email.com'
    input.autocomplete = 'email'
    input.setAttribute('aria-label', 'Email')
    const pass = el('input', 'signin-field')
    pass.type = 'password'
    pass.required = true
    pass.placeholder = 'Password'
    pass.autocomplete = 'current-password'
    pass.setAttribute('aria-label', 'Password')
    const btn = el('button', 'signin-btn', 'Sign in')
    btn.type = 'submit'
    const msg = el('p', `signin-msg${isErr ? ' err' : ''}`, msgText)
    msg.setAttribute('role', 'status')
    const other = el('button', 'signin-link', 'Email me a link instead')
    other.type = 'button'
    other.addEventListener('click', () => { email = input.value.trim() || email; showEmail('', false) })
    const form = el('form', 'signin-form')
    form.append(input, pass, btn, msg, other)
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      email = input.value.trim()
      if (!email || !pass.value) return
      btn.disabled = true
      const { error } = await client.auth.signInWithPassword({ email, password: pass.value })
      pass.value = ''
      btn.disabled = false
      if (error) {
        msg.className = 'signin-msg err'
        msg.textContent = signInError(error.message)
        return
      }
      rememberEmail(email) // the page switches to the island by itself once the session lands
    })
    card.replaceChildren(...head('Sign in', 'Use your email and password.'), form)
    if (!email) input.focus(); else pass.focus()
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
    if (isDesktop()) {
      const have = el('button', 'signin-link', 'Paste the link instead')
      have.type = 'button'
      have.addEventListener('click', () => { email = input.value.trim() || email; showSent() })
      form.append(have)
    }
    const back = el('button', 'signin-link', 'Use a password instead')
    back.type = 'button'
    back.addEventListener('click', () => { email = input.value.trim() || email; showPassword('', false) })
    form.append(back)
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      email = input.value.trim()
      if (!email) return
      btn.disabled = true
      const { error } = await client.auth.signInWithOtp({
        email,
        // In the app the email link opens Halo itself (halo:// is registered by the app). Elsewhere it opens the site.
        options: { emailRedirectTo: isDesktop() ? 'halo://auth' : location.origin + import.meta.env.BASE_URL },
      })
      btn.disabled = false
      if (error) {
        msg.className = 'signin-msg err'
        msg.textContent = signInError(error.message)
        return
      }
      rememberEmail(email)
      showSent()
    })
    card.replaceChildren(...head('Email me a link', 'We email you a link. No password needed.'), form)
    if (!email) input.focus()
  }

  function showSent() {
    const input = el('input', 'signin-field')
    input.placeholder = isDesktop() ? 'Paste the link instead' : 'Paste the link from the email'
    input.setAttribute('aria-label', 'Magic link')
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
      if (/^(https?|halo):\/\/\S+/.test(v)) {
        // The app has no address bar to land on, so it signs in with what the link carries instead of opening it.
        if (isDesktop()) {
          const link = parseAuthLink(v)
          if (!link) { msg.className = 'signin-msg err'; msg.textContent = "That isn't the link from the email."; return }
          go.disabled = true
          const err = await signInWithLink(client, link)
          go.disabled = false
          if (err) { msg.className = 'signin-msg err'; msg.textContent = err }
          return
        }
        location.href = v
        return
      }
      msg.className = 'signin-msg err'
      msg.textContent = "That isn't the link from the email."
    })
    card.replaceChildren(...head('Check your inbox', isDesktop() ? `We sent a link to ${email || "your email"}. Click it and Halo opens and signs in. If it opens in a browser instead, paste it below.` : `We sent a link to ${email || "your email"}. Tap it, or paste it here if it opened somewhere else.`), form)
    input.focus()
  }

  showPassword()
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
