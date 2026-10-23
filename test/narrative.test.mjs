import assert from "node:assert/strict";
import test from "node:test";

import { mergeNarrative } from "../netlify/functions/_narrative.mjs";

test("a narrative patch keeps answers it does not mention", () => {
  const stored = { 0: "Penguins On Ice", 6: "Two new hires oriented" };
  assert.deepEqual(mergeNarrative(stored, { narrativePatch: { 1: "Smooth day" } }), {
    0: "Penguins On Ice",
    1: "Smooth day",
    6: "Two new hires oriented",
  });
});

test("a patch can clear one answer", () => {
  assert.deepEqual(mergeNarrative({ 0: "x", 1: "y" }, { narrativePatch: { 1: "" } }), { 0: "x", 1: "" });
});

test("a save without narrative keeps what is stored", () => {
  assert.deepEqual(mergeNarrative({ 2: "kept" }, { overrides: {} }), { 2: "kept" });
});

test("a full narrative object still replaces, for older pages", () => {
  assert.deepEqual(mergeNarrative({ 2: "old" }, { narrative: { 3: "new" } }), { 3: "new" });
});

test("patch keys that are not question numbers are ignored", () => {
  assert.deepEqual(mergeNarrative({}, { narrativePatch: { __proto__x: "no", 4: "yes" } }), { 4: "yes" });
});
