import { getStore } from "@netlify/blobs";
import { adminPasswordConfigured, validAdminPassword } from "./_store.mjs";

const STORE_NAME = "tour-report-data";

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

function passwordFrom(request, url) {
  return request.headers.get("x-admin-password") || url.searchParams.get("password") || "";
}

// Works against both the v1 (exceptions only) and v2 (all reports) day shapes.
function flaggedCount(day) {
  if (Number.isInteger(day.flaggedCount)) return day.flaggedCount;
  return (day.exceptions || []).length;
}

export default async function handler(request) {
  try {
    if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);

    if (!adminPasswordConfigured()) {
      return json(
        {
          error:
            "Admin password is not configured. Add SHIFT_ADMIN_PASSWORD in Netlify environment variables, then redeploy.",
          code: "ADMIN_PASSWORD_NOT_CONFIGURED",
        },
        503
      );
    }

    const url = new URL(request.url);
    if (!validAdminPassword(passwordFrom(request, url))) {
      return json({ error: "Incorrect admin password." }, 401);
    }

    const db = getStore({ name: STORE_NAME, consistency: "strong" });
    const month = url.searchParams.get("month");

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: "Invalid month." }, 400);
      const record = await db.get(`archives/${month}`, { type: "json" }).catch(() => null);
      if (!record) return json({ error: "No archive for that month." }, 404);
      return json(record);
    }

    const { blobs } = await db.list({ prefix: "archives/" });
    const months = await Promise.all(
      blobs
        .map((blob) => blob.key.slice("archives/".length))
        .filter((m) => /^\d{4}-\d{2}$/.test(m))
        .sort()
        .reverse()
        .map(async (m) => {
          const record = await db.get(`archives/${m}`, { type: "json" }).catch(() => null);
          const days = Object.values(record?.days || {});
          return {
            month: m,
            dayCount: days.length,
            reportCount: days.reduce((sum, d) => sum + (d.totalReports || 0), 0),
            flaggedCount: days.reduce((sum, d) => sum + flaggedCount(d), 0),
            archivedAt: record?.archivedAt || null,
          };
        })
    );

    return json({ months });
  } catch (error) {
    console.error("archives function failed", error);
    return json({ error: "Unable to load archives." }, 500);
  }
}
