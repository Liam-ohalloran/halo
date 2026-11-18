import { h } from './dom'

// NumberRoll: any changing number rolls digit by digit, it never jumps (HALO.md 3.2).
// Each digit is a strip of 0 to 9 that slides. Other characters ($ : . and so on) stay put.
// Inherits font size and weight, so size it from the parent.

export interface NumberRollOptions { value: string; label?: string }
export interface NumberRollHandle extends HTMLSpanElement { set(text: string): void }

export function NumberRoll(o: NumberRollOptions): NumberRollHandle {
  const root = h('span', { class: 'h-roll', role: 'img' }) as NumberRollHandle
  let shownLen = -1
  const render = (text: string) => {
    // Rebuild only when the number of characters changes, so same length changes can roll.
    if (text.length !== shownLen) {
      root.replaceChildren(...[...text].map((ch) => {
        if (/\d/.test(ch)) {
          const strip = h('span', { class: 'h-roll-strip' }, ...Array.from({ length: 10 }, (_, i) => h('span', {}, String(i))))
          return h('span', { class: 'h-roll-col', 'data-digit': '1' }, strip)
        }
        return h('span', { class: 'h-roll-ch' }, ch)
      }))
      shownLen = text.length
    }
    ;[...text].forEach((ch, i) => {
      const col = root.children[i] as HTMLElement
      if (col.dataset.digit) (col.firstElementChild as HTMLElement).style.transform = `translateY(${-Number(ch)}em)`
      else col.textContent = ch
    })
    root.setAttribute('aria-label', o.label ? `${o.label} ${text}` : text)
  }
  render(o.value)
  root.set = render
  return root
}
