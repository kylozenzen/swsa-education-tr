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
- `SHIFT_ADMIN_PASSWORD` (or the existing `ARRIVAL_DESK_ADMIN_PASSWORD`): required to read and edit daily reports and access the archive. Set it in the Functions environment scope and redeploy. If neither is set, daily supervisor access fails closed; staff submissions continue to work.

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

## Daily supervisor workflow

1. Open `/shift` and unlock with the existing supervisor password before reading reports or completing questions. Credentials stay in page memory and are sent in a request header, not a URL. Reloading locks the page again.
2. Check the date, enter your supervisor name, review submissions, and complete shift questions. **Save now** retries immediately; autosave retains failed edits and retries while the page stays open. A persistent status indicates Saved, Unsaved, Saving, failure, or a conflict.
3. If another supervisor changes a different field, those changes merge. If the same field changes, compare the displayed local and saved values and choose which to keep. The server uses atomic ETag conditional writes so a stale request cannot overwrite a newer report.
4. Apply any typed correction or report entry before switching dates or exporting. Date changes and **Save as PDF** wait for pending saves. A failed save blocks these actions; closing/reloading warns about unsaved edits. Do not close the page after a failure: drafts are held in memory, not persisted on the device.
5. Export the PDF and upload it manually to the shared Drive folder **Tour Reports → 2026**. Verify the uploaded PDF. There is no automatic Drive upload.

The `/api/day` and direct function GET/PUT routes require the supervisor password. Staff POST remains available for today's reports; historical dates require supervisor access. Public staff submissions do not grant permission to read reports or make corrections. This is a shared supervisor password, not individual accounts or staff submission authentication.

Archive screens and CSV exports label unreported catalog entries **Not reported**, with no APON or DNS outcome inferred. This also applies when reading archives created before this change; stored archive blobs need no migration. Such entries may represent offerings that did not operate. "Days without flagged submissions" is not a claim that every tour operated normally.

## Validate before production rollout

Run `npm ci && npm test`. Test a branch preview with **separate test Blobs storage / a separate Netlify site**, because site-wide Blobs are shared across deployment contexts on the same site. Do not create test reports in a production-connected preview.

Confirm the supervisor password is configured in Netlify; reload `/shift` and verify the gate. Check that anonymous GET/PUT requests fail, staff reporting still works, saves survive transient failures, conflicts are shown, and a PDF includes all shift questions. Existing open tabs must reload after deploying this version because older clients do not send credentials or version tokens. Recheck the deployment using operational test data approved for that environment.
