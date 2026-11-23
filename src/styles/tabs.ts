// TabTheme: one entry per tab, so every later card just picks its key (card 15).
// Home, Study and Pay follow the approved prototype (card 16): a black island with only a glow in the tab's colour.
// Every other value is copied from the 600 x 290 boards in design/boards/ (Home2, Music, Study3, Pay3, Sixers2, Week, More, Controls).
// colour = the tab colour (active rail icon, accents). rail = the icon colour while the tab is not open.
// bg, border and glow are the frame: a tinted gradient, a 1 px tinted border and a soft corner glow. Never remove the glow.

export type TabId = 'base' | 'home' | 'music' | 'study' | 'pay' | 'sixers' | 'week' | 'alerts' | 'money' | 'marks' | 'claude' | 'night' | 'shelf' | 'widgets' | 'more' | 'controls' | 'audio' | 'launch'

export interface TabTheme {
  id: TabId
  /** Header title and rail tooltip. */
  label: string
  /** Rail aria-label, when it differs from the title. */
  aria: string
  colour: string
  /** Colour of the glow under the open window, when it differs from the tab colour. */
  shadow?: string
  rail: string
  /** Frame background (a CSS background value) and 1 px border colour. */
  bg: string
  border: string
  /** Frame padding: top right bottom left, in px, as on the board. */
  pad: [number, number, number, number]
  /** Primary text colour. */
  text: string
  /** Soft corner glow: inline style for the absolutely positioned span. */
  glow: string
  /** Extra layers drawn under the content (Music: blurred colour field and a scrim). */
  layers: string[]
}

const GLOW_AT = 'position:absolute;pointer-events:none;'
const corner = (rgb: string, a: number, pos: string, w = 340, h = 230) =>
  `${GLOW_AT}${pos};width:${w}px;height:${h}px;background:radial-gradient(closest-side,rgba(${rgb},${a}),rgba(${rgb},0))`
const NEUTRAL_BORDER = 'rgba(255,255,255,0.10)'
const neutral = (a: string, b: string, c: string) => `linear-gradient(165deg, ${a} 0%, ${b} 55%, ${c} 100%)`

