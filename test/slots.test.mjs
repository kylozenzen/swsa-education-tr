import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TOURS, commandHelp, extractLeader, groupSubmissions, isVipTour, normalizeOverride, normalizeOverrides, parseReportMessage, pickVipSlot, tourFormRequest } from "../netlify/functions/_slots.mjs";

const tourFormCommands = [
  "tour form",
  "tourform",
  "tour report form",
  "report form",
  "private tour form",
  "tour form!",
  "Tour Form",
];

for (const command of tourFormCommands) {
  test(`recognizes ${JSON.stringify(command)} as a form request, not a submission`, () => {
    assert.equal(tourFormRequest(command), true);
    assert.deepEqual(parseReportMessage(command), { kind: "tour-form" });
  });
}

test("keeps penguin 245 in the normal report flow", () => {
  const parsed = parseReportMessage("penguin 245");

  assert.equal(parsed.kind, "report");
  assert.equal(parsed.status, "APON");
  assert.match(parsed.label, /penguin/i);
});

// APON is matched anywhere in the remainder, so "all apon" and the usual
// misspellings stop falling through to ISSUE.
const aponPhrasings = [
  "penguin 245 apon",
  "penguin 245 all apon",
  "penguin 245 was apon",
  "penguin 245 everything apon",
  "penguin 245 all normal",
  "penguin 245 everything operational normal",
  "penguin 245 no issues",
  "penguin 245 the tour was all normal",
  "penguin 245 aopn",
  "penguin 245 a-pon",
  "penguin 245 apon.",
  "penguin 245 all aopn!",
];

for (const message of aponPhrasings) {
  test(`reads ${JSON.stringify(message)} as APON with no note`, () => {
    const parsed = parseReportMessage(message);

    assert.equal(parsed.kind, "report");
    assert.equal(parsed.status, "APON");
    assert.equal(parsed.note, "");
  });
}

test("keeps the note on an APON report that carries one", () => {
  const parsed = parseReportMessage("penguin 245 apon. guest was late to the gate");

  assert.equal(parsed.status, "APON");
  assert.equal(parsed.note, "guest was late to the gate");
});

// NS, DNS and ISSUE stay anchored to the start of the remainder. A marker in
// the middle of a sentence must never quietly reclassify a report.
const notLoosened = [
  ["penguin 245 guest fell and the second party was a no show", "ISSUE"],
  ["penguin 245 the boat had issues and seats were unsold", "ISSUE"],
  ["penguin 245 guest asked why we did not sell the late tour", "ISSUE"],
];

for (const [message, status] of notLoosened) {
  test(`does not reclassify ${JSON.stringify(message)}`, () => {
    const parsed = parseReportMessage(message);

    assert.equal(parsed.kind, "report");
    assert.equal(parsed.status, status);
    assert.match(parsed.note, /guest|boat/);
  });
}

test("an APON marker does not outrank a no show in the same sentence", () => {
  const parsed = parseReportMessage("penguin 245 all apon but the second guest was a no show");

  assert.equal(parsed.status, "ISSUE");
  assert.equal(parsed.note, "all apon but the second guest was a no show");
});

test("still recognizes NS, DNS and ISSUE at the start of the remainder", () => {
  assert.equal(parseReportMessage("penguin 245 ns").status, "NS");
  assert.equal(parseReportMessage("penguin 245 no show").status, "NS");
  assert.equal(parseReportMessage("penguin 245 dns").status, "DNS");
  assert.equal(parseReportMessage("penguin 245 unsold").status, "DNS");
  assert.equal(parseReportMessage("penguin 245 issue ramp jammed").status, "ISSUE");
});

// Supervisor corrections used to be a bare string per slot.
test("reads a correction stored as a plain string", () => {
  assert.deepEqual(normalizeOverride("NS confirmed"), { text: "NS confirmed", who: null, at: null });
});

test("reads a correction stored with attribution", () => {
  assert.deepEqual(
    normalizeOverride({ text: "NS confirmed", who: "Dana", at: "2026-09-09T21:20:00.000Z" }),
    { text: "NS confirmed", who: "Dana", at: "2026-09-09T21:20:00.000Z" }
  );
});

test("drops empty corrections and keeps mixed shapes side by side", () => {
  assert.deepEqual(
    normalizeOverrides({
      "legacy-3": "NS confirmed",
      "legacy-12": { text: "ISSUE — ramp jammed", who: "Dana", at: "2026-09-09T21:20:00.000Z" },
      "legacy-1": "   ",
      "legacy-2": { text: "" },
      "legacy-4": null,
    }),
    {
      "legacy-3": { text: "NS confirmed", who: null, at: null },
      "legacy-12": { text: "ISSUE — ramp jammed", who: "Dana", at: "2026-09-09T21:20:00.000Z" },
    }
  );
});

