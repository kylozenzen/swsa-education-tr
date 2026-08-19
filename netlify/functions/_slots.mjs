const BASE_REPORT_SLOTS = [
  { label: "PIP 10:30AM", name: "PIP", time: "10:30AM", aliases: ["PIP 10:30", "PIP 1030", "PIP 10 30"] },
  { label: "PIP 11:00AM", name: "PIP", time: "11:00AM", aliases: ["PIP 11", "PIP 11:00", "PIP 1100", "PIP 11 00"] },
  { label: "PIP 1:15", name: "PIP", time: "1:15", aliases: ["PIP 1:15", "PIP 115", "PIP 1 15"] },
  { label: "SHARK 11", name: "SHARK", time: "11", aliases: ["SHARK 11", "SHARK 11:00", "SHARK 1100", "SHARK 11 00"] },
  { label: "SHARK 12", name: "SHARK", time: "12", aliases: ["SHARK 12", "SHARK 12:00", "SHARK 1200", "SHARK 12 00"] },
  { label: "SHARK 2:15", name: "SHARK", time: "2:15", aliases: ["SHARK 2:15", "SHARK 215", "SHARK 2 15"] },
  { label: "SHARK 4:00", name: "SHARK", time: "4:00", aliases: ["SHARK 4", "SHARK 4:00", "SHARK 400", "SHARK 4 00"] },
  { label: "SHARK 5:00", name: "SHARK", time: "5:00", aliases: ["SHARK 5", "SHARK 5:00", "SHARK 500", "SHARK 5 00"] },
  { label: "SEALION 1:15", name: "SEALION", time: "1:15", aliases: ["SEALION 1:15", "SEA LION 1:15", "SEALION 115", "SEA LION 115", "SEALION 1 15", "SEA LION 1 15", "SL 1:15", "SL 115"] },
  { label: "AAT 1:30", name: "AAT", time: "1:30", aliases: ["AAT 1:30", "AAT 130", "AAT 1 30"] },
  { label: "BELUGA 2:00", name: "BELUGA", time: "2:00", aliases: ["BELUGA 2", "BELUGA 2:00", "BELUGA 200", "BELUGA 2 00"] },
  { label: "PENGUIN 2:45", name: "PENGUIN", time: "2:45", aliases: ["PENGUIN 2:45", "PENGUIN 245", "PENGUIN 2 45"] },
  { label: "PENGUIN 3:45", name: "PENGUIN", time: "3:45", aliases: ["PENGUIN 3:45", "PENGUIN 345", "PENGUIN 3 45"] },
  { label: "ALDABRA 11:15", name: "ALDABRA", time: "11:15", aliases: ["ALDABRA 11:15", "ALDABRA 1115", "ALDABRA 11 15"] },
  { label: "ALDABRA 2:00", name: "ALDABRA", time: "2:00", aliases: ["ALDABRA 2", "ALDABRA 2:00", "ALDABRA 200", "ALDABRA 2 00"] },
  { label: "ALDABRA 3:30", name: "ALDABRA", time: "3:30", aliases: ["ALDABRA 3:30", "ALDABRA 330", "ALDABRA 3 30"] },
  { label: "KILLER WHALE 2:45", name: "KILLER WHALE", time: "2:45", aliases: ["KILLER WHALE 2:45", "KILLERWHALE 2:45", "KILLER WHALE 245", "KILLERWHALE 245", "KILLER WHALE 2 45", "KILLERWHALE 2 45", "KW 2:45", "KW 245", "KW 2 45"] },
  { label: "KILLER WHALE 4:45", name: "KILLER WHALE", time: "4:45", aliases: ["KILLER WHALE 4:45", "KILLERWHALE 4:45", "KILLER WHALE 445", "KILLERWHALE 445", "KILLER WHALE 4 45", "KILLERWHALE 4 45", "KW 4:45", "KW 445", "KW 4 45"] },
  { label: "Fam", name: "Fam", time: "", aliases: ["FAM", "FAMILY", "FAMILY ADVENTURE", "FAMILY ADVENTURE TOUR"] },
  { label: "UAE", name: "UAE", time: "", aliases: ["UAE", "ULTIMATE ANIMAL EXPERIENCE"] },
  { label: "VIP (tour 1)", name: "VIP", time: "", aliases: ["VIP 1", "VIP TOUR 1", "VIP FIRST"] },
  { label: "VIP (tour 2)", name: "VIP", time: "", aliases: ["VIP 2", "VIP TOUR 2", "VIP SECOND"] },
  { label: "DP ORIENTATION", name: "DP ORIENTATION", time: "", aliases: ["DP ORIENTATION", "DP", "DPO"] },
];

