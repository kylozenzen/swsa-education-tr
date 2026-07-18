# Tour Report + GroupMe v7

Parser reliability update.

Accepted examples:

- `penguin 245 pm apon`
- `sea lion 1L15 apon` (common keyboard typo is corrected)
- `killer whale 245 apon`
- `shark 2:15 ns`
- `beluga 2 guest arrived late`

Several reports may be sent in one GroupMe message, one report per line.

## Deploy

Replace the repository contents with this folder, commit, and wait for Netlify to publish.
No GroupMe or environment-variable changes are needed.

Verify the callback URL in a browser. It should report:

`groupme-v7-2026-07-18`
