// Edge function `ask-claude` (card 22). The Claude tab's ask box calls this. It holds the Anthropic key, so the frontend never does.
// The key is a function secret, never in the repo. NOT deployed yet. To turn it on, in PowerShell:
//   supabase secrets set ANTHROPIC_API_KEY=<your key> --project-ref brqrszaljxeduelpuyty
//   supabase functions deploy ask-claude --project-ref brqrszaljxeduelpuyty
// JWT verification stays on (the default), so only a signed in Halo user can call it. It only answers, it never acts.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const SYSTEM = 'You are Claude inside Halo, a personal dashboard for Liam, a Year 11 student in Perth, Western Australia. Answer in Australian English, in under 40 words, in plain sentences with no lists, no em dashes and no semicolons. You cannot send messages or change anything, you only answer.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ error: 'not set up' }, 503)
  let prompt = ''
  try { prompt = String(((await req.json()) as { prompt?: unknown }).prompt ?? '').trim().slice(0, 300) } catch { /* handled below */ }
  if (!prompt) return json({ error: 'empty prompt' }, 400)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 200, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) return json({ error: 'upstream failed' }, 502)
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const answer = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim()
  return answer ? json({ answer }) : json({ error: 'empty answer' }, 502)
})
