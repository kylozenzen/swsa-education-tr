(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const fileInput = $("#workbook");
  const daySelect = $("#day");
  const yearInput = $("#year");
  const buildButton = $("#build");
  const downloadButton = $("#download");
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
          sort: time === null ? row * 10000 : time,
          task
        });
      }
      employees.push({ name, role, entries, column: columnLetter(col) });
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
    grid.employees.forEach(person => {
      const card = document.createElement("article");
      card.className = "person";
      const top = document.createElement("div");
      top.className = "person-top";
      const name = document.createElement("h3");
      name.textContent = person.name;
      const role = document.createElement("div");
      role.className = "role";
      role.textContent = person.role || "Education";
      top.append(name, role);
      card.appendChild(top);
      if (!person.entries.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No assignments listed.";
        card.appendChild(empty);
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
          card.appendChild(row);
        });
      }
      people.appendChild(card);
    });

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
    downloadButton.disabled = grid.employees.length === 0;
    printButton.disabled = grid.employees.length === 0;
  }

  function drawText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text).split(/\s+/);
    let line = "";
    let lines = 0;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines++;
        line = word;
        if (lines >= maxLines - 1) break;
      } else line = test;
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
    return Math.min(lines + 1, maxLines);
  }

  function buildCanvas(grid) {
    const width = 1080;
    const margin = 52;
    const cardGap = 16;
    const cardWidth = width - margin * 2;
    const headerHeight = 220;
    const footerHeight = grid.notes.length ? 80 + grid.notes.length * 42 : 36;
    const heights = grid.employees.map(person => 112 + Math.max(1, person.entries.length) * 48);
    const height = headerHeight + heights.reduce((a,b)=>a+b,0) + cardGap * grid.employees.length + footerHeight + 50;
    if (height > 30000) throw new Error("This day is too long for a single image. Try printing to PDF instead.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f2f5f1";
    ctx.fillRect(0,0,width,height);

    ctx.fillStyle = "#176b56";
    ctx.font = "800 22px Arial";
    ctx.fillText("SEAWORLD SAN ANTONIO  /  EDUCATION", margin, 58);
    ctx.fillStyle = "#132b2b";
    ctx.font = "800 54px Arial";
    ctx.fillText(grid.title, margin, 124);
    ctx.fillStyle = "#647775";
    ctx.font = "600 25px Arial";
    ctx.fillText(grid.subtitle, margin, 166);
    ctx.fillStyle = "#e4f1e9";
    ctx.fillRect(margin, 185, 250, 5);

    let y = headerHeight;
    grid.employees.forEach((person, index) => {
      const cardHeight = heights[index];
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, margin, y, cardWidth, cardHeight, 18);
      ctx.fill();
      ctx.strokeStyle = "#d9e1dc";
      ctx.lineWidth = 2;
      roundRect(ctx, margin, y, cardWidth, cardHeight, 18);
      ctx.stroke();

      ctx.fillStyle = "#132b2b";
      ctx.font = "800 30px Arial";
      ctx.fillText(person.name, margin + 26, y + 43);
      ctx.textAlign = "right";
      ctx.fillStyle = "#176b56";
      ctx.font = "800 18px Arial";
      ctx.fillText(person.role || "EDUCATION", width - margin - 26, y + 40);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#e8eeea";
      ctx.beginPath();
      ctx.moveTo(margin + 24, y + 62);
      ctx.lineTo(width - margin - 24, y + 62);
      ctx.stroke();

      let rowY = y + 96;
      if (!person.entries.length) {
        ctx.fillStyle = "#8a9994";
        ctx.font = "italic 20px Arial";
        ctx.fillText("No assignments listed.", margin + 26, rowY);
      } else {
        person.entries.forEach(entry => {
          ctx.fillStyle = "#425b55";
          ctx.font = "800 19px Arial";
          ctx.fillText(entry.time || "—", margin + 26, rowY);
          ctx.fillStyle = "#1d302d";
          ctx.font = "500 21px Arial";
          const lines = drawText(ctx, entry.task, margin + 170, rowY, cardWidth - 210, 25, 2);
          rowY += Math.max(48, lines * 25 + 12);
        });
      }
      y += cardHeight + cardGap;
    });

    if (grid.notes.length) {
      ctx.fillStyle = "#eee8d5";
      roundRect(ctx, margin, y, cardWidth, footerHeight - 16, 16);
      ctx.fill();
      ctx.fillStyle = "#795b1e";
      ctx.font = "800 20px Arial";
      ctx.fillText("SHARED NOTES & CLOSING REMINDERS", margin + 24, y + 36);
      ctx.fillStyle = "#263632";
      ctx.font = "500 18px Arial";
      let ny = y + 68;
      grid.notes.forEach(note => {
        drawText(ctx, "• " + note, margin + 24, ny, cardWidth - 48, 22, 2);
        ny += 42;
      });
    }
    return canvas;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  async function downloadPng() {
    if (!currentGrid) return;
    downloadButton.disabled = true;
    downloadButton.textContent = "Preparing image…";
    try {
      const canvas = buildCanvas(currentGrid);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The browser could not create the PNG.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `education-grid-${currentGrid.sheetName.toLowerCase().replace(/[^a-z0-9]+/g,"-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus("PNG downloaded to this device. It has not been sent anywhere.");
    } catch (error) {
      setStatus(error.message || "Could not create the image.", true);
    } finally {
      downloadButton.disabled = false;
      downloadButton.textContent = "Download PNG";
    }
  }

  fileInput.addEventListener("change", async () => {
    workbook = null;
    currentGrid = null;
    daySelect.innerHTML = '<option value="">Choose a day</option>';
    daySelect.disabled = true;
    buildButton.disabled = true;
    downloadButton.disabled = true;
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

  downloadButton.addEventListener("click", downloadPng);
  printButton.addEventListener("click", () => window.print());
})();