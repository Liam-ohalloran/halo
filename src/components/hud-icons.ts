import type { HudIcon } from '../lib/hud'

// The HUD pill icons, drawn as in the approved prototype (design/prototype/index.html, the HI table).
// The volume waves and the brightness rays grow with the level, so a held key shows the icon changing as the bar slides.

const ST = 'fill="none" stroke="currentColor" stroke-linecap="round"'

export function hudIconMarkup(icon: HudIcon): string {
  const l = icon.level ?? 0
  switch (icon.name) {
    case 'vol':
      return `<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>${l > 0 ? `<path d="M16 9.5a3.5 3.5 0 0 1 0 5" ${ST} stroke-width="2.2"/>` : ''}${l > 50 ? `<path d="M18.5 7a7 7 0 0 1 0 10" ${ST} stroke-width="2.2"/>` : ''}${l === 0 ? `<path d="M16 9.5l5 5M21 9.5l-5 5" ${ST} stroke-width="2.2"/>` : ''}`
    case 'bri': {
      const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const r1 = 7.5
        const r2 = 7.5 + 1.5 + l / 45
        const c = Math.cos((a * Math.PI) / 180)
        const s = Math.sin((a * Math.PI) / 180)
        return `<path d="M${(12 + c * r1).toFixed(2)} ${(12 + s * r1).toFixed(2)}L${(12 + c * r2).toFixed(2)} ${(12 + s * r2).toFixed(2)}"/>`
      }).join('')
      return `<circle cx="12" cy="12" r="${(3 + l / 40).toFixed(2)}" fill="currentColor"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="${(0.35 + l / 160).toFixed(2)}">${rays}</g>`
    }
    case 'kbd':
      return '<rect x="2" y="6" width="20" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
    case 'mic':
      return l ? `<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" ${ST} stroke-width="2.2"/>` : `<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M3 3l18 18" ${ST} stroke-width="2.2"/>`
    case 'wifi':
      return `<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0" ${ST} stroke-width="2.4"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/>`
    case 'bt':
      return `<path d="M7 7l10 10-5 5V2l5 5L7 17" ${ST} stroke-width="2.2" stroke-linejoin="round"/>`
    case 'night':
      return '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/>'
    case 'focus':
      return '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'
    case 'plane':
      return '<path d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z" fill="currentColor"/>'
    case 'caps':
      return '<path d="M12 4 4 12h4v4h8v-4h4z" fill="currentColor"/><rect x="8" y="18" width="8" height="2.5" rx="1" fill="currentColor"/>'
    case 'head':
      return `<path d="M4 15v-3a8 8 0 0 1 16 0v3" ${ST} stroke-width="2.4"/><rect x="3" y="14" width="4" height="7" rx="2" fill="currentColor"/><rect x="17" y="14" width="4" height="7" rx="2" fill="currentColor"/>`
    case 'spk':
      return '<rect x="6" y="2" width="12" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="14" r="3.2" fill="currentColor"/>'
    case 'mon':
      return '<rect x="2.5" y="4" width="19" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9 21h6M12 17v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    case 'bolt':
      return '<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/>'
    case 'bat':
      return '<rect x="2" y="7" width="17" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="4.5" y="9.5" width="8" height="5" rx="1.2" fill="currentColor"/><path d="M21 10v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    case 'eq':
      return '<path d="M4 20v-6M4 10V4M12 20v-9M12 7V4M20 20v-4M20 12V4M2 14h4M10 7h4M18 16h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>'
  }
}
