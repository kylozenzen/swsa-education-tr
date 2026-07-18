# Tour Report + GroupMe DM Bot v3

This diagnostic build makes the deployed function version visible in every response.

## Required Netlify environment variables

- `GROUPME_BOT_ID`
- `GROUPME_CALLBACK_KEY`

## Verify deployment

Open:

`https://YOUR-SITE.netlify.app/.netlify/functions/groupme?key=YOUR_KEY`

Expected response includes:

`"version":"dm-v3-2026-07-18"`

Then initialize the DM:

`https://YOUR-SITE.netlify.app/.netlify/functions/groupme?key=YOUR_KEY&start=1`

Expected response includes:

- `"version":"dm-v3-2026-07-18"`
- `"action":"welcome-message-posted"`
- `"groupmeStatus":201`
