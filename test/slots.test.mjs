import assert from "node:assert/strict";
import test from "node:test";

import { parseReportMessage, tourFormRequest } from "../netlify/functions/_slots.mjs";

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
