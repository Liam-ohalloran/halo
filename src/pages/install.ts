import '../styles/tokens.css'
import '../styles/install.css'
import { h } from '../components/dom'
import { Icon, preloadIcons } from '../components'

// Install guide (card 10): three steps for Safari "Add to Home Screen". Plain copy, no dashes or semicolons (HALO.md 3.7).

const STEPS: { icon: string; title: string; body: string }[] = [
  { icon: 'compass', title: 'Open Halo in Safari', body: 'It has to be Safari, not Chrome or a link inside another app. Go to liam-ohalloran.github.io/halo and sign in.' },
  { icon: 'export', title: 'Tap the Share button', body: 'It is the square with an arrow at the bottom of Safari. Scroll the sheet up if you cannot see the next option.' },
  { icon: 'plus-square', title: 'Tap Add to Home Screen', body: 'Leave the name as Halo, then tap Add. Open Halo from the new icon and it fills the whole screen.' },
]

const base = import.meta.env.BASE_URL
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

void preloadIcons(STEPS.map((s) => s.icon), ['regular'])

const steps = h('ol', { class: 'ins-steps' },
  ...STEPS.map((s, i) =>
    h('li', { class: 'ins-step' },
      h('span', { class: 'ins-num', 'aria-hidden': 'true' }, String(i + 1)),
      h('div', { class: 'ins-text' }, h('h2', { class: 'ins-h' }, s.title), h('p', { class: 'ins-p' }, s.body)),
      h('span', { class: 'ins-icon', 'aria-hidden': 'true' }, Icon(s.icon, 'regular', 28)),
    ),
  ),
)

document.getElementById('app')!.replaceChildren(
  h('main', { class: 'ins-page' },
    h('div', { class: 'ins-card' },
      h('div', { class: 'ins-label' }, 'Halo'),
      h('h1', { class: 'ins-title' }, 'Add Halo to your iPhone'),
      h('p', { class: 'ins-lead' }, standalone ? 'Halo is already on your home screen.' : 'Three steps and it opens full screen like any other app.'),
      steps,
      h('p', { class: 'ins-note' }, 'You sign in once inside the app itself. Tap Send magic link, then press and hold the link in the email and choose Copy Link. Paste it into Halo. Tapping the link opens Safari, not the app.'),
      h('a', { class: 'ins-btn', href: base }, standalone ? 'Open Halo' : 'Back to Halo'),
    ),
  ),
)
