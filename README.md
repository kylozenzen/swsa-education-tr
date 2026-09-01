# SWSA Tour Report + GroupMe Bot — v7

GitHub-ready repository for the Tour Report form, Shift Report dashboard, Netlify Blobs storage, and GroupMe bot callback.

## Upload to GitHub

Upload the **contents of this folder** to the root of the repository. The repository root should immediately show:

- `index.html`
- `shift.html`
- `netlify.toml`
- `package.json`
- `netlify/functions/`

Do not place everything inside an extra folder in the repository.

## Required Netlify environment variables

- `GROUPME_BOT_ID`
- `GROUPME_CALLBACK_KEY`
- `TOUR_REPORT_FORM_URL` (optional; defaults to `/online-form.html` on the deployed site)

## GroupMe callback URL

Use the direct function URL:

`https://YOUR-SITE.netlify.app/.netlify/functions/groupme?key=YOUR_CALLBACK_KEY`

## Verify the deployed version

Open the callback URL in a browser. It should return:

`"version":"groupme-v7-2026-07-18"`

## Easy report examples

- `penguin 245 pm apon`
- `sea lion 1L15 apon`
- `killer whale 245 apon`
- `aldabra 330`
- `shark 2:15 ns`
- `beluga 2 guest arrived late`

No status defaults to APON. Multiple reports can be sent in one message, one per line.


## Sensitive reports

Staff can type `tour form` (or `tourform`, `tour report form`, `report form`, or `private tour form`) in GroupMe. The bot replies with the existing online form URL without creating a report from the command. Normal operational reports continue to use the usual GroupMe workflow.

The Shift Report displays only reports actually submitted for the selected date; the year-round Tour Catalog is used for bot recognition and is not a daily operating schedule.
