// Card 29: the small shake a control makes when the helper said no and the screen went back. Web Animations, so it never fights a
// control's own transition or entrance. Nothing happens under reduced motion.

const KEYFRAMES: Keyframe[] = [
  { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
  { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' },
]

export function shake(el: Element | null | undefined): void {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
  ;(el as HTMLElement).animate(KEYFRAMES, { duration: 320, easing: 'ease-in-out' })
}
