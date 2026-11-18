import { mockBackend } from '../dev/mock'
import { mountPay } from '../panels/pay'

// Dev only (not in the build inputs): the Pay panel on its own with fixture data.
// /pay/?mock=full | holiday | empty | loading | error
const mode = new URLSearchParams(location.search).get('mock') ?? 'full'
const app = document.getElementById('app')!
app.style.cssText = 'max-width:680px;margin:0 auto;padding:12px'
mountPay(app, mockBackend(mode), () => () => {})