export const TAB_THEMES: Record<TabId, TabTheme> = {
  // Card 29: the Base tab is a photo that fills the island (design/prototype/base-tab.html), so there is no tinted gradient or
  // corner glow of its own. The ring and the soft blue light under the island are the prototype's. The panel draws the photo.
  base: {
    id: 'base', label: 'Base', aria: 'Base', colour: '#9DB8FF', shadow: '#78A0FF', rail: '#9DB8FF',
    bg: '#0a1430', border: 'rgba(150,180,255,0.75)', pad: [10, 13, 0, 13], text: '#FFFFFF',
    glow: 'display:none', layers: [],
  },
  home: {
    id: 'home', label: 'Home', aria: 'Home', colour: '#FFC23D', shadow: '#FF8A1E', rail: '#F2F2F4',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  music: {
    id: 'music', label: 'Music', aria: 'Music', colour: '#C9B6F0', rail: '#C9B6F0',
    bg: '#0E0D14', border: 'rgba(201,182,240,0.22)', pad: [10, 18, 16, 18], text: '#F2F2F4',
    glow: 'position:absolute;inset:-40px;pointer-events:none;background:radial-gradient(60% 80% at 15% 30%, rgba(108,84,190,0.75), rgba(108,84,190,0) 70%), radial-gradient(55% 75% at 70% 20%, rgba(52,98,170,0.6), rgba(52,98,170,0) 70%), radial-gradient(60% 70% at 85% 90%, rgba(150,70,140,0.45), rgba(150,70,140,0) 70%), #14121E;filter:blur(18px)',
    layers: ['position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg, rgba(8,8,14,0.35), rgba(8,8,14,0.62))'],
  },
  study: {
    id: 'study', label: 'Study', aria: 'Study', colour: '#9fb0ff', shadow: '#3D5AFE', rail: '#9fb0ff',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  pay: {
    id: 'pay', label: 'Pay', aria: 'Pay', colour: '#5CFF7A', shadow: '#5CFF7A', rail: '#5CFF7A',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  sixers: {
    id: 'sixers', label: 'Sixers', aria: 'Sixers', colour: '#88B5E0', rail: '#88B5E0',
    bg: neutral('#1D2C3F', '#151E2A', '#10151C'), border: 'rgba(136,181,224,0.18)', pad: [10, 16, 12, 16], text: '#F5F5F7',
    glow: corner('136,181,224', 0.18, 'left:-80px;top:-90px', 320, 220), layers: [],
  },
  week: {
    id: 'week', label: 'Week', aria: 'Week', colour: '#FF8A1E', shadow: '#FF8A1E', rail: '#FF8A1E',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  alerts: {
    id: 'alerts', label: 'Alerts', aria: 'Alerts', colour: '#FF8A80', shadow: '#FF453A', rail: '#FF8A80',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  money: {
    id: 'money', label: 'Money', aria: 'Money', colour: '#5CFF7A', shadow: '#5CFF7A', rail: '#5CFF7A',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  marks: {
    id: 'marks', label: 'Marks', aria: 'Marks', colour: '#FFC23D', shadow: '#FFC23D', rail: '#FFC23D',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  claude: {
    id: 'claude', label: 'Claude', aria: 'Claude', colour: '#FF9FD8', shadow: '#B04CFF', rail: '#FF9FD8',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  night: {
    id: 'night', label: 'Night', aria: 'Night', colour: '#C3B8FF', shadow: '#8B7BFF', rail: '#C3B8FF',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  shelf: {
    id: 'shelf', label: 'Shelf', aria: 'Shelf', colour: '#3D9BFF', shadow: '#3D9BFF', rail: '#3D9BFF',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  widgets: {
    id: 'widgets', label: 'Widgets', aria: 'Widgets', colour: '#F5F7FF', shadow: '#ED174C', rail: '#F5F7FF',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  audio: {
    id: 'audio', label: 'Audio', aria: 'Audio', colour: '#4c9bff', shadow: '#2f86ff', rail: '#4c9bff',
    bg: '#000', border: 'rgba(255,255,255,0.08)', pad: [10, 16, 12, 16], text: '#F5F7FF',
    glow: 'display:none', layers: [],
  },
  launch: {
    id: 'launch', label: 'Launch', aria: 'Launch', colour: '#7FD0FF', rail: '#7FD0FF',
    bg: '#06060a', border: 'rgba(127,208,255,0.22)', pad: [10, 16, 12, 16], text: '#F5F5F7',
    glow: 'position:absolute;inset:-40px;pointer-events:none;background:radial-gradient(50% 70% at 10% 10%, rgba(61,155,255,0.5), rgba(61,155,255,0) 70%), radial-gradient(45% 60% at 60% 70%, rgba(255,47,163,0.3), rgba(255,47,163,0) 70%), radial-gradient(40% 60% at 100% 0%, rgba(92,255,122,0.3), rgba(92,255,122,0) 70%), #06060a;filter:blur(18px)',
    layers: [],
  },
  more: {
    id: 'more', label: 'Settings', aria: 'Settings', colour: '#D8C28C', rail: '#B9B9C2',
    bg: neutral('#1C1B21', '#141418', '#0F0F12'), border: NEUTRAL_BORDER, pad: [10, 16, 12, 16], text: '#F5F5F7',
    glow: corner('216,194,140', 0.16, 'left:-90px;top:-110px'), layers: [],
  },
  controls: {
    id: 'controls', label: 'Controls', aria: 'Controls', colour: '#D99FB3', rail: '#D99FB3',
    bg: neutral('#1B1A20', '#141417', '#101012'), border: NEUTRAL_BORDER, pad: [10, 16, 12, 16], text: '#F5F5F7',
    glow: corner('217,159,179', 0.10, 'right:-90px;top:-100px'), layers: [],
  },
}

/** The prototype's tab order (card 23). Liam can hide and reorder them, and the saved order lives in the settings row. */
export const DEFAULT_ORDER: TabId[] = ['base', 'home', 'pay', 'week', 'study', 'music', 'sixers', 'money', 'controls', 'audio', 'launch', 'alerts', 'claude', 'night', 'marks', 'shelf', 'widgets', 'more']
export const RAIL: TabId[] = DEFAULT_ORDER
export const TAB_IDS: TabId[] = DEFAULT_ORDER

/** Tabs with a real panel today. Everything else shows "Coming soon" in its own colour. */
export const BUILT: TabId[] = ['base', 'home', 'study', 'pay', 'sixers']

export const isTabId = (v: unknown): v is TabId => typeof v === 'string' && (TAB_IDS as string[]).includes(v)
/** Accepts the old id: the Home tab used to be called Now. */
export const parseTab = (v: unknown): TabId | null => (v === 'now' ? 'home' : isTabId(v) ? v : null)

/** Rail icons, drawn on a 24 grid exactly as the boards draw them. */
export const RAIL_ICONS: Record<TabId, string> = {
  base: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  home: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"></rect><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"></rect>',
  music: '<path d="M9 18V5l11-2v13"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="17.5" cy="16" r="2.5"></circle>',
  study: '<path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6z"></path><path d="M12 6v14.5"></path>',
  pay: '<rect x="3" y="6" width="18" height="14" rx="2.5"></rect><path d="M3 10h18"></path>',
  sixers: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8"></path>',
  week: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
  alerts: '<path d="M18 16V11a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4"></path>',
  money: '<path d="M3 7a3 3 0 0 1 3-3h12a2 2 0 0 1 2 2v1H6a1 1 0 0 0 0 2h14a1 1 0 0 1 1 1v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"></path>',
  marks: '<path d="M12 4l9 5-9 5-9-5z"></path><path d="M7 11.5V16c0 1 2.2 3 5 3s5-2 5-3v-4.5"></path>',
  claude: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"></path><path d="M19 15v4M17 17h4"></path>',
  night: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path>',
  shelf: '<path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"></path><path d="M3 13h5l1 3h6l1-3h5"></path>',
  widgets: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"></rect><rect x="13.5" y="3.5" width="7" height="7" rx="2"></rect><circle cx="7" cy="17" r="3.5"></circle><rect x="13.5" y="13.5" width="7" height="7" rx="2"></rect>',
  more: '<circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle>',
  controls: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle>',
  audio: '<path d="M4 9h4l5-4v14l-5-4H4z"></path><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"></path>',
  launch: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"></rect><rect x="13.5" y="3.5" width="7" height="7" rx="2"></rect><rect x="3.5" y="13.5" width="7" height="7" rx="2"></rect><path d="M17 13.5v7M13.5 17h7"></path>',
}
