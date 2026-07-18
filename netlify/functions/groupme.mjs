import { addSubmission } from "./_store.mjs";
import { commandHelp, parseReportCommand } from "./_slots.mjs";

const VERSION = "groupme-v4-2026-07-18";
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

async function postToGroupMe(text) {
  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) throw new Error("GROUPME_BOT_ID is missing in Netlify.");

  const response = await fetch("https://api.groupme.com/v3/bots/post", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bot_id: botId, text }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`GroupMe post failed with ${response.status}: ${responseText || "No response body"}`);
  }

  return { status: response.status, responseText };
}

function welcomeMessage() {
  return [
    "👋 Education Bot is connected.",
    "",
    "Send a tour report like:",
    "!r SEALION 1:15 APON",
    "!r PENGUIN 2:45 NS",
    "!r BELUGA 2:00 ISSUE Guest arrived late",
    "",
    "Send !r help for the full guide.",
  ].join("\n");
}

export default async function handler(request) {
  const url = new URL(request.url);

  try {
    const expectedKey = process.env.GROUPME_CALLBACK_KEY;
    if (!expectedKey) {
      return json({
        ok: false,
        version: VERSION,
        error: "GROUPME_CALLBACK_KEY is missing in Netlify.",
      }, 500);
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
          message: "GroupMe accepted the welcome message. Check Chats and Message Requests.",
        });
      }

      return json({
        ok: true,
        version: VERSION,
        message: "GroupMe callback endpoint is online.",
      });
    }

    if (request.method !== "POST") {
      return json({ ok: false, version: VERSION, error: "Method not allowed." }, 405);
    }

    const message = await request.json();

    if (message.sender_type === "bot" || message.system || !message.text) {
      return json({ ok: true, version: VERSION, ignored: true });
    }

    const parsed = parseReportCommand(message.text);
    if (parsed.kind === "ignore") {
      return json({ ok: true, version: VERSION, ignored: true });
    }

    const senderId = message.sender_id || message.user_id;
    const senderName = message.name || "GroupMe user";

    if (!allowedSender(senderId)) {
      await postToGroupMe(`Sorry ${senderName}, you aren't on the approved reporter list yet.`);
      return json({ ok: true, version: VERSION, blocked: true });
    }

    if (parsed.kind === "help") {
      await postToGroupMe(commandHelp());
      return json({ ok: true, version: VERSION, action: "help-posted" });
    }

    if (parsed.kind === "error") {
      await postToGroupMe(`⚠️ ${parsed.message}`);
      return json({ ok: true, version: VERSION, action: "error-posted" });
    }

    const result = await addSubmission({
      slot: parsed.slot,
      status: parsed.status,
      note: parsed.note,
      who: senderName,
      source: "groupme",
      sourceId: message.id || message.source_guid,
      senderId,
    });

    const statusText = parsed.status === "APON" ? "all normal" : parsed.status;
    const duplicateText = result.duplicate ? " (already received)" : "";

    await postToGroupMe([
      `✅ Report received${duplicateText}`,
      parsed.label,
      statusText,
      `Submitted by ${senderName}`,
    ].join("\n"));

    return json({ ok: true, version: VERSION, duplicate: result.duplicate });
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
