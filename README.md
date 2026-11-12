# SWSA Tour Report + GroupMe Bot

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

No `TOUR_REPORT_FORM_URL` environment variable is required. The canonical staff form route is `/tour-form`.

## GroupMe callback URL

Use the direct function URL:

`https://YOUR-SITE.netlify.app/.netlify/functions/groupme?key=YOUR_CALLBACK_KEY`

## Verify the deployed version

Open the callback URL in a browser. It should return:

`"version":"groupme-v9-2026-09-01-tour-form"`

This authenticated GET response confirms that Netlify is running the current GroupMe function deployment. It also reports `"tourFormPath":"/tour-form"` without exposing callback credentials or other secrets.

## Easy report examples

- `penguin 245 pm apon`
- `sea lion 1L15 apon`
- `killer whale 245 apon`
- `aldabra 330`
- `shark 2:15 ns`
- `beluga 2 guest arrived late`

No status defaults to APON. Multiple reports can be sent in one message, one per line.


## Sensitive reports

Staff can type `tour form` (or `tourform`, `tour report form`, `report form`, or `private tour form`) in GroupMe. The bot replies with the canonical `/tour-form` URL without creating a report from the command. Normal operational reports continue to use the usual GroupMe workflow.

The Shift Report displays only reports actually submitted for the selected date; the year-round Tour Catalog is used for bot recognition and is not a daily operating schedule.

## Nicknames and "Any time" tours

Each tour card in the Tour Catalog (Shift Report → Supervisor admin) has:

- **Nicknames** — extra names for the tour, comma-separated (e.g. `SL, Sea Lions`). They work with every time on the card, so `SL` + time `1:15` recognizes `sl 1:15`, `sl 115` and `sl 1 15`.
- **Any time — ignore the time typed** — the bot files the report under this tour whatever time the guide types (`beluga 5 apon` files under BELUGA even if the catalog says 2:00). With no time typed, it files only when a status or nothing follows (`beluga apon`, `beluga`), so `beluga keepers said...` stays chat.
- **Built-in spellings** — the original hard-coded spellings. Remove any with ✕.
