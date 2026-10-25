import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { DEFAULT_TOURS, normalizeOverride, normalizeOverrides } from "./_slots.mjs";
import { mergeNarrative } from "./_narrative.mjs";

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

function configuredAdminPasswords() {
  return [
    process.env.SHIFT_ADMIN_PASSWORD,
    process.env.ARRIVAL_DESK_ADMIN_PASSWORD,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export function adminPasswordConfigured() {
  return configuredAdminPasswords().length > 0;
}

export function validAdminPassword(value) {
  const supplied = String(value || "").trim();
  if (!supplied) return false;
  const suppliedBuffer = Buffer.from(supplied);
  return configuredAdminPasswords().some((expected) => {
    const expectedBuffer = Buffer.from(expected);
    return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  });
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
    note: cleanText(input.note, 4000),
    who: cleanText(input.who, 120),
    // VIP tours: the guide who led it (may differ from who reported it).
    leader: cleanText(input.leader, 60),
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

  // Corrections are { text, who, at }; records written before attribution
  // existed hold a bare string and are read as an unattributed edit.
  const overrides = day.schemaVersion === 2
    ? normalizeOverrides(day.overrides || day.slots)
    : {};

  return {
    date: dayDate,
    slots: overrides,
    narrative: day.narrative || {},
    submissions,
    removed: Array.isArray(day.removed) ? day.removed : [],
  };
}

// Find a submission's storage key on a date by its id.
async function findSubmission(db, date, id) {
  const { blobs } = await db.list({ prefix: `submissions/${date}/` });
  for (const blob of blobs) {
    const record = await db.get(blob.key, { type: "json" }).catch(() => null);
    if (record && record.id === id) return { key: blob.key, record };
  }
  return null;
}

// Change only the removed list on a day record, keeping answers and corrections.
async function updateRemoved(db, date, change) {
  const key = `days/${date}`;
  const stored = (await db.get(key, { type: "json" })) || { schemaVersion: 2, date, overrides: {}, narrative: {} };
  stored.removed = change(Array.isArray(stored.removed) ? stored.removed : []).slice(-50);
  await db.setJSON(key, stored);
}

// A removed report is kept on its day (not in the report list or the archive)
// so a supervisor can restore it if it was removed by mistake.
export async function removeSubmission(date, id, who) {
  const db = store();
  const found = await findSubmission(db, date, id);
  if (!found) return null;
  const removed = { ...found.record, storageKey: found.key, removedBy: cleanText(who, 120) || null, removedAt: new Date().toISOString() };
  await updateRemoved(db, date, (list) => [...list.filter((r) => r.id !== id), removed]);
  await db.delete(found.key);
  return removed;
}

export async function restoreSubmission(date, id) {
  const db = store();
  const stored = (await db.get(`days/${date}`, { type: "json" })) || {};
  const entry = (stored.removed || []).find((r) => r.id === id);
  if (!entry) return null;
  const { storageKey, removedBy, removedAt, ...record } = entry;
  const key = storageKey && storageKey.startsWith(`submissions/${date}/`) ? storageKey : `submissions/${date}/${Date.now()}-${record.id}`;
  await db.setJSON(key, record);
  await updateRemoved(db, date, (list) => list.filter((r) => r.id !== id));
  return record;
}

// Move a report filed on the wrong day. It keeps its original time and who sent
// it, and notes where it came from.
export async function moveSubmission(date, id, toDate, who) {
  if (!validDate(toDate) || toDate === date) return null;
  const db = store();
  const found = await findSubmission(db, date, id);
  if (!found) return null;
  const suffix = found.key.slice(`submissions/${date}/`.length);
  const moved = { ...found.record, date: toDate, movedFrom: date, movedBy: cleanText(who, 120) || null, movedAt: new Date().toISOString() };
  await db.setJSON(`submissions/${toDate}/${suffix}`, moved);
  await db.delete(found.key);
  return moved;
}

export async function saveDay(date, input) {
  const dayDate = validDate(date) ? date : chicagoToday();
  const db = store();
  const stored = (await db.get(`days/${dayDate}`, { type: "json" })) || {};
  const previous = stored.schemaVersion === 2
    ? normalizeOverrides(stored.overrides || stored.slots)
    : {};

  // A save that carries no corrections (the shift questions autosave) keeps the
  // corrections already on record instead of wiping them.
  const hasOverrides = input && (typeof input.overrides === "object" || typeof input.slots === "object");
  const requestedOverrides = !hasOverrides
    ? previous
    : (typeof input.overrides === "object" ? input.overrides : input.slots);

  const who = cleanText(input?.who, 120);
  const at = new Date().toISOString();
  const overrides = {};
  for (const [key, value] of Object.entries(requestedOverrides || {})) {
    const entry = normalizeOverride(value);
    if (!entry) continue;
    const prior = previous[key];
    // A correction is stamped when it first appears or when its text changes.
    // An unchanged line keeps the supervisor and time already on record, so a
    // narrative autosave cannot rewrite yesterday's attribution.
    overrides[key] = prior && prior.text === entry.text
      ? prior
      : { text: entry.text, who: who || null, at };
  }

  const record = {
    schemaVersion: 2,
    date: dayDate,
    overrides,
    narrative: mergeNarrative(stored.narrative, input),
    removed: Array.isArray(stored.removed) ? stored.removed : [],
    updatedAt: at,
  };

  await db.setJSON(`days/${dayDate}`, record);
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
