const copy = value => structuredClone(value);
const comparable = (section, value) => section === "overrides" ? (typeof value === "string" ? value : value?.text || "") : (value || "");
const same = (section, a, b) => comparable(section, a) === comparable(section, b);
const editable = day => ({ narrative: copy(day.narrative || {}), overrides: copy(day.overrides || day.slots || {}) });

// Three-way merge: untouched fields take the saved value; independently edited
// fields survive. Overlapping edits require a deliberate supervisor choice.
export function mergeDay(base, local, remote, preferLocal = false) {
  const merged = editable(remote), conflicts = [];
  for (const section of ["narrative", "overrides"]) {
    for (const key of new Set([...Object.keys(base[section] || {}), ...Object.keys(local[section] || {})])) {
      const old = base[section]?.[key], mine = local[section]?.[key], theirs = merged[section]?.[key];
      if (same(section, old, mine)) continue;
      if (!same(section, old, theirs) && !same(section, mine, theirs)) {
        conflicts.push({ section, key, mine: comparable(section, mine), theirs: comparable(section, theirs) });
      }
      if (preferLocal || same(section, old, theirs) || same(section, mine, theirs)) {
        if (mine === undefined) delete merged[section][key];
        else merged[section][key] = copy(mine);
      }
    }
  }
  return { merged, conflicts };
}

export class DayEditor {
  constructor({ read, write, notify = () => {} }) {
    this.read = read; this.write = write; this.notify = notify;
    this.state = { date: "", narrative: {}, overrides: {}, submissions: [], version: null };
    this.base = editable(this.state); this.dirty = false; this.conflict = null;
    this.saving = null; this.loaded = false; this.generation = 0; this.epoch = 0;
  }
  changed() { this.generation++; this.dirty = true; this.notify("Unsaved changes"); }
  async open(date) {
    if (!(await this.flush())) return false;
    const epoch = ++this.epoch;
    const day = await this.read(date);
    if (epoch !== this.epoch) return false;
    this.state = { ...day, ...editable(day), date };
    this.base = editable(day); this.dirty = false; this.conflict = null; this.loaded = true;
    this.notify("Saved"); return true;
  }
  async refresh() {
    if (!this.loaded) return false;
    const date = this.state.date, epoch = this.epoch, generation = this.generation;
    const day = await this.read(date);
    if (epoch !== this.epoch || date !== this.state.date) return false;
    this.state.submissions = day.submissions || [];
    // Never paint a poll over pending edits or advance their base version.
    if (!this.dirty && !this.saving && generation === this.generation) {
      Object.assign(this.state, editable(day), { version: day.version });
      this.base = editable(day);
      return true;
    }
    return false;
  }
  async flush() {
    while (this.saving) await this.saving;
    if (this.conflict) return false;
    if (!this.dirty) return true;
    this.saving = this.savePending();
    try { return await this.saving; } finally { this.saving = null; }
  }
  async savePending() {
    let retries = 0;
    while (this.dirty) {
      const date = this.state.date, generation = this.generation;
      const snapshot = editable(this.state);
      this.notify("Saving…");
      try {
        const saved = await this.write({ ...snapshot, date, version: this.state.version });
        // Keep changes made while the request was in flight; adopt server
        // correction attribution for everything that was actually saved.
        const next = mergeDay(snapshot, editable(this.state), saved, true).merged;
        Object.assign(this.state, next, { version: saved.version });
        this.base = editable(saved);
        this.dirty = generation !== this.generation;
        this.notify(this.dirty ? "Unsaved changes" : "Saved");
      } catch (error) {
        if (error.status === 409 && retries++ < 3) {
          try {
            const remote = await this.read(date);
            const { merged, conflicts } = mergeDay(this.base, editable(this.state), remote);
            if (conflicts.length) {
              this.conflict = { remote, conflicts };
              this.notify("Conflicting edits — review below"); return false;
            }
            Object.assign(this.state, merged, { version: remote.version });
            this.base = editable(remote);
            continue;
          } catch { /* Keep edits for a later retry. */ }
        }
        this.notify("Not saved — edits kept here. Select Save now to retry.");
        return false;
      }
    }
    return true;
  }
  resolve(useMine) {
    if (!this.conflict) return;
    const remote = this.conflict.remote;
    const local = editable(this.state);
    if (!useMine) {
      // Discard only the displayed conflicting fields, preserving independent edits.
      for (const { section, key } of this.conflict.conflicts) {
        const theirs = editable(remote)[section][key];
        if (theirs === undefined) delete local[section][key]; else local[section][key] = theirs;
      }
    }
    Object.assign(this.state, mergeDay(this.base, local, remote, true).merged, { version: remote.version });
    this.base = editable(remote); this.conflict = null; this.changed();
  }
}