test("normalizes a missing or unusable override map to nothing", () => {
  assert.deepEqual(normalizeOverrides(undefined), {});
  assert.equal(normalizeOverride(undefined), null);
});

// A guide report and a later supervisor entry are one tour, not two reports.
test("groups a guide report and a supervisor entry under one tour", () => {
  const submissions = [
    { id: "1", slotId: "legacy-12", slot: 12, status: "APON", note: "", who: "Arthur", source: "groupme", createdAt: "2026-09-09T19:50:00.000Z" },
    { id: "2", slotId: null, slot: 3, status: "NS", note: "", who: "Bo", source: "web", createdAt: "2026-09-09T20:10:00.000Z" },
    { id: "3", slotId: "legacy-12", slot: 12, status: "ISSUE", note: "ramp jammed", who: "Dana", source: "shift-manual", createdAt: "2026-09-09T21:05:00.000Z" },
  ];

  const groups = groupSubmissions(submissions);

  assert.equal(groups.length, 2);

  const penguin = groups[0];
  assert.equal(penguin.key, "legacy-12");
  assert.match(penguin.label, /penguin/i);
  assert.deepEqual(penguin.entries.map((entry) => entry.id), ["1", "3"]);
  assert.deepEqual(penguin.entries.map((entry) => entry.source), ["groupme", "shift-manual"]);

  // Resolved by legacy slot index, with no slot id of its own.
  const shark = groups[1];
  assert.match(shark.label, /shark/i);
  assert.deepEqual(shark.entries.map((entry) => entry.id), ["2"]);
});

