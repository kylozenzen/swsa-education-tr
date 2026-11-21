(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const fileInput = $("#workbook");
  const daySelect = $("#day");
  const yearInput = $("#year");
  const buildButton = $("#build");
  const printButton = $("#print");
  const status = $("#status");
  let workbook = null;
  let currentGrid = null;

  const DAY_RE = /^(MON|TUE|WED|THU|FRI|SAT|SUN)\s+\d{1,2}\.\d{1,2}$/i;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function valueAt(ws, row, col) {
    const cell = ws[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })];
    return cell ? cell.v : null;
  }

  function cellText(value) {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
    if (typeof value === "number" && value >= 0 && value < 1) {
      const minutes = Math.round(value * 1440);
      const h = Math.floor(minutes / 60) % 24;
      const m = minutes % 60;
      return formatClock(h, m);
    }
    return String(value).replace(/\s+/g, " ").trim();
  }

  function formatClock(hour, minute) {
    const suffix = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 || 12;
    return `${h}:${String(minute).padStart(2,"0")} ${suffix}`;
  }

  function parseTime(value) {
    if (value instanceof Date) return value.getHours() * 60 + value.getMinutes();
    if (typeof value === "number" && value >= 0 && value < 1) return Math.round(value * 1440);
    const s = String(value ?? "").trim();
    const match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function columnLetter(n) { return XLSX.utils.encode_col(n - 1); }

  function getTimeColumns(ws) {
    const cols = [];
    const maxCol = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).e.c + 1 : 0;
    const maxRow = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).e.r + 1 : 0;
    for (let col = 1; col <= maxCol; col++) {
      let hits = 0;
      for (let row = 11; row <= Math.min(maxRow, 69); row++) {
        if (parseTime(valueAt(ws, row, col)) !== null) hits++;
      }
      if (hits >= 10) cols.push(col);
    }
    return cols;
  }

  function getDayTitle(ws, sheetName, year) {
    const title = cellText(valueAt(ws, 2, 4));
    const match = sheetName.match(/(\d{1,2})\.(\d{1,2})$/);
    if (match) {
      const month = Number(match[1]) - 1;
      const day = Number(match[2]);
      const date = new Date(year, month, day);
      return { title: title || `${WEEKDAYS[date.getDay()].toUpperCase()} ${MONTHS[month].toUpperCase()} ${day}`, subtitle: `${WEEKDAYS[date.getDay()]}, ${MONTHS[month]} ${day}, ${year}` };
    }
    return { title: title || sheetName, subtitle: String(year) };
  }

  function parseSheet(ws, sheetName, year) {
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
    const maxRow = range.e.r + 1;
    const maxCol = range.e.c + 1;
    const timeColumns = getTimeColumns(ws);
    const timeSet = new Set(timeColumns);
    const employees = [];

    for (let col = 1; col <= maxCol; col++) {
      const name = cellText(valueAt(ws, 9, col));
      if (!name || timeSet.has(col)) continue;
      if (/^(OPEN|MID|CLOSE|PIP|SHARK|INTERP|FEEDER|DP ORIENTATION)$/i.test(name)) continue;

      const timeCol = [...timeColumns].reverse().find(c => c < col);
      if (!timeCol) continue;
      const role = cellText(valueAt(ws, 10, col));
      const entries = [];
      for (let row = 11; row <= Math.min(maxRow, 69); row++) {
        const raw = valueAt(ws, row, col);
        const task = cellText(raw);
        if (!task) continue;
        const timeValue = valueAt(ws, row, timeCol);
        const time = parseTime(timeValue);
        entries.push({
          time: time === null ? "" : formatClock(Math.floor(time / 60) % 24, time % 60),
          start: time,
          row,
          task
        });
      }
      // Only merge adjacent rows with the same assignment. A blank cell,
      // changed assignment, or missing time ends a block.
      const condensed = [];
      for (const entry of entries) {
        const previous = condensed[condensed.length - 1];
        const sameTask = previous && previous.task.toLocaleLowerCase() === entry.task.toLocaleLowerCase();
        const adjacent = previous && entry.row === previous.lastRow + 1;
        const ordered = previous && entry.start !== null && previous.start !== null && entry.start > previous.start;
        if (sameTask && adjacent && ordered) {
          previous.lastRow = entry.row;
          previous.end = entry.start;
        } else {
          condensed.push({ ...entry, lastRow: entry.row, end: null });
        }
      }
      // End time is taken from the following row on the same time axis,
      // not guessed from a fixed slot duration.
      condensed.forEach(block => {
        if (block.start === null) return;
        const next = parseTime(valueAt(ws, block.lastRow + 1, timeCol));
        if (next !== null && next > block.start) block.end = next;
        block.time = block.end !== null
          ? `${formatClock(Math.floor(block.start / 60), block.start % 60)}–${formatClock(Math.floor(block.end / 60), block.end % 60)}`
          : formatClock(Math.floor(block.start / 60), block.start % 60);
      });
      employees.push({ name, role, entries: condensed, column: columnLetter(col) });
    }

    const notes = [];
    for (let row = 70; row <= maxRow; row++) {
      for (let col = 1; col <= maxCol; col++) {
        const value = cellText(valueAt(ws, row, col));
        if (value && !timeSet.has(col)) notes.push(value);
      }
    }

    const metadata = [];
    for (let row = 3; row <= 5; row++) {
      for (let col = 1; col <= Math.min(maxCol, 8); col++) {
        const value = cellText(valueAt(ws, row, col));
        if (value) metadata.push(value);
      }
    }
    const leads = [];
    for (let col = 1; col <= maxCol; col++) {
      const value = cellText(valueAt(ws, 8, col));
      if (value) leads.push(value);
    }
    const day = getDayTitle(ws, sheetName, year);
    return { sheetName, ...day, employees, notes: [...new Set(notes)], metadata, leads };
  }

  function renderGrid(grid) {
    $("#preview-panel").classList.remove("hidden");
    $("#preview-title").textContent = grid.title;
    $("#preview-subtitle").textContent = grid.subtitle;
    $("#people-count").textContent = `${grid.employees.length} STAFF MEMBERS`;
    $("#meta").innerHTML = "";
    [...grid.metadata, ...(grid.leads.length ? [`Leads: ${grid.leads.join(" · ")}`] : [])].forEach(item => {
      const chip = document.createElement("span");
      chip.textContent = item;
      $("#meta").appendChild(chip);
    });

    const people = $("#people");
    people.innerHTML = "";
    const search = $("#staff-search");
    search.value = "";
    const count = $("#search-count");
    function filterStaff() {
      const query = search.value.trim().toLocaleLowerCase();
      let visible = 0;
      people.querySelectorAll(".person").forEach(card => {
        const match = card.dataset.search.includes(query);
        card.hidden = !match;
        if (match) visible++;
      });
      count.textContent = query ? `${visible} of ${grid.employees.length} staff shown` : "Tap a name to view assignments";
      $("#no-results").classList.toggle("hidden", visible !== 0);
    }
    grid.employees.forEach(person => {
      const card = document.createElement("details");
      card.className = "person";
      card.dataset.search = `${person.name} ${person.role || ""}`.toLocaleLowerCase();
      const top = document.createElement("summary");
      top.className = "person-top";
      const name = document.createElement("span");
      name.className = "person-name";
      name.textContent = person.name;
      const right = document.createElement("span");
      right.className = "person-right";
      const role = document.createElement("span");
      role.className = "role";
      role.textContent = person.role || "Education";
      const chevron = document.createElement("span");
      chevron.className = "chevron";
      chevron.textContent = "⌄";
      chevron.setAttribute("aria-hidden", "true");
      right.append(role, chevron);
      top.append(name, right);
      card.appendChild(top);
      const assignments = document.createElement("div");
      assignments.className = "person-assignments";
      if (!person.entries.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No assignments listed.";
        assignments.appendChild(empty);
      } else {
        person.entries.forEach(entry => {
          const row = document.createElement("div");
          row.className = "assignment";
          const time = document.createElement("div");
          time.className = "time";
          time.textContent = entry.time || "—";
          const task = document.createElement("div");
          task.className = "task";
          task.textContent = entry.task;
          row.append(time, task);
          assignments.appendChild(row);
        });
      }
      card.appendChild(assignments);
      people.appendChild(card);
    });
    search.oninput = filterStaff;
    $("#expand-all").onclick = () => people.querySelectorAll(".person:not([hidden])").forEach(card => { card.open = true; });
    $("#collapse-all").onclick = () => people.querySelectorAll(".person").forEach(card => { card.open = false; });
    filterStaff();

    const notes = $("#notes");
    notes.innerHTML = "";
    if (grid.notes.length) {
      notes.classList.remove("hidden");
      const heading = document.createElement("h3");
      heading.textContent = "Shared notes & closing reminders";
      notes.appendChild(heading);
      grid.notes.forEach(line => {
        const item = document.createElement("div");
        item.className = "note-line";
        item.textContent = line;
        notes.appendChild(item);
      });
    } else {
      notes.classList.add("hidden");
    }
    printButton.disabled = grid.employees.length === 0;
  }

  fileInput.addEventListener("change", async () => {
    workbook = null;
    currentGrid = null;
    daySelect.innerHTML = '<option value="">Choose a day</option>';
    daySelect.disabled = true;
    buildButton.disabled = true;
    printButton.disabled = true;
    $("#preview-panel").classList.add("hidden");
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      if (!window.XLSX) throw new Error("The Excel reader did not load. Check your internet connection and refresh.");
      const data = await file.arrayBuffer();
      workbook = XLSX.read(data, { type:"array", cellDates:true });
      const days = workbook.SheetNames.filter(name => DAY_RE.test(name.trim()));
      if (!days.length) throw new Error("No daily tabs found. Expected names like THUR 11.19 or MON 11.23.");
      days.forEach(name => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        daySelect.appendChild(option);
      });
      daySelect.disabled = false;
      buildButton.disabled = false;
      setStatus(`Loaded “${file.name}” · ${days.length} daily tabs found. Choose a day and build the preview.`);
    } catch (error) {
      setStatus(error.message || "Could not read this workbook.", true);
    }
  });

  buildButton.addEventListener("click", () => {
    if (!workbook || !daySelect.value) return;
    try {
      const ws = workbook.Sheets[daySelect.value];
      currentGrid = parseSheet(ws, daySelect.value, Number(yearInput.value) || new Date().getFullYear());
      if (!currentGrid.employees.length) throw new Error("I couldn't identify any employee columns on row 9. Check that this is the expected schedule format.");
      renderGrid(currentGrid);
      setStatus(`Preview ready · ${currentGrid.employees.length} employee columns parsed · no data has been uploaded or posted.`);
    } catch (error) {
      setStatus(error.message || "Could not build this day's preview.", true);
    }
  });

  printButton.addEventListener("click", () => window.print());
})();