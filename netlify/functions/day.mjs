import { addSubmission, chicagoToday, getDay, getTourConfig, moveSubmission, removeSubmission, restoreSubmission, saveDay, validAdminPassword, validDate } from "./_store.mjs";
import { VALID_STATUSES } from "./_slots.mjs";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    if (request.method === "GET") {
      const date = url.searchParams.get("date") || chicagoToday();
      if (!validDate(date)) return json({ error: "Invalid date." }, 400);
      return json(await getDay(date));
    }

    if (request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      const access = request.headers.get("x-admin-password") || "";
      if (access && !validAdminPassword(access)) return json({ error: "Incorrect admin password." }, 401);

      const slotId = String(input.slotId || "").trim();
      const status = String(input.status || "").trim().toUpperCase();
      const config = await getTourConfig();
      const tour = config.tours.find((item) => item.id === slotId && item.active !== false);

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
        leader: input.leader,
        who: input.who || (access ? "Supervisor entry" : "Online form"),
        source: access ? "shift-manual" : "web",
      });
      return json({ ok: true, ...result }, 201);
    }

    if (request.method === "PUT") {
      const input = await request.json();
      const date = validDate(input.date) ? input.date : chicagoToday();
      // input.who is the supervisor making the edit; saveDay stamps who/at onto
      // the corrections that are new or whose text changed.
      return json({ ok: true, day: await saveDay(date, input) });
    }

    // Remove, restore, or move one report. Supervisor password required.
    if (request.method === "PATCH") {
      if (!validAdminPassword(request.headers.get("x-admin-password") || "")) {
        return json({ error: "Unlock supervisor admin first." }, 401);
      }
      const input = await request.json().catch(() => ({}));
      const id = String(input.id || "").trim();
      if (!validDate(input.date) || !id) return json({ error: "Missing report." }, 400);
      let result = null;
      if (input.action === "remove") result = await removeSubmission(input.date, id, input.who);
      else if (input.action === "restore") result = await restoreSubmission(input.date, id);
      else if (input.action === "move") {
        if (!validDate(input.to)) return json({ error: "Pick the date it belongs on." }, 400);
        if (input.to === input.date) return json({ error: "That is already its date." }, 400);
        result = await moveSubmission(input.date, id, input.to, input.who);
      } else return json({ error: "Unknown action." }, 400);
      if (!result) return json({ error: "That report was not found. Refresh and try again." }, 404);
      return json({ ok: true, report: result });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("day function failed", error);
    return json({ error: "Unable to process the report." }, 500);
  }
}