test("keeps an unknown tour out of the resolved groups instead of merging it", () => {
  const groups = groupSubmissions([
    { id: "1", slotId: "custom-gone", slot: null, status: "APON", note: "", source: "groupme", createdAt: "2026-09-09T19:50:00.000Z" },
    { id: "2", slotId: "custom-gone", slot: null, status: "NS", note: "", source: "web", createdAt: "2026-09-09T20:50:00.000Z" },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "custom-gone");
  assert.equal(groups[0].tour, null);
  assert.equal(groups[0].entries.length, 2);
});

// --- VIP leader -------------------------------------------------------------
// VIP tours have no time, so guides send "VIP <name>" and the name is who led it.

const vipCases = [
  ["vip sarah", "sarah", "APON", ""],
  ["VIP Sarah apon", "Sarah", "APON", ""],
  ["VIP (Sarah Jones)", "Sarah Jones", "APON", ""],
  ["VIP (Sarah Jones) ns", "Sarah Jones", "NS", ""],
  ["vip - marcus dns", "marcus", "DNS", ""],
  ["vip led by Marcus guest was 20 min late", "Marcus", "ISSUE", "guest was 20 min late"],
  ["VIP Dana: apon. guests loved the sloths", "Dana", "APON", "guests loved the sloths"],
  ["vip apon", "", "APON", ""],
  ["vip ns", "", "NS", ""],
];

for (const [message, leader, status, note] of vipCases) {
  test(`reads ${JSON.stringify(message)} as a VIP led by ${JSON.stringify(leader)}`, () => {
    const parsed = parseReportMessage(message);

    assert.equal(parsed.kind, "report");
    assert.equal(parsed.vip, true);
    assert.equal(parsed.autoSlot, true);
    assert.equal(parsed.leader, leader);
    assert.equal(parsed.status, status);
    assert.equal(parsed.note, note);
  });
}

test("VIP 2 still pins the second VIP slot and keeps the leader", () => {
  const parsed = parseReportMessage("vip 2 sarah apon");

  assert.equal(parsed.label, "VIP (tour 2)");
  assert.equal(parsed.autoSlot, false);
  assert.equal(parsed.leader, "sarah");
  assert.equal(parsed.status, "APON");
});

test("non-VIP tours never grow a leader", () => {
  const parsed = parseReportMessage("penguin 245 sarah was great");

  assert.equal(parsed.vip, undefined);
  assert.equal(parsed.leader, undefined);
  assert.equal(parsed.note, "sarah was great");
});

test("extractLeader leaves a status-only remainder alone", () => {
  assert.deepEqual(extractLeader("no show"), { leader: "", rest: "no show" });
  assert.deepEqual(extractLeader("(Ana) apon"), { leader: "Ana", rest: "apon" });
});

test("pickVipSlot fills open VIP slots in order and keeps a leader on their slot", () => {
  const vips = DEFAULT_TOURS.filter(isVipTour);
  assert.equal(vips.length, 2);
  const [first, second] = vips;

  assert.equal(pickVipSlot(vips, [], "Sarah").id, first.id);

  const sarahOnFirst = [{ slotId: first.id, slot: first.legacyIndex, leader: "Sarah" }];
  assert.equal(pickVipSlot(vips, sarahOnFirst, "Marcus").id, second.id);
  assert.equal(pickVipSlot(vips, sarahOnFirst, "sarah").id, first.id, "a follow-up from the same leader stays on their tour");

  const bothTaken = [...sarahOnFirst, { slotId: second.id, slot: second.legacyIndex, leader: "Marcus" }];
  assert.equal(pickVipSlot(vips, bothTaken, "Marcus").id, second.id);
  assert.equal(pickVipSlot(vips, bothTaken, "Dana").id, second.id);
});

test("help mentions how to report a VIP leader", () => {
  assert.match(commandHelp(), /vip sarah/i);
});

// --- Orientation summary ----------------------------------------------------
// "Orientation" once, then the whole day: times and tour names stay in the note.

test("a multi-line orientation summary is one report, not a batch of tours", () => {
  const parsed = parseReportMessage([
    "Orientation",
    "10:30 sea lion 1:15 meet & greet - 12 DPs",
    "penguin 2:45 great group",
    "1:15 shark ns",
  ].join("\n"));

  assert.equal(parsed.kind, "report");
  assert.equal(parsed.orientation, true);
  assert.equal(parsed.label, "DP ORIENTATION");
  assert.equal(parsed.status, "APON");
  assert.equal(parsed.note, "10:30 sea lion 1:15 meet & greet - 12 DPs\npenguin 2:45 great group\n1:15 shark ns");
});

for (const start of ["orientation", "Orientation:", "DP orientation", "dp orientation -", "DPO", "orientations"]) {
  test(`${JSON.stringify(start)} starts an orientation summary`, () => {
    const parsed = parseReportMessage(`${start} 9:00 welcome, 11:15 aldabra feed`);

    assert.equal(parsed.orientation, true);
    assert.equal(parsed.status, "APON");
    assert.equal(parsed.note, "9:00 welcome, 11:15 aldabra feed");
  });
}

test("a free-text orientation summary is APON, not an issue", () => {
  const parsed = parseReportMessage("orientation\ngroup was quiet, ran 10 min long at 2:00");
  assert.equal(parsed.status, "APON");
});

test("orientation can still be a no show or did not sell", () => {
  assert.equal(parseReportMessage("orientation ns").status, "NS");
  assert.equal(parseReportMessage("orientation dns").status, "DNS");
  assert.equal(parseReportMessage("orientation apon").note, "");
});

test("tours reported above an orientation line still file on their own", () => {
  const parsed = parseReportMessage("penguin 245 apon\norientation\n10:30 penguin meet\n2:00 beluga");

  assert.equal(parsed.kind, "batch");
  assert.equal(parsed.reports.length, 2);
  assert.match(parsed.reports[0].label, /penguin/i);
  assert.equal(parsed.reports[1].orientation, true);
  assert.equal(parsed.reports[1].note, "10:30 penguin meet\n2:00 beluga");
});

test("help explains orientation", () => {
  assert.match(commandHelp(), /orientation/i);
});

// --- Questions --------------------------------------------------------------
// Asking about a tour must never file a report.

const questions = [
  "penguin 2:45 is that still on?",
  "Question about penguin 2:45 ahsjhdsfajfksdjfbgksjdf",
  "question - sea lion 1:15 how many guests",
  "q: shark 11 who has it",
  "? killer whale 4:45 moved",
  "vip sarah did they want lunch?",
  "orientation still at 10?",
  "does anyone know if beluga 2 is running",
  "shark 12 anyone covering?? ",
];

for (const message of questions) {
  test(`does not file ${JSON.stringify(message)}`, () => {
    assert.equal(parseReportMessage(message).kind, "ignore");
  });
}

test("a question line in a batch is skipped and the reports still file", () => {
  const parsed = parseReportMessage("penguin 245 apon\nshark 12 is that one ours?\nsea lion 1:15 ns");

  assert.equal(parsed.kind, "batch");
  assert.deepEqual(parsed.reports.map((r) => r.status), ["APON", "NS"]);
  assert.equal(parsed.errors.length, 0);
});

test("a message that opens with question is ignored top to bottom", () => {
  assert.equal(parseReportMessage("question\npenguin 245 apon").kind, "ignore");
});

test("help still answers with a question mark", () => {
  assert.equal(parseReportMessage("help?").kind, "help");
});

test("an orientation summary can contain a question line", () => {
  const parsed = parseReportMessage("orientation\n10:30 penguin meet\nwho restocks the lanyards?");
  assert.equal(parsed.orientation, true);
  assert.match(parsed.note, /lanyards\?$/);
});
