# Tour Report + GroupMe v6

## What changed

Educators no longer need to remember `!r` or type APON.

Examples:

- `sea lion 1:15` → APON
- `shark 2:15 ns` → no show
- `penguin 3:45 dns` → did not sell
- `beluga 2 guest arrived late` → ISSUE with that note
- `vip 1` → APON for VIP tour 1

The old `!r ...` format still works.

## Help protection

- One help response per user per 60 seconds
- One help response for the whole group every 20 seconds
- Repeated bad commands receive at most one error response every 10 seconds per user
- Normal conversation is ignored
- Reports are stored before the bot attempts its confirmation reply
- GroupMe 420/429/503 responses are retried briefly

## Deploy

Replace the repository contents with this package and commit. Netlify will redeploy from GitHub.
No environment-variable or callback URL changes are needed.

After deployment, verify:

`https://YOUR-SITE.netlify.app/.netlify/functions/groupme?key=YOUR_KEY`

The version should be `groupme-v6-2026-07-18`.
