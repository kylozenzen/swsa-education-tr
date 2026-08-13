import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { DEFAULT_TOURS } from "./_slots.mjs";

const STORE_NAME = "tour-report-data";
const TOUR_CONFIG_KEY = "config/tours";

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

function cleanId(value) {
  return cleanText(value, 100).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function normalizeTour(slot, index) {
  const name = cleanText(slot?.name, 120);
  const time = cleanText(slot?.time, 40);
  const label = cleanText(slot?.label, 180) || `${name}${time ? ` ${time}` : ""}`.trim();
  const id = cleanId(slot?.id) || `custom-${crypto.randomUUID()}`;
  const aliases = Array.isArray(slot?.aliases)
    ? slot.aliases.map((alias) => cleanText(alias, 160)).filter(Boolean).slice(0, 30)
    : [];
  const legacyIndex = Number.isInteger(slot?.legacyIndex) && slot.legacyIndex >= 0 ? slot.legacyIndex : null;

  return {
    id,
    label: label || `Tour ${index + 1}`,
    name: name || label || `Tour ${index + 1}`,
    time,
    aliases,
    legacyIndex,
    active: slot?.active !== false,
    reportable: slot?.reportable !== false,
  };
}

function defaultTourConfig() {
  return {
    schemaVersion: 1,
    tours: DEFAULT_TOURS.map((slot) => ({ ...slot, aliases: [...(slot.aliases || [])] })),
    updatedAt: null,
  };
}

export async function getTourConfig() {
  const saved = await store().get(TOUR_CONFIG_KEY, { type: "json" });
  if (!saved || !Array.isArray(saved.tours)) return defaultTourConfig();
  return {
    schemaVersion: 1,
    tours: saved.tours.map(normalizeTour),
    updatedAt: saved.updatedAt || null,
  };
}

export async function saveTourConfig(input) {
  const source = Array.isArray(input?.tours) ? input.tours : [];
  if (source.length === 0) throw new Error("At least one tour must remain in the configuration.");
  if (source.length > 150) throw new Error("Tour configuration is too large.");

  const seen = new Set();
  const tours = source.map(normalizeTour).map((slot) => {
    if (seen.has(slot.id)) slot.id = `custom-${crypto.randomUUID()}`;
    seen.add(slot.id);
    return slot;
  });

  const record = {
    schemaVersion: 1,
    tours,
    updatedAt: new Date().toISOString(),
  };
  await store().setJSON(TOUR_CONFIG_KEY, record);
  return record;
}

export function adminPasswordConfigured() {
  return Boolean(String(process.env.SHIFT_ADMIN_PASSWORD || ""));
}

export function validAdminPassword(value) {
  const expected = String(process.env.SHIFT_ADMIN_PASSWORD || "");
  const supplied = String(value || "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
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

  const legacySlot = Number(input.slot);
  const submission = {
    id: crypto.randomUUID(),
    date,
    slotId: cleanId(input.slotId),
    slot: Number.isInteger(legacySlot) && legacySlot >= 0 ? legacySlot : null,
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

export async function claimCooldown({ kind, senderId = "global", seconds }) {
  const safeKind = cleanText(kind, 40).replace(/[^a-zA-Z0-9_-]/g, "-") || "generic";
  const safeSender = cleanText(senderId, 120).replace(/[^a-zA-Z0-9_-]/g, "-") || "unknown";
  const key = `cooldowns/${safeKind}/${safeSender}`;
  const db = store();
  const now = Date.now();
  const current = await db.get(key, { type: "json" });

  if (current && Number(current.until) > now) {
    return { allowed: false, retryAfterMs: Number(current.until) - now };
  }

  await db.setJSON(key, { until: now + seconds * 1000, updatedAt: new Date().toISOString() });
  return { allowed: true, retryAfterMs: 0 };
}
