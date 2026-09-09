import assert from "node:assert/strict";
import test from "node:test";

import { groupSubmissions, normalizeOverride, normalizeOverrides, parseReportMessage, tourFormRequest } from "../netlify/functions/_slots.mjs";

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
