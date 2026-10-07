import * as storeApi from "./_store.mjs";
import { VALID_STATUSES } from "./_slots.mjs";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

export function createDayHandler(api = storeApi) {
  const { addSubmission, adminPasswordConfigured, chicagoToday, getDay, getTourConfig, saveDay, validAdminPassword, validDate } = api;
  return async function handler(request) {
    try {
      const url = new URL(request.url);
      const access = request.headers.get("x-admin-password") || "";
      const supervisor = validAdminPassword(access);
      if (["GET", "PUT"].includes(request.method)) {
        if (!adminPasswordConfigured()) return json({ error: "Supervisor password is not configured. Contact the app owner." }, 503);
        if (!supervisor) return json({ error: "Unlock with the supervisor password to access daily reports." }, 401);
      }

      if (request.method === "GET") {
        const date = url.searchParams.get("date") || chicagoToday();
        if (!validDate(date)) return json({ error: "Invalid date." }, 400);
        return json(await getDay(date));
      }

      if (request.method === "POST") {
        const input = await request.json().catch(() => ({}));
        if (access && !supervisor) return json({ error: "Incorrect admin password." }, 401);
        if (input.date && (!validDate(input.date) || (!supervisor && input.date !== chicagoToday()))) {
          return json({ error: "Only a supervisor can add reports for another date." }, 403);
        }

        const slotId = String(input.slotId || "").trim();
        const status = String(input.status || "").trim().toUpperCase();
        const config = await getTourConfig();
        const tour = config.tours.find((item) => item.id === slotId && item.active !== false && item.reportable !== false);

        if (!tour) return json({ error: "Choose an active tour." }, 400);
        if (!VALID_STATUSES.has(status)) return json({ error: "Invalid status." }, 400);
        if (status === "ISSUE" && !String(input.note || "").trim()) {
          return json({ error: "Something happened reports require a note." }, 400);
        }

        const result = await addSubmission({
          date: validDate(input.date) ? input.date : chicagoToday(),
          slotId: tour.id,
          slot: Number.isInteger(tour.legacyIndex) ? tour.legacyIndex : null,
          status,
          note: input.note,
          who: input.who || (access ? "Supervisor entry" : "Online form"),
          source: access ? "shift-manual" : "web",
        });
        return json({ ok: true, ...result }, 201);
      }

      if (request.method === "PUT") {
        const input = await request.json();
        if (!validDate(input.date)) return json({ error: "Invalid date." }, 400);
        if (!(input.version === null || typeof input.version === "string")) {
          return json({ error: "Reload this date before saving." }, 428);
        }
        const date = input.date;
        // input.who is the supervisor making the edit; saveDay stamps who/at onto
        // the corrections that are new or whose text changed.
        return json({ ok: true, day: await saveDay(date, input) });
      }

      return json({ error: "Method not allowed." }, 405);
    } catch (error) {
      if (error.code === "DAY_CONFLICT") return json({ error: "This report changed in another session. Review the latest changes before saving.", code: error.code }, 409);
      console.error("day function failed", error);
      return json({ error: "Unable to process the report." }, 500);
    }

}
}

export default createDayHandler();
