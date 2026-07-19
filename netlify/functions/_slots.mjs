export const REPORT_SLOTS = [
  { label: "PIP 10:30AM", aliases: ["PIP 10:30", "PIP 1030", "PIP 10 30"] },
  { label: "PIP 11:00AM", aliases: ["PIP 11", "PIP 11:00", "PIP 1100", "PIP 11 00"] },
  { label: "PIP 1:15", aliases: ["PIP 1:15", "PIP 115", "PIP 1 15"] },
  { label: "SHARK 11", aliases: ["SHARK 11", "SHARK 11:00", "SHARK 1100", "SHARK 11 00"] },
  { label: "SHARK 12", aliases: ["SHARK 12", "SHARK 12:00", "SHARK 1200", "SHARK 12 00"] },
  { label: "SHARK 2:15", aliases: ["SHARK 2:15", "SHARK 215", "SHARK 2 15"] },
  { label: "SHARK 4:00", aliases: ["SHARK 4", "SHARK 4:00", "SHARK 400", "SHARK 4 00"] },
  { label: "SHARK 5:00", aliases: ["SHARK 5", "SHARK 5:00", "SHARK 500", "SHARK 5 00"] },
  { label: "SEALION 1:15", aliases: ["SEALION 1:15", "SEA LION 1:15", "SEALION 115", "SEA LION 115", "SEALION 1 15", "SEA LION 1 15", "SL 1:15", "SL 115"] },
  { label: "AAT 1:30", aliases: ["AAT 1:30", "AAT 130", "AAT 1 30"] },
  { label: "BELUGA 2:00", aliases: ["BELUGA 2", "BELUGA 2:00", "BELUGA 200", "BELUGA 2 00"] },
  { label: "PENGUIN 2:45", aliases: ["PENGUIN 2:45", "PENGUIN 245", "PENGUIN 2 45"] },
  { label: "PENGUIN 3:45", aliases: ["PENGUIN 3:45", "PENGUIN 345", "PENGUIN 3 45"] },
  { label: "ALDABRA 11:15", aliases: ["ALDABRA 11:15", "ALDABRA 1115", "ALDABRA 11 15"] },
  { label: "ALDABRA 2:00", aliases: ["ALDABRA 2", "ALDABRA 2:00", "ALDABRA 200", "ALDABRA 2 00"] },
  { label: "ALDABRA 3:30", aliases: ["ALDABRA 3:30", "ALDABRA 330", "ALDABRA 3 30"] },
  { label: "KILLER WHALE 2:45", aliases: ["KILLER WHALE 2:45", "KILLERWHALE 2:45", "KILLER WHALE 245", "KILLERWHALE 245", "KILLER WHALE 2 45", "KILLERWHALE 2 45", "KW 2:45", "KW 245", "KW 2 45"] },
  { label: "KILLER WHALE 4:45", aliases: ["KILLER WHALE 4:45", "KILLERWHALE 4:45", "KILLER WHALE 445", "KILLERWHALE 445", "KILLER WHALE 4 45", "KILLERWHALE 4 45", "KW 4:45", "KW 445", "KW 4 45"] },
  { label: "Fam", aliases: ["FAM", "FAMILY", "FAMILY ADVENTURE", "FAMILY ADVENTURE TOUR"] },
  { label: "UAE", aliases: ["UAE", "ULTIMATE ANIMAL EXPERIENCE"] },
  { label: "VIP (tour 1)", aliases: ["VIP 1", "VIP TOUR 1", "VIP FIRST"] },
  { label: "VIP (tour 2)", aliases: ["VIP 2", "VIP TOUR 2", "VIP SECOND"] },
  { label: "DP ORIENTATION", aliases: ["DP ORIENTATION", "DP", "DPO"] },
];

export const VALID_STATUSES = new Set(["APON", "NS", "DNS", "ISSUE"]);

/** Fix common phone-keyboard time typos before matching. */
export function cleanInput(value) {
  return String(value || "")
    .replace(/\r/g, "")
    // 1L15, 1I15, and 1|15 should all mean 1:15.
    .replace(/(\d)\s*[LIl|]\s*(\d{2})(?=\b)/g, "$1:$2")
    // Normalize smart punctuation and long dashes.
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, "-")
    .trim();
}