export const REPORT_SLOTS = BASE_REPORT_SLOTS;

export const DEFAULT_TOURS = [
  ...BASE_REPORT_SLOTS.map((slot, legacyIndex) => ({
    id: `legacy-${legacyIndex}`,
    ...slot,
    legacyIndex,
    active: true,
    reportable: true,
  })),
  {
    id: "legacy-23",
    label: "AAT NON OP",
    name: "AAT NON OP",
    time: "",
    aliases: ["ANIMAL ADVENTURE", "ANIMAL ADVENTURE TOUR", "AAT NONOP", "AAT NON-OP"],
    legacyIndex: 23,
    active: true,
    reportable: true,
  },
  {
    id: "legacy-24",
    label: "ALL SWIM NON OP",
    name: "ALL SWIM NON OP",
    time: "",
    aliases: ["ALL SWIM", "ALL-SWIM", "ALLSWIM", "ALL SWIM INTERACTION", "ALL SWIM INTERACTION PROGRAM", "ALL SWIM NONOP", "ALL SWIM NON-OP"],
    legacyIndex: 24,
    active: true,
    reportable: true,
  },
  {
    id: "legacy-25",
    label: "UAE NON OP",
    name: "UAE NON OP",
    time: "",
    aliases: ["UAE NONOP", "UAE NON-OP", "ULTIMATE ANIMAL EXPERIENCE NON OP", "ULTIMATE ANIMAL EXPERIENCE NONOP"],
    legacyIndex: 25,
    active: true,
    reportable: true,
  },
];

export const VALID_STATUSES = new Set(["APON", "NS", "DNS", "ISSUE"]);

/** Fix common phone-keyboard time typos before matching. */
export function cleanInput(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/(\d)\s*[LIl|]\s*(\d{2})(?=\b)/g, "$1:$2")
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

function aliasesFor(slot) {
  const aliases = new Set([slot.label, slot.name, ...(Array.isArray(slot.aliases) ? slot.aliases : [])]);
  if (slot.name && slot.time) aliases.add(`${slot.name} ${slot.time}`);
  for (const alias of [...aliases]) {
    aliases.add(String(alias).replace(/\s*(?:A\.?M\.?|P\.?M\.?)\b/gi, "").trim());
  }
  return [...aliases].filter(Boolean);
}

function runtimeSlots(slots) {
  return (Array.isArray(slots) ? slots : DEFAULT_TOURS)
    .filter((slot) => slot && slot.active !== false && slot.reportable !== false)
    .map((slot, index) => ({
      ...slot,
      id: String(slot.id || `runtime-${index}`),
      label: String(slot.label || `${slot.name || "Tour"}${slot.time ? ` ${slot.time}` : ""}`).trim(),
    }));
}

function buildAliasRecords(slots) {
  const records = [];
  runtimeSlots(slots).forEach((slot) => {
    aliasesFor(slot).forEach((alias) => {
      records.push({ alias, slot, regex: aliasRegex(alias) });
    });
  });
  records.sort((a, b) => b.alias.length - a.alias.length);
  return records;
}

function stripCommand(raw) {
  return raw.replace(/^!(?:report|r)\b\s*/i, "").trim();
}

function helpRequest(raw) {
  return /^(?:!?(?:help|commands?)|!(?:report|r)\s+(?:help|commands?))\s*[?.!]*$/i.test(raw.trim());
}

function matchTourAtStart(body, slots) {
  const cleaned = cleanInput(body);
  for (const record of buildAliasRecords(slots)) {
    const match = cleaned.match(record.regex);
    if (match) {
      const remainder = cleaned.slice(match[0].length).replace(/^\s*[:;,—-]\s*/, "").trim();
      return { slot: record.slot, remainder };
    }
  }
  return null;
}

