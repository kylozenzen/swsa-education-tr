import { chicagoToday, getDay, saveDay, validDate } from "./_store.mjs";

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
      return json({ error: "Online tour reporting is currently disabled." }, 410);
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