export function normalizeTour(value) {
  return cleanInput(value)
    .toUpperCase()
    .replace(/[']/g, "")
    .replace(/\bA\.?M\.?\b/g, "")
    .replace(/\bP\.?M\.?\b/g, "")
    .replace(/SEA\s+LION/g, "SEALION")
    .replace(/KILLER\s+WHALE/g, "KILLERWHALE")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const aliasRecords = [];
const aliasMap = new Map();

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasRegex(alias) {
  let pattern = escapeRegex(alias.trim())
    .replace(/SEA\\ LION/gi, "SEA\\s*LION")
    .replace(/KILLER\\ WHALE/gi, "KILLER\\s*WHALE")
    .replace(/\\ /g, "[\\s._-]+")
    .replace(/:/g, "\\s*:\\s*");

  return new RegExp(`^${pattern}\\s*(?:A\\.?M\\.?|P\\.?M\\.?)?(?=\\s|$|[-—,;])`, "i");
}

REPORT_SLOTS.forEach((slot, index) => {
  [slot.label, ...slot.aliases].forEach((alias) => {
    const normalized = normalizeTour(alias);
    aliasMap.set(normalized, index);
    aliasRecords.push({ alias, normalized, slot: index, regex: aliasRegex(alias) });
  });
});

aliasRecords.sort((a, b) => b.alias.length - a.alias.length);

export function findSlotIndex(value) {
  const normalized = normalizeTour(value);
  return aliasMap.has(normalized) ? aliasMap.get(normalized) : null;
}

function stripCommand(raw) {
  return raw.replace(/^!(?:report|r)\b\s*/i, "").trim();
}

function helpRequest(raw) {
  return /^(?:!?(?:help|commands?)|!(?:report|r)\s+(?:help|commands?))\s*[?.!]*$/i.test(raw.trim());
}

function matchTourAtStart(body) {
  const cleaned = cleanInput(body);
  for (const record of aliasRecords) {
    const match = cleaned.match(record.regex);
    if (match) {
      const remainder = cleaned.slice(match[0].length).replace(/^\s*[:;,—-]\s*/, "").trim();
      return { slot: record.slot, remainder };
    }
  }
  return null;
}

const APON_PATTERNS = [
  /^APON\b/i,
  /^ALL\s+(?:NORMAL|GOOD)\b/i,
  /^NORMAL\b/i,
  /^GOOD\b/i,
  /^FINE\b/i,
  /^WENT\s+WELL\b/i,
  /^NO\s+ISSUES?\b/i,
  /^OPERATIONAL\s+NORMAL\b/i,
  /^OK(?:AY)?\b/i,
];

const NS_PATTERNS = [
  /^NS\b/i,
  /^NO[-\s]*SHOW\b/i,
  /^DID\s+NOT\s+SHOW\b/i,
  /^DIDN['’]?T\s+SHOW\b/i,
  /^NEVER\s+SHOWED\b/i,
];

const DNS_PATTERNS = [
  /^DNS\b/i,
  /^DID\s+NOT\s+SELL\b/i,
  /^DIDN['’]?T\s+SELL\b/i,
  /^NOT\s+SOLD\b/i,
  /^UNSOLD\b/i,
];

const ISSUE_PATTERNS = [
  /^ISSUE\b/i,
  /^SOMETHING\s+HAPPENED\b/i,
  /^PROBLEM\b/i,
];

function matchStatus(remainder) {
  if (!remainder) return { status: "APON", note: "" };

  const groups = [
    ["APON", APON_PATTERNS],
    ["NS", NS_PATTERNS],
    ["DNS", DNS_PATTERNS],
    ["ISSUE", ISSUE_PATTERNS],
  ];

  for (const [status, patterns] of groups) {
    for (const pattern of patterns) {
      const match = remainder.match(pattern);
      if (match) {
        const note = remainder.slice(match[0].length).replace(/^\s*[:;,—-]\s*/, "").trim();
        return { status, note };
      }
    }
  }

  return { status: "ISSUE", note: remainder };
}

function looksLikeReportAttempt(raw) {
  const normalized = normalizeTour(stripCommand(raw));
  const firstWord = normalized.split(" ")[0];
  const knownStarts = new Set([
    "PIP", "SHARK", "SEALION", "SL", "AAT", "BELUGA", "PENGUIN", "ALDABRA",
    "KILLERWHALE", "KW", "FAM", "FAMILY", "UAE", "ULTIMATE", "VIP", "DP", "DPO",
  ]);
  return /^!(?:report|r)\b/i.test(raw) || knownStarts.has(firstWord);
}

export function parseReportCommand(text) {
  const raw = cleanInput(text);
  if (!raw) return { kind: "ignore" };
  if (helpRequest(raw)) return { kind: "help" };

  const body = stripCommand(raw);
  const tourMatch = matchTourAtStart(body);

  if (!tourMatch) {
    if (!looksLikeReportAttempt(raw)) return { kind: "ignore" };
    return {
      kind: "error",
      message: `I couldn't match “${raw.slice(0, 60)}”. Try “penguin 245”, “sea lion 1:15”, or send “help”.`,
    };
  }

  const parsedStatus = matchStatus(tourMatch.remainder);
  if (!VALID_STATUSES.has(parsedStatus.status)) {
    return { kind: "error", message: "Use APON, NS, DNS, or describe what happened." };
  }

  if (parsedStatus.status === "ISSUE" && !parsedStatus.note) {
    return { kind: "error", message: "Add a short note after ISSUE so the shift lead knows what happened." };
  }

  return {
    kind: "report",
    slot: tourMatch.slot,
    status: parsedStatus.status,
    note: parsedStatus.note,
    label: REPORT_SLOTS[tourMatch.slot].label,
  };
}

/**
 * Supports one report per line so a guide can paste several completed tours
 * in a single GroupMe message.
 */
export function parseReportMessage(text) {
  const raw = cleanInput(text);
  if (!raw) return { kind: "ignore" };
  if (helpRequest(raw)) return { kind: "help" };

  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 1) return parseReportCommand(lines[0]);

  const reports = [];
  const errors = [];
  for (const line of lines) {
    const parsed = parseReportCommand(line);
    if (parsed.kind === "report") reports.push(parsed);
    else if (parsed.kind === "error") errors.push({ line, message: parsed.message });
  }

  if (reports.length === 0) {
    if (errors.length > 0) return { kind: "error", message: errors[0].message };
    return { kind: "ignore" };
  }

  return { kind: "batch", reports, errors };
}

export function commandHelp() {
  return [
    "Send your tour and time:",
    "",
    "penguin 245",
    "sea lion 1:15",
    "killer whale 245",
    "shark 2:15 ns",
    "beluga 2 guest arrived late",
    "",
    "No status = APON.",
    "You can send several reports, one per line.",
  ].join("\n");
}
