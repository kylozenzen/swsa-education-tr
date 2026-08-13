import { addSubmission, claimCooldown, getTourConfig } from "./_store.mjs";
import { commandHelp, parseReportMessage } from "./_slots.mjs";

const VERSION = "groupme-v8-2026-08-13";
const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

function allowedSender(senderId) {
  const configured = String(process.env.GROUPME_ALLOWED_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length === 0 || configured.includes(String(senderId));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postToGroupMe(text) {
  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) throw new Error("GROUPME_BOT_ID is missing in Netlify.");

  const retryable = new Set([420, 429, 503]);
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch("https://api.groupme.com/v3/bots/post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bot_id: botId, text }),
    });

    const responseText = await response.text();
    if (response.ok) return { ok: true, status: response.status, responseText };

    lastError = new Error(`GroupMe post failed with ${response.status}: ${responseText || "No response body"}`);
    if (!retryable.has(response.status) || attempt === 2) break;
    await sleep(500 * (attempt + 1));
  }

  throw lastError || new Error("GroupMe post failed.");
}

async function safePost(text) {
  try {
    return await postToGroupMe(text);
  } catch (error) {
    console.error("GroupMe reply failed", {
      version: VERSION,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function welcomeMessage() {
  return [
    "👋 Education Bot is connected.",
    "",
    "Just send your tour and time.",
    "No status = APON. Send “help” for the current tour examples.",
  ].join("\n");
}

async function saveOneReport({ parsed, senderName, senderId, sourceId }) {
  return addSubmission({
    slotId: parsed.slotId,
    slot: parsed.slot,
    status: parsed.status,
    note: parsed.note,
    who: senderName,
    source: "groupme",
    sourceId,
    senderId,
  });
}

function confirmationLine(parsed, duplicate = false) {
  const statusText = parsed.status === "APON" ? "APON" : parsed.status;
  const note = parsed.note ? ` — ${parsed.note}` : "";
  return `${duplicate ? "↩️" : "✅"} ${parsed.label}: ${statusText}${note}`;
}

export default async function handler(request) {
  const url = new URL(request.url);

  try {
    const expectedKey = process.env.GROUPME_CALLBACK_KEY;
    if (!expectedKey) {
      return json({ ok: false, version: VERSION, error: "GROUPME_CALLBACK_KEY is missing in Netlify." }, 500);
    }

    if (url.searchParams.get("key") !== expectedKey) {
      return json({ ok: false, version: VERSION, error: "Unauthorized." }, 401);
    }

    if (request.method === "GET") {
      if (url.searchParams.get("start") === "1") {
        const result = await postToGroupMe(welcomeMessage());
        return json({
          ok: true,
          version: VERSION,
          action: "welcome-message-posted",
          groupmeStatus: result.status,
        });
      }

      return json({ ok: true, version: VERSION, message: "GroupMe callback endpoint is online." });
    }

    if (request.method !== "POST") {
      return json({ ok: false, version: VERSION, error: "Method not allowed." }, 405);
    }

    const message = await request.json();
    if (message.sender_type === "bot" || message.system || !message.text) {
      return json({ ok: true, version: VERSION, ignored: true });
    }

    const senderId = String(message.sender_id || message.user_id || "unknown");
    const senderName = message.name || "GroupMe user";
    const config = await getTourConfig();
    const reportSlots = config.tours.filter((slot) => slot.active !== false && slot.reportable !== false);
    const parsed = parseReportMessage(message.text, reportSlots);

    if (parsed.kind === "ignore") {
      return json({ ok: true, version: VERSION, ignored: true });
    }

    if (!allowedSender(senderId)) {
      await safePost(`Sorry ${senderName}, you aren't on the approved reporter list yet.`);
      return json({ ok: true, version: VERSION, blocked: true });
    }

    if (parsed.kind === "help") {
      const perUser = await claimCooldown({ kind: "help-user", senderId, seconds: 60 });
      const global = await claimCooldown({ kind: "help-global", senderId: "group", seconds: 20 });

      if (!perUser.allowed || !global.allowed) {
        return json({ ok: true, version: VERSION, action: "help-rate-limited" });
      }

      const reply = await safePost(commandHelp(reportSlots));
      return json({ ok: true, version: VERSION, action: "help-posted", replyPosted: reply.ok });
    }

    if (parsed.kind === "error") {
      const cooldown = await claimCooldown({ kind: "error-user", senderId, seconds: 10 });
      if (cooldown.allowed) await safePost(`⚠️ ${parsed.message}`);
      return json({ ok: true, version: VERSION, action: "error-handled" });
    }

    const reports = parsed.kind === "batch" ? parsed.reports : [parsed];
    const baseSourceId = String(message.id || message.source_guid || Date.now());
    const confirmations = [];

    for (let index = 0; index < reports.length; index += 1) {
      const report = reports[index];
      const result = await saveOneReport({
        parsed: report,
        senderName,
        senderId,
        sourceId: reports.length > 1 ? `${baseSourceId}:${index}` : baseSourceId,
      });
      confirmations.push(confirmationLine(report, result.duplicate));
    }

    if (parsed.kind === "batch" && parsed.errors.length > 0) {
      confirmations.push(`⚠️ Couldn't read ${parsed.errors.length} line${parsed.errors.length === 1 ? "" : "s"}. Send “help” for examples.`);
    }

    confirmations.push(`Submitted by ${senderName}`);
    const reply = await safePost(confirmations.join("\n"));

    return json({
      ok: true,
      version: VERSION,
      saved: true,
      count: reports.length,
      replyPosted: reply.ok,
    });
  } catch (error) {
    console.error("GroupMe callback failed", {
      version: VERSION,
      message: error instanceof Error ? error.message : String(error),
    });

    return json({
      ok: false,
      version: VERSION,
      error: error instanceof Error ? error.message : "Callback failed.",
    }, 500);
  }
}
