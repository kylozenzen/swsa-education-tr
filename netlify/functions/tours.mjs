import {
  adminPasswordConfigured,
  getTourConfig,
  saveTourConfig,
  validAdminPassword,
} from "./_store.mjs";

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

function passwordFrom(request, input = {}) {
  return request.headers.get("x-admin-password") || input.password || "";
}

export default async function handler(request) {
  try {
    if (request.method === "GET") {
      return json(await getTourConfig());
    }

    if (!adminPasswordConfigured()) {
      return json({
        error: "Tour admin is not configured. Add SHIFT_ADMIN_PASSWORD in Netlify environment variables.",
        code: "ADMIN_PASSWORD_NOT_CONFIGURED",
      }, 503);
    }

    if (request.method === "POST") {
      const input = await request.json().catch(() => ({}));
      if (!validAdminPassword(passwordFrom(request, input))) {
        return json({ error: "Incorrect admin password." }, 401);
      }
      return json({ ok: true });
    }

    if (request.method === "PUT") {
      const input = await request.json();
      if (!validAdminPassword(passwordFrom(request, input))) {
        return json({ error: "Incorrect admin password." }, 401);
      }
      const config = await saveTourConfig(input);
      return json({ ok: true, ...config });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("tours function failed", error);
    return json({ error: error instanceof Error ? error.message : "Unable to update tours." }, 500);
  }
}
