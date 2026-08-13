import { addSubmission, chicagoToday, getDay, getTourConfig, saveDay, validAdminPassword, validDate } from "./_store.mjs";
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
      if (!access) return json({ error: "Online tour reporting is currently disabled." }, 410);
      if (!validAdminPassword(access)) return json({ error: "Incorrect admin password." }, 401);

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
        who: input.who || "Supervisor entry",
        source: "shift-manual",
      });
      return json({ ok: true, ...result }, 201);
    }

    if (request.method === "PUT") {
      const input = await request.json();
      const date = validDate(input.date) ? input.date : chicagoToday();
      return json({ ok: true, day: await saveDay(date, input) });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("day function failed", error);
    return json({ error: "Unable to process the report." }, 500);
  }
}
