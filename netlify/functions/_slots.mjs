export const REPORT_SLOTS = [
  { label: "PIP 10:30AM", aliases: ["PIP 10:30", "PIP 1030"] },
  { label: "PIP 11:00AM", aliases: ["PIP 11", "PIP 11:00", "PIP 1100"] },
  { label: "PIP 1:15", aliases: ["PIP 1:15", "PIP 115"] },
  { label: "SHARK 11", aliases: ["SHARK 11", "SHARK 11:00"] },
  { label: "SHARK 12", aliases: ["SHARK 12", "SHARK 12:00"] },
  { label: "SHARK 2:15", aliases: ["SHARK 2:15", "SHARK 215"] },
  { label: "SHARK 4:00", aliases: ["SHARK 4", "SHARK 4:00", "SHARK 400"] },
  { label: "SHARK 5:00", aliases: ["SHARK 5", "SHARK 5:00", "SHARK 500"] },
  { label: "SEALION 1:15", aliases: ["SEALION 1:15", "SEA LION 1:15", "SEALION 115"] },
  { label: "AAT 1:30", aliases: ["AAT 1:30", "AAT 130"] },
  { label: "BELUGA 2:00", aliases: ["BELUGA 2", "BELUGA 2:00", "BELUGA 200"] },
  { label: "PENGUIN 2:45", aliases: ["PENGUIN 2:45", "PENGUIN 245"] },
  { label: "PENGUIN 3:45", aliases: ["PENGUIN 3:45", "PENGUIN 345"] },
  { label: "ALDABRA 11:15", aliases: ["ALDABRA 11:15", "ALDABRA 1115"] },
  { label: "ALDABRA 2:00", aliases: ["ALDABRA 2", "ALDABRA 2:00", "ALDABRA 200"] },
  { label: "ALDABRA 3:30", aliases: ["ALDABRA 3:30", "ALDABRA 330"] },
  { label: "KILLER WHALE 2:45", aliases: ["KILLER WHALE 2:45", "KILLERWHALE 2:45", "KW 2:45", "KW 245"] },
  { label: "KILLER WHALE 4:45", aliases: ["KILLER WHALE 4:45", "KILLERWHALE 4:45", "KW 4:45", "KW 445"] },
  { label: "Fam", aliases: ["FAM", "FAMILY", "FAMILY ADVENTURE"] },
  { label: "UAE", aliases: ["UAE", "ULTIMATE ANIMAL EXPERIENCE"] },
  { label: "VIP (tour 1)", aliases: ["VIP 1", "VIP TOUR 1", "VIP FIRST"] },
  { label: "VIP (tour 2)", aliases: ["VIP 2", "VIP TOUR 2", "VIP SECOND"] },
  { label: "DP ORIENTATION", aliases: ["DP ORIENTATION", "DP", "DPO"] },
];

export const VALID_STATUSES = new Set(["APON", "NS", "DNS", "ISSUE"]);

export function normalizeTour(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\bA\.?M\.?\b/g, "")
    .replace(/\bP\.?M\.?\b/g, "")
    .replace(/SEA\s+LION/g, "SEALION")
    .replace(/KILLER\s+WHALE/g, "KILLERWHALE")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const aliasMap = new Map();
REPORT_SLOTS.forEach((slot, index) => {
  [slot.label, ...slot.aliases].forEach((alias) => {
    aliasMap.set(normalizeTour(alias), index);
  });
});

export function findSlotIndex(value) {
  const normalized = normalizeTour(value);
  return aliasMap.has(normalized) ? aliasMap.get(normalized) : null;
}

export function parseReportCommand(text) {
  const raw = String(text || "").trim();
  const command = raw.match(/^!(?:report|r)\b\s*(.*)$/i);
  if (!command) return { kind: "ignore" };

  const body = command[1].trim();
  if (!body || /^(?:help|commands?)$/i.test(body)) return { kind: "help" };

  const statusMatch = body.match(/\b(DNS|ISSUE|APON|NS)\b/i);
  if (!statusMatch || statusMatch.index === undefined) {
    return { kind: "error", message: "I couldn't find a status. Use APON, NS, DNS, or ISSUE." };
  }

  const tourText = body.slice(0, statusMatch.index).trim();
  const status = statusMatch[1].toUpperCase();
  const note = body.slice(statusMatch.index + statusMatch[0].length).trim();
  const slot = findSlotIndex(tourText);

  if (slot === null) {
    return {
      kind: "error",
      message: `I couldn't match “${tourText || "that"}” to a tour. Try !r help.`,
    };
  }

  if (!VALID_STATUSES.has(status)) {
    return { kind: "error", message: "Use APON, NS, DNS, or ISSUE." };
  }

  if (status === "ISSUE" && !note) {
    return { kind: "error", message: "Add a short note after ISSUE so the shift lead knows what happened." };
  }

  return { kind: "report", slot, status, note, label: REPORT_SLOTS[slot].label };
}

export function commandHelp() {
  return [
    "Tour Report commands",
    "",
    "!r SEALION 1:15 APON",
    "!r PENGUIN 2:45 NS",
    "!r SHARK 2:15 ISSUE Guest became ill near habitat",
    "",
    "Statuses: APON, NS, DNS, ISSUE",
    "For duplicate VIP tours, use VIP 1 or VIP 2.",
  ].join("\n");
}
