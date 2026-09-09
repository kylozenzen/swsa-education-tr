import { runCleanup } from "./_cleanup-core.mjs";
import { adminPasswordConfigured, validAdminPassword } from "./_store.mjs";

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

function passwordFrom(request, url) {
  return request.headers.get("x-admin-password") || url.searchParams.get("password") || "";
}

// The scheduled cleanup function is not reachable over HTTP, so this endpoint
// lets a supervisor run the same roll-up on demand.
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

    const result = await runCleanup();
    console.log("cleanup complete", result);
    return json(result);
  } catch (error) {
    console.error("run-cleanup failed", error);
    return json({ error: "Cleanup failed." }, 500);
  }
}
