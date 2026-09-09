import { getStore } from "@netlify/blobs";
import { getTourConfig } from "./_store.mjs";
import { normalizeOverride } from "./_slots.mjs";

// Roll-up logic shared by the scheduled cleanup function and the on-demand
// run-cleanup endpoint. The underscore prefix keeps this file from being
// deployed as its own function.

const STORE_NAME = "tour-report-data";
const MIN_RETENTION_DAYS = 7;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_ARCHIVE_MONTHS = 13;

function retentionDays() {
  const raw = Number(process.env.RETENTION_DAYS);
  if (!Number.isFinite(raw)) return DEFAULT_RETENTION_DAYS;
  return Math.max(MIN_RETENTION_DAYS, Math.floor(raw));
}

function archiveMonths() {
  const raw = Number(process.env.ARCHIVE_MONTHS);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_ARCHIVE_MONTHS;
  return Math.floor(raw);
}

function shiftedDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function shiftedMonth(months) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 7);
}

function dateFromKey(key) {
  const match = key.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// "Flagged" = anything a supervisor would want pulled to the top:
// a status other than APON, or any report that carried a note.
function isFlagged(status, note) {
  return String(status || "").toUpperCase() !== "APON" || String(note || "").trim().length > 0;
}

// Mirrors shift.html's tourFor(): byId(s.slotId) || legacy(s.slot). A tour
// with no legacyIndex is left out of the legacy map so that a submission with
// no slot index cannot collide with it.
function tourIndex(tours) {
  const byId = new Map(tours.map((t) => [t.id, t]));
  const byLegacy = new Map();
  for (const t of tours) {
    if (Number.isInteger(t.legacyIndex)) byLegacy.set(t.legacyIndex, t);
  }

  return {
    label: (t) => t.label || t.name || t.id,
    resolve(slotId, slot) {
      const direct = slotId ? byId.get(slotId) : null;
      if (direct) return direct;
      if (slot === null || slot === undefined || slot === "") return null;
      const index = Number(slot);
      return Number.isInteger(index) ? byLegacy.get(index) || null : null;
    },
  };
}

// Supervisor corrections. v2 day records keep them at .overrides; getDay in
// _store.mjs falls back to .slots and ignores the field on pre-v2 records,
// so the roll-up reads them the same way.
function overridesFrom(dayRecord) {
  if (dayRecord?.schemaVersion !== 2) return {};
  return dayRecord.overrides || dayRecord.slots || {};
}

function nonEmptyNarrative(narrative) {
  const out = {};
  for (const [key, value] of Object.entries(narrative || {})) {
    const text = String(value || "").trim();
    if (text) out[key] = text;
  }
  return out;
}

async function buildDaySummary(db, date, tours, index) {
  const { blobs } = await db.list({ prefix: `submissions/${date}/` });
  const submissions = (
    await Promise.all(blobs.map((blob) => db.get(blob.key, { type: "json" }).catch(() => null)))
  ).filter(Boolean);

  const dayRecord = (await db.get(`days/${date}`, { type: "json" }).catch(() => null)) || {};
  const counts = { APON: 0, NS: 0, DNS: 0, ISSUE: 0, OTHER: 0 };
  let flaggedCount = 0;

  // Tours that must not be listed as assumed APON: anything carrying a
  // submission or a supervisor correction.
  const accountedFor = new Set();

  const reports = submissions
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((s) => {
      const status = String(s.status || "").toUpperCase();
      const note = String(s.note || "").trim();
      if (status in counts) counts[status] += 1;
      else counts.OTHER += 1;
      if (isFlagged(status, note)) flaggedCount += 1;
      const tour = index.resolve(s.slotId, s.slot);
      if (tour) accountedFor.add(tour.id);
      else if (s.slotId) accountedFor.add(s.slotId);
      return {
        tour: tour ? index.label(tour) : s.slotId || "Unknown tour",
        status,
        note,
        who: String(s.who || "").trim(),
        // Where the report came in from: groupme, web, or shift-manual for a
        // supervisor addition. The archive labels each report with it.
        source: String(s.source || "").trim(),
        at: s.createdAt || null,
      };
    });

  // The corrected line a supervisor put on the printed report. Keys are a tour
  // id or a stringified legacy slot index, so they resolve the same way a
  // submission does.
  const overrides = [];
  for (const [key, value] of Object.entries(overridesFrom(dayRecord))) {
    // { text, who, at } now, a bare string on older records.
    const entry = normalizeOverride(value);
    if (!entry) continue;
    const tour = index.resolve(key, key);
    if (tour) accountedFor.add(tour.id);
    overrides.push({ tour: tour ? index.label(tour) : key, text: entry.text, who: entry.who || "", at: entry.at || null });
  }

  // Tours nobody reported on. The shift report treats these as APON by
  // default, so they are recorded separately from an actual APON report.
  const unreported = tours
    .filter((t) => t.active !== false && t.reportable !== false && !accountedFor.has(t.id))
    .map((t) => index.label(t));

  return {
    summary: {
      totalReports: reports.length,
      flaggedCount,
      counts,
      reports,
      overrides,
      unreported,
      narrative: nonEmptyNarrative(dayRecord.narrative),
    },
    keys: [...blobs.map((b) => b.key), `days/${date}`],
  };
}

async function purgeExpiredCooldowns(db) {
  const { blobs } = await db.list({ prefix: "cooldowns/" });
  const now = Date.now();
  let removed = 0;
  await Promise.all(
    blobs.map(async (blob) => {
      const record = await db.get(blob.key, { type: "json" }).catch(() => null);
      if (!record || Number(record.until) < now) {
        await db.delete(blob.key);
        removed += 1;
      }
    })
  );
  return removed;
}

async function purgeOldArchives(db) {
  const oldest = shiftedMonth(archiveMonths());
  const { blobs } = await db.list({ prefix: "archives/" });
  const doomed = blobs.filter((blob) => {
    const month = blob.key.slice("archives/".length);
    return /^\d{4}-\d{2}$/.test(month) && month < oldest;
  });
  await Promise.all(doomed.map((blob) => db.delete(blob.key)));
  return doomed.length;
}

export async function runCleanup() {
  const days = retentionDays();
  const cutoff = shiftedDate(days);
  const db = getStore({ name: STORE_NAME, consistency: "strong" });

  const tourConfig = await getTourConfig();
  const tours = tourConfig.tours;
  const index = tourIndex(tours);

  // Every date that still has raw data and is now past the retention window.
  const staleDates = new Set();
  for (const prefix of ["submissions/", "days/"]) {
    const { blobs } = await db.list({ prefix });
    for (const blob of blobs) {
      const date = dateFromKey(blob.key);
      if (date && date < cutoff) staleDates.add(date);
    }
  }

  const archivedDates = [];
  const keysToDelete = [];

  // Group by month so each archive blob is read and written once.
  const byMonth = new Map();
  for (const date of staleDates) {
    const month = date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(date);
  }

  for (const [month, dates] of byMonth) {
    const key = `archives/${month}`;
    const existing = (await db.get(key, { type: "json" }).catch(() => null)) || {
      schemaVersion: 2,
      month,
      days: {},
    };
    existing.schemaVersion = 2;
    existing.days = existing.days || {};

    for (const date of dates.sort()) {
      const { summary, keys } = await buildDaySummary(db, date, tours, index);
      // Only store a day that has something in it, but always clear its raw keys.
      // A day whose only content is a supervisor correction still has to archive.
      if (
        summary.totalReports > 0 ||
        summary.overrides.length > 0 ||
        Object.keys(summary.narrative).length > 0
      ) {
        existing.days[date] = summary;
        archivedDates.push(date);
      }
      keysToDelete.push(...keys);
    }

    existing.retentionDays = days;
    existing.archivedAt = new Date().toISOString();
    await db.setJSON(key, existing);
  }

  // Raw data only goes away after its archive write has succeeded.
  await Promise.all(keysToDelete.map((key) => db.delete(key).catch(() => null)));

  const cooldowns = await purgeExpiredCooldowns(db);
  const archivesRemoved = await purgeOldArchives(db);

  const result = {
    ok: true,
    retentionDays: days,
    cutoff,
    archivedDates: archivedDates.sort(),
    rawKeysDeleted: keysToDelete.length,
    cooldowns,
    archivesRemoved,
  };
  return result;
}
