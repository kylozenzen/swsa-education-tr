// The shift page sends only the answers that changed (narrativePatch), so two
// supervisors typing in different questions never overwrite each other. A
// plain `narrative` object still replaces the whole set, as older pages expect.
// No narrative at all keeps what is stored.
export function mergeNarrative(stored, input) {
  const base = stored && typeof stored === "object" ? { ...stored } : {};
  if (input && input.narrativePatch && typeof input.narrativePatch === "object") {
    for (const [key, value] of Object.entries(input.narrativePatch)) {
      if (!/^\d{1,2}$/.test(key)) continue;
      base[key] = typeof value === "string" ? value.slice(0, 8000) : "";
    }
    return base;
  }
  if (input && input.narrative && typeof input.narrative === "object") return input.narrative;
  return base;
}
