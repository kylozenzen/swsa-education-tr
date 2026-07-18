import { addSubmission, chicagoToday, getDay, saveDay, validDate } from "./_store.mjs";
import { REPORT_SLOTS, VALID_STATUSES } from "./_slots.mjs";

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
      const input = await request.json();
      const slot = Number(input.slot);
      const status = String(input.status || "").toUpperCase();

      if (!Number.isInteger(slot) || slot < 0 || slot >= REPORT_SLOTS.length) {
        return json({ error: "Invalid tour slot." }, 400);
      }
      if (!VALID_STATUSES.has(status)) {
        return json({ error: "Invalid status." }, 400);
      }
      if (status === "ISSUE" && !String(input.note || "").trim()) {
        return json({ error: "ISSUE reports require a note." }, 400);
      }

      const result = await addSubmission({ ...input, slot, status });
      return json({ ok: true, ...result }, result.duplicate ? 200 : 201);
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
