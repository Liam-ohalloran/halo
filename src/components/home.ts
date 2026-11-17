import '../styles/tokens.css'
import '../styles/home.css'

// Card 01 home page: the resting island, pure black, flat top with ears.
export function mountHome(app: HTMLElement): void {
  document.documentElement.classList.add('home')
  const island = document.createElement('div')
  island.className = 'home-island'
  island.setAttribute('role', 'img')
  island.setAttribute('aria-label', 'Halo island')
  app.replaceChildren(island)
}
