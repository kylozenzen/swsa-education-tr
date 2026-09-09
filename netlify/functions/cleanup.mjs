import { runCleanup } from "./_cleanup-core.mjs";

// Runs every day at 09:00 UTC (about 4am San Antonio time).
// Netlify does not expose scheduled functions over HTTP, so the on-demand
// version of this roll-up lives in run-cleanup.mjs.
export const config = { schedule: "0 9 * * *" };

export default async function handler() {
  try {
    const result = await runCleanup();
    console.log("cleanup complete", result);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("cleanup failed", error);
    return Response.json({ error: "Cleanup failed." }, { status: 500 });
  }
}
