# Claude, Shelf and Widgets (card 22)

## Task runs (the Claude tab's list)

A scheduled task tells Halo what it did by inserting one row into `task_runs`. The Claude tab shows the latest four, running ones first, and updates within a couple of seconds.

| Column | Meaning |
|---|---|
| `user_id` | Liam's user id. Required when inserting with the service role key. |
| `title` | Up to 80 characters, e.g. `Morning briefing`. |
| `status` | `running`, `done` or `failed`. |
| `detail` | Up to 160 characters, e.g. `Sent to Alerts`. Optional. |
| `finished_at` | Set when it ends. Optional. |

The service role key lives only in the scheduled task's own secret store. Never in this repo and never in the frontend.

```powershell
$h = @{ apikey = $env:HALO_SERVICE_KEY; Authorization = "Bearer $env:HALO_SERVICE_KEY"; 'Content-Type' = 'application/json' }
$body = @{ user_id = $env:HALO_USER_ID; title = 'Morning briefing'; status = 'done'; detail = 'Sent to Alerts' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'https://brqrszaljxeduelpuyty.supabase.co/rest/v1/task_runs' -Headers $h -Body $body
```

To show a run as it starts, insert it with `status = 'running'`, then PATCH the same row to `done` or `failed`.

## The ask box

The quick pills (What's next, Pay, Study, Tasks) answer from Halo's own data and need nothing. Free text goes to the `ask-claude` edge function in `supabase/functions/ask-claude/`, which holds the Anthropic key as a function secret. **It is not deployed yet**, so the ask box says "Claude isn't connected yet" until it is. To turn it on:

```powershell
supabase secrets set ANTHROPIC_API_KEY=<your key> --project-ref brqrszaljxeduelpuyty
supabase functions deploy ask-claude --project-ref brqrszaljxeduelpuyty
```

## Shelf

Files go to the private `shelf` bucket (20 MB each, folder per user), links and notes live in `shelf_items`. Eight items at most. Every row and file is owner only, so the laptop and the phone see the same Shelf. Drop, paste or pick a file. **Phone** copies a link that works for one hour. **Copy** copies the file name, link or note. **Open** opens a file or link. **Remove** needs a second tap.

## Widgets

Countdowns come from `countdowns` (Doomsday 18 Dec, birthday 4 Dec and Christmas are put in the first time the table is empty). Tap one to rename it or change its date. Daily games ticks are kept on the device they were made on, per Perth day.
