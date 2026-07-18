import { getStore } from "@netlify/blobs";

const STORE_NAME = "tour-report-data";

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export function chicagoToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function cleanText(value, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function addSubmission(input) {
  const date = validDate(input.date) ? input.date : chicagoToday();
  const sourceId = cleanText(input.sourceId, 160);
  const keySuffix = sourceId
    ? `source-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
    : `${Date.now()}-${crypto.randomUUID()}`;
  const key = `submissions/${date}/${keySuffix}`;
  const db = store();

  if (sourceId) {
    const existing = await db.get(key, { type: "json" });
    if (existing) return { submission: existing, duplicate: true };
  }

  const submission = {
    id: crypto.randomUUID(),
    date,
    slot: Number(input.slot),
    status: cleanText(input.status, 20).toUpperCase(),
    note: cleanText(input.note, 1200),
    who: cleanText(input.who, 120),
    source: cleanText(input.source, 40) || "web",
    sourceId,
    senderId: cleanText(input.senderId, 120),
    createdAt: new Date().toISOString(),
  };

  await db.setJSON(key, submission);
  return { submission, duplicate: false };
}

export async function getDay(date) {
  const dayDate = validDate(date) ? date : chicagoToday();
  const db = store();
  const day = (await db.get(`days/${dayDate}`, { type: "json" })) || {
    date: dayDate,
    slots: {},
    narrative: {},
  };

  const { blobs } = await db.list({ prefix: `submissions/${dayDate}/` });
  const submissions = (
    await Promise.all(blobs.map((blob) => db.get(blob.key, { type: "json" })))
  )
    .filter(Boolean)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  const overrides = day.schemaVersion === 2
    ? (day.overrides || day.slots || {})
    : {};

  return {
    date: dayDate,
    slots: overrides,
    narrative: day.narrative || {},
    submissions,
  };
}

export async function saveDay(date, input) {
  const dayDate = validDate(date) ? date : chicagoToday();
  const requestedOverrides = input && typeof input.overrides === "object"
    ? input.overrides
    : (input && typeof input.slots === "object" ? input.slots : {});

  const record = {
    schemaVersion: 2,
    date: dayDate,
    overrides: requestedOverrides,
    narrative: input && typeof input.narrative === "object" ? input.narrative : {},
    updatedAt: new Date().toISOString(),
  };

  await store().setJSON(`days/${dayDate}`, record);
  return record;
}
