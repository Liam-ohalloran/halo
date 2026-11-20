# Alerts: how a scheduled task adds one

Halo's Alerts tab and the island's gold dot read the `alerts` table. Anything that wants Liam's attention inserts a row. Halo only reads, marks rows read and clears them. It never sends or posts anything.

## The table

| Column | Notes |
|---|---|
| `id` | uuid, filled in for you |
| `user_id` | Liam's auth user id. **Required** when inserting with the service role key (there is no signed in user to default from) |
| `type` | one of the types below. An unknown type still shows, as a phone alert |
| `title` | up to 80 characters, shown bold. Keep it short, about 24 characters fits a pill |
| `body` | up to 160 characters, the grey line under the title. Optional |
| `action_label` | up to 24 characters, the gold button on the banner. Optional |
| `action_url` | must start with `http://` or `https://`. Optional. Only the banner shows it, and it only opens a link |
| `created_at` | filled in for you. Drives the "4m" age |
| `read_at` | leave null. Halo sets it when Liam taps or clears an alert |

### Types

| `type` | Tab filter | Banner priority |
|---|---|---|
| `leave_reminder` | WORK | 1st |
| `shift_cover` | WORK | 2nd |
| `call` | PHONE | 3rd |
| `new_mark` | SCHOOL | 4th |
| `battery_low` | WORK | 5th |
| `message` | PHONE | 6th |
| `sixers_final` | PHONE | 7th |
| `focus_done` | SCHOOL | 8th |
| `task_done` | SCHOOL | 9th |

The banner shows the highest priority unread alert (newest first on a tie). The rest become pills, newest first, five at most plus a "+N more" cell.

## Row level security

Every policy is owner only (`user_id = auth.uid()`), so the app, signed in as Liam, can only touch his rows. The **service role key bypasses RLS**, which is how a scheduled task inserts. That is also why it must never be anywhere Halo can see it.

## Where the service role key lives

- **Only** in the scheduled task's own secret store or environment (for example `HALO_SERVICE_KEY`).
- **Never** in this repo, in `.env` files that get committed, in the frontend, in a screenshot, or in a chat message.
- Get it from Supabase, Project Settings, API Keys, the `service_role` secret. If it ever leaks, rotate it there.
- The publishable key in `src/lib/supabase.ts` is a different key and is safe in the browser. It cannot insert alerts for someone else.

Liam's user id: Supabase, Authentication, Users, copy the id of his row. Store it next to the key as `HALO_USER_ID` (it is not secret, but there is no reason to hard code it).

## Insert a row (PowerShell)

```powershell
$h = @{
  apikey        = $env:HALO_SERVICE_KEY
  Authorization = "Bearer $env:HALO_SERVICE_KEY"
  Prefer        = 'return=minimal'
}
$row = @{
  user_id      = $env:HALO_USER_ID
  type         = 'shift_cover'
  title        = 'Cover: Sat 5 to 10'
  body         = 'Blink, grill close'
  action_label = 'Open Blink'
  action_url   = 'https://example.com'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://brqrszaljxeduelpuyty.supabase.co/rest/v1/alerts' -Headers $h -ContentType 'application/json' -Body $row
```

The same call with curl:

```bash
curl -X POST 'https://brqrszaljxeduelpuyty.supabase.co/rest/v1/alerts' \
  -H "apikey: $HALO_SERVICE_KEY" -H "Authorization: Bearer $HALO_SERVICE_KEY" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  -d "{\"user_id\":\"$HALO_USER_ID\",\"type\":\"new_mark\",\"title\":\"Mark released\",\"body\":\"SEQTA, Human Bio\"}"
```

Or as SQL in the Supabase editor, to test:

```sql
insert into public.alerts (user_id, type, title, body)
values ('<liams user id>', 'message', 'New message', 'Messages, hidden');
```

## What happens next

1. Supabase Realtime pushes the insert to Halo. The new pill (or the banner, if it outranks the rest) appears within about 2 seconds, without redrawing the tab.
2. While Halo is closed to the resting island, the island shows a small gold dot while any alert is unread.
3. Tapping a pill, tapping the banner or CLEAR ALL sets `read_at`. Read rows stay in the table. Delete old ones whenever you like (`delete from public.alerts where read_at < now() - interval '30 days'`).

## Rules for scheduled tasks

- Insert one row per event and avoid repeats: check for an existing unread row with the same `type` and `title` first.
- Keep titles and bodies plain Australian English with no em dashes, no hyphens used as dashes and no semicolons.
- Never put passwords, tokens, message contents from private chats or anything else sensitive in `title` or `body`. Halo shows them on screen.
- Halo is read only on Blink, Snapchat, TikTok and myJob. An alert may link to them, it never acts on them.
