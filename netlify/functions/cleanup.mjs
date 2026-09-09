import { getStore } from "@netlify/blobs";
import { getTourConfig, validAdminPassword } from "./_store.mjs";

// Runs every day at 09:00 UTC (about 4am San Antonio time).
export const config = { schedule: "0 9 * * *" };

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

function nonEmptyNarrative(narrative) {
  const out = {};
  for (const [key, value] of Object.entries(narrative || {})) {
    const text = String(value || "").trim();
    if (text) out[key] = text;
  }
  return out;
}

async function buildDaySummary(db, date, tours, tourLabels) {
  const { blobs } = await db.list({ prefix: `submissions/${date}/` });
  const submissions = (
    await Promise.all(blobs.map((blob) => db.get(blob.key, { type: "json" }).catch(() => null)))
  ).filter(Boolean);

  const dayRecord = (await db.get(`days/${date}`, { type: "json" }).catch(() => null)) || {};
  const counts = { APON: 0, NS: 0, DNS: 0, ISSUE: 0, OTHER: 0 };
  let flaggedCount = 0;

  const reports = submissions
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map((s) => {
      const status = String(s.status || "").toUpperCase();
      const note = String(s.note || "").trim();
      if (status in counts) counts[status] += 1;
      else counts.OTHER += 1;
      if (isFlagged(status, note)) flaggedCount += 1;
      return {
        tour: tourLabels.get(s.slotId) || s.slotId || "Unknown tour",
        status,
        note,
        who: String(s.who || "").trim(),
        at: s.createdAt || null,
      };
    });

  // Tours nobody reported on. The shift report treats these as APON by
  // default, so they are recorded separately from an actual APON report.
  const reportedIds = new Set(submissions.map((s) => s.slotId).filter(Boolean));
  const unreported = tours
    .filter((t) => t.active !== false && t.reportable !== false && !reportedIds.has(t.id))
    .map((t) => t.label || t.name || t.id);

  return {
    summary: {
      totalReports: reports.length,
      flaggedCount,
      counts,
      reports,
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

export default async function handler(request) {
  // Scheduled runs arrive as POST from Netlify. A GET with the admin password
  // lets a supervisor run the roll-up on demand.
  if (request && request.method === "GET") {
    const url = new URL(request.url);
    const password =
      request.headers.get("x-admin-password") || url.searchParams.get("password") || "";
    if (!validAdminPassword(password)) {
      return Response.json({ error: "Incorrect admin password." }, { status: 401 });
    }
  }

  const days = retentionDays();
  const cutoff = shiftedDate(days);
  const db = getStore({ name: STORE_NAME, consistency: "strong" });

  try {
    const tourConfig = await getTourConfig();
    const tours = tourConfig.tours;
    const tourLabels = new Map(tours.map((t) => [t.id, t.label || t.name || t.id]));

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
        const { summary, keys } = await buildDaySummary(db, date, tours, tourLabels);
        // Only store a day that has something in it, but always clear its raw keys.
        if (summary.totalReports > 0 || Object.keys(summary.narrative).length > 0) {
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
    console.log("cleanup complete", result);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("cleanup failed", error);
    return Response.json({ error: "Cleanup failed." }, { status: 500 });
  }
}
