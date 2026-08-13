import { addSubmission, chicagoToday, getDay, getTourConfig, saveDay, validDate } from "./_store.mjs";
import { VALID_STATUSES } from "./_slots.mjs";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

function findConfiguredSlot(input, tours) {
  const slotId = String(input.slotId || "").trim();
  if (slotId) {
    return tours.find((slot) => slot.id === slotId) || null;
  }

  const legacyIndex = Number(input.slot);
  if (!Number.isInteger(legacyIndex)) return null;
  return tours.find((slot) => slot.legacyIndex === legacyIndex) || null;
}

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
      const status = String(input.status || "").toUpperCase();
      const config = await getTourConfig();
      const available = config.tours.filter((slot) => slot.active !== false && slot.reportable !== false);
      const configuredSlot = findConfiguredSlot(input, available);

      if (!configuredSlot) return json({ error: "Invalid or inactive tour slot." }, 400);
      if (!VALID_STATUSES.has(status)) return json({ error: "Invalid status." }, 400);
      if (status === "ISSUE" && !String(input.note || "").trim()) {
        return json({ error: "ISSUE reports require a note." }, 400);
      }

      const result = await addSubmission({
        ...input,
        slotId: configuredSlot.id,
        slot: configuredSlot.legacyIndex,
        status,
      });
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