const APON_PATTERNS = [/^APON\b/i, /^ALL\s+(?:NORMAL|GOOD)\b/i, /^NORMAL\b/i, /^GOOD\b/i, /^FINE\b/i, /^WENT\s+WELL\b/i, /^NO\s+ISSUES?\b/i, /^OPERATIONAL\s+NORMAL\b/i, /^OK(?:AY)?\b/i];
const NS_PATTERNS = [/^NS\b/i, /^NO[-\s]*SHOW\b/i, /^DID\s+NOT\s+SHOW\b/i, /^DIDN['’]?T\s+SHOW\b/i, /^NEVER\s+SHOWED\b/i];
const DNS_PATTERNS = [/^DNS\b/i, /^DID\s+NOT\s+SELL\b/i, /^DIDN['’]?T\s+SELL\b/i, /^NOT\s+SOLD\b/i, /^UNSOLD\b/i];
const ISSUE_PATTERNS = [/^ISSUE\b/i, /^SOMETHING\s+HAPPENED\b/i, /^PROBLEM\b/i];

function matchStatus(remainder) {
  if (!remainder) return { status: "APON", note: "" };
  const groups = [["APON", APON_PATTERNS], ["NS", NS_PATTERNS], ["DNS", DNS_PATTERNS], ["ISSUE", ISSUE_PATTERNS]];
  for (const [status, patterns] of groups) {
    for (const pattern of patterns) {
      const match = remainder.match(pattern);
      if (match) {
        return {
          status,
          note: remainder.slice(match[0].length).replace(/^\s*[:;,—-]\s*/, "").trim(),
        };
      }
    }
  }
  return { status: "ISSUE", note: remainder };
}

function looksLikeReportAttempt(raw, slots) {
  if (/^!(?:report|r)\b/i.test(raw)) return true;
  const firstWord = normalizeTour(stripCommand(raw)).split(" ")[0];
  const knownStarts = new Set(runtimeSlots(slots).flatMap((slot) => aliasesFor(slot).map((alias) => normalizeTour(alias).split(" ")[0])).filter(Boolean));
  return knownStarts.has(firstWord);
}

export function parseReportCommand(text, slots = DEFAULT_TOURS) {
  const raw = cleanInput(text);
  if (!raw) return { kind: "ignore" };
  if (helpRequest(raw)) return { kind: "help" };

  const body = stripCommand(raw);
  const tourMatch = matchTourAtStart(body, slots);
  if (!tourMatch) {
    if (!looksLikeReportAttempt(raw, slots)) return { kind: "ignore" };
    return { kind: "error", message: `I couldn't match “${raw.slice(0, 60)}”. Send “help” for examples.` };
  }

  const parsedStatus = matchStatus(tourMatch.remainder);
  if (!VALID_STATUSES.has(parsedStatus.status)) {
    return { kind: "error", message: "Use APON, NS, DNS, or describe what happened." };
  }
  if (parsedStatus.status === "ISSUE" && !parsedStatus.note) {
    return { kind: "error", message: "Add a short note after ISSUE so the shift lead knows what happened." };
  }

  const slot = tourMatch.slot;
  return {
    kind: "report",
    slotId: slot.id,
    slot: Number.isInteger(slot.legacyIndex) ? slot.legacyIndex : null,
    status: parsedStatus.status,
    note: parsedStatus.note,
    label: slot.label,
  };
}

export function parseReportMessage(text, slots = DEFAULT_TOURS) {
  const raw = cleanInput(text);
  if (!raw) return { kind: "ignore" };
  if (helpRequest(raw)) return { kind: "help" };

  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 1) return parseReportCommand(lines[0], slots);

  const reports = [];
  const errors = [];
  for (const line of lines) {
    const parsed = parseReportCommand(line, slots);
    if (parsed.kind === "report") reports.push(parsed);
    else if (parsed.kind === "error") errors.push({ line, message: parsed.message });
  }

  if (reports.length === 0) {
    if (errors.length > 0) return { kind: "error", message: errors[0].message };
    return { kind: "ignore" };
  }
  return { kind: "batch", reports, errors };
}

export function commandHelp(slots = DEFAULT_TOURS) {
  const examples = runtimeSlots(slots).slice(0, 3).map((slot) => slot.label.toLowerCase());
  return [
    "Send your tour and time:",
    "",
    ...(examples.length ? examples : ["penguin 245", "sea lion 1:15", "killer whale 245"]),
    "",
    "Add NS or DNS when needed, or describe what happened.",
    "No status = APON.",
    "You can send several reports, one per line.",
  ].join("\n");
}
