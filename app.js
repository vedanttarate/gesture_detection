/*
app.js — CSV preview, selection and POST to FastAPI

Contract / assumptions:
- FastAPI endpoint URL (default): '/predict'
  - You can change `API_URL` below to the full address (e.g. 'http://localhost:8000/predict')
- Request payload: JSON array of row objects:
    [
      {"feature1": value1, "feature2": value2, ...},
      ...
    ]
  Each object's keys must match the model's expected feature names (CSV header is used).
- Expected response: JSON array of prediction objects corresponding to each input row, e.g.:
    [
      {"prediction": "label1", "confidence": 0.87},
      {"prediction": "label2", "confidence": 0.33}
    ]
  The code will display `prediction` property. If different, adapt the mapping in `displayPredictions`.

Usage: open `index.html` in a browser served from a static file server (or just double-click if CORS is not enforced),
upload CSV, select rows, press "Send selected to model".
*/

// Use relative URL since frontend and backend are served from same domain
const API_URL = '/predict';

// Gesture label mapping
const GESTURE_LABELS = {
  0: "Above ear - pull hair",
  1: "Cheek - pinch skin",
  2: "Drink from bottle/cup",
  3: "Eyebrow - pull hair",
  4: "Eyelash - pull hair",
  5: "Feel around in tray and pull out an object",
  6: "Forehead - pull hairline",
  7: "Forehead - scratch",
  8: "Glasses on/off",
  9: "Neck - pinch skin",
  10: "Neck - scratch",
  11: "Pinch knee/leg skin",
  12: "Pull air toward your face",
  13: "Scratch knee/leg skin",
  14: "Text on phone",
  15: "Wave hello",
  16: "Write name in air",
  17: "Write name on leg"
};

const csvInput = document.getElementById('csvFileInput');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const multiToggle = document.getElementById('multiSelectToggle');
const predList = document.getElementById('predList');
const noFile = document.getElementById('noFile');
const rowSelectionInfo = document.getElementById('rowSelectionInfo');

let headers = [];
let rows = []; // array of arrays (strings)
let selectedIndices = new Set();
let allowMulti = false;
let lastClickedIndex = -1; // used for shift-range selection

csvInput.addEventListener('change', handleFileSelect);
multiToggle.addEventListener('change', (e) => {
  allowMulti = e.target.checked;
  // When switching to single-select, keep only the most-recently clicked selection
  if (!allowMulti && selectedIndices.size > 1) {
    // keep lastClickedIndex if present, otherwise keep the first
    const keep = lastClickedIndex >= 0 && selectedIndices.has(lastClickedIndex) ? lastClickedIndex : Array.from(selectedIndices)[0];
    selectedIndices = new Set([keep]);
  }
  // update UI checkboxes / row highlights to reflect current selectedIndices
  updateRowSelectionStyles();
  renderSelectionInfo();
});
sendBtn.addEventListener('click', sendSelectedRows);
clearBtn.addEventListener('click', clearAll);

function handleFileSelect(evt) {
  const file = evt.target.files && evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    parseCSV(text);
    renderTable();
    sendBtn.disabled = true;
    clearBtn.disabled = false;
    predList.innerHTML = '<div class="muted">No predictions yet.</div>';
    noFile.style.display = 'none';
  };
  reader.onerror = () => {
    alert('Failed to read file');
  };
  reader.readAsText(file);
}

/* Very small CSV parser:
   - Assumes newline-separated rows
   - Supports quoted fields with commas inside
   - Trims whitespace around unquoted fields
   - If your CSV is complex, replace with PapaParse
*/
function parseCSV(text) {
  const lines = splitLines(text);
  if (lines.length === 0) {
    headers = [];
    rows = [];
    return;
  }
  headers = parseCSVLine(lines[0]);
  rows = lines.slice(1).map(parseCSVLine);
}

/* Split into lines (handles CRLF and LF) */
function splitLines(text) {
  // Remove trailing empty lines
  return text.split(/\r\n|\n|\r/).filter((l, i, arr) => !(l.trim() === '' && i === arr.length - 1));
}

/* Parse a single CSV line into fields (basic, supports quotes) */
function parseCSVLine(line) {
  const res = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQuotes && line[i+1] === '"') { // escaped quote
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      res.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  res.push(cur);
  return res.map(s => s.trim());
}

function renderTable() {
  // clear
  tableHead.innerHTML = '';
  tableBody.innerHTML = '';
  selectedIndices.clear();

  // header
  const trHead = document.createElement('tr');

  const thSel = document.createElement('th');
  thSel.className = 'checkbox-cell';
  thSel.textContent = ''; // selection column
  trHead.appendChild(thSel);

  const thIndex = document.createElement('th');
  thIndex.className = 'index-col';
  thIndex.textContent = '#';
  trHead.appendChild(thIndex);

  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    trHead.appendChild(th);
  });
  tableHead.appendChild(trHead);

  // body
  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.index = idx;

    const tdSel = document.createElement('td');
    tdSel.className = 'checkbox-cell';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.idx = idx;
  // reflect any prior selection
  cb.checked = selectedIndices.has(idx);
    cb.addEventListener('change', onRowToggle);
    tdSel.appendChild(cb);
    tr.appendChild(tdSel);

    const tdIndex = document.createElement('td');
    tdIndex.className = 'index-col';
    tdIndex.textContent = idx + 1;
    tr.appendChild(tdIndex);

    headers.forEach((h, c) => {
      const td = document.createElement('td');
      td.textContent = row[c] !== undefined ? row[c] : '';
      tr.appendChild(td);
    });

    // click row to toggle selection (good UX)
    tr.addEventListener('click', (e) => {
      // avoid toggling when clicking on checkbox itself (handled)
      if (e.target.tagName.toLowerCase() === 'input') return;
      // handle range selection with Shift when multi-select is enabled
      if (allowMulti && e.shiftKey && lastClickedIndex >= 0) {
        const start = Math.min(lastClickedIndex, idx);
        const end = Math.max(lastClickedIndex, idx);
        for (let i = start; i <= end; i++) {
          const cbx = tableBody.querySelector(`input[data-idx=\"${i}\"]`);
          if (cbx) {
            cbx.checked = true;
            selectedIndices.add(i);
          }
        }
      } else {
        const checkbox = tr.querySelector('input[type="checkbox"]');
        if (!allowMulti) {
          // single select — clear others
          clearSelection();
        }
        checkbox.checked = !checkbox.checked;
        handleIndexSelection(idx, checkbox.checked);
      }
      lastClickedIndex = idx;
      updateRowSelectionStyles();
      renderSelectionInfo();
    });

    tableBody.appendChild(tr);
  });

  renderSelectionInfo();
}

function onRowToggle(e) {
  const idx = Number(e.target.dataset.idx);
  const checked = e.target.checked;
  // If shift-click on checkbox and multi is allowed, perform range selection
  if (allowMulti && e.shiftKey && lastClickedIndex >= 0) {
    const start = Math.min(lastClickedIndex, idx);
    const end = Math.max(lastClickedIndex, idx);
    for (let i = start; i <= end; i++) {
      const cbx = tableBody.querySelector(`input[data-idx=\"${i}\"]`);
      if (cbx) {
        cbx.checked = true;
        selectedIndices.add(i);
      }
    }
  } else {
    if (!allowMulti && checked) {
      // uncheck other boxes
      const boxes = tableBody.querySelectorAll('input[type="checkbox"]');
      boxes.forEach(b => {
        if (Number(b.dataset.idx) !== idx) b.checked = false;
      });
      selectedIndices.clear();
    }
    handleIndexSelection(idx, checked);
  }
  lastClickedIndex = idx;
  updateRowSelectionStyles();
  renderSelectionInfo();
}

function handleIndexSelection(idx, checked) {
  if (checked) selectedIndices.add(idx);
  else selectedIndices.delete(idx);
  // enable send if any selected
  sendBtn.disabled = selectedIndices.size === 0;
}

function updateRowSelectionStyles() {
  // add/remove visual highlight for selected rows
  const rowsEls = tableBody.querySelectorAll('tr');
  rowsEls.forEach(r => {
    const i = Number(r.dataset.index);
    if (selectedIndices.has(i)) r.classList.add('selected-row');
    else r.classList.remove('selected-row');
    const cb = r.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = selectedIndices.has(i);
  });
}

function renderSelectionInfo() {
  if (rows.length === 0) {
    rowSelectionInfo.textContent = '';
    noFile.style.display = 'block';
    return;
  }
  noFile.style.display = 'none';
  if (selectedIndices.size === 0) {
    rowSelectionInfo.textContent = `Select one row${allowMulti ? ' (or multiple)' : ''} to send. Rows loaded: ${rows.length}.`;
  } else {
    const arr = Array.from(selectedIndices).map(i => i + 1);
    rowSelectionInfo.textContent = `Selected ${selectedIndices.size} row(s): ${arr.join(', ')}.`;
  }
}

function clearSelection() {
  selectedIndices.clear();
  const boxes = tableBody.querySelectorAll('input[type="checkbox"]');
  boxes.forEach(b => b.checked = false);
  sendBtn.disabled = true;
}

function clearAll() {
  headers = [];
  rows = [];
  selectedIndices.clear();
  tableHead.innerHTML = '';
  tableBody.innerHTML = '';
  csvInput.value = '';
  sendBtn.disabled = true;
  clearBtn.disabled = true;
  predList.innerHTML = '<div class="muted">No predictions yet.</div>';
  rowSelectionInfo.textContent = '';
  noFile.style.display = 'block';
}

/* Build payload: convert selected row indices into array of objects keyed by headers.
   Convert numeric-looking fields to numbers (best-effort).
*/
function buildPayload() {
  const payload = [];
  const indices = Array.from(selectedIndices).sort((a,b)=>a-b);
  indices.forEach(idx => {
    const row = rows[idx];
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i] === undefined ? '' : row[i];
      obj[h] = maybeNumber(v);
    });
    payload.push(obj);
  });
  return payload;
}

function maybeNumber(v) {
  if (v === '') return null;
  // try integer
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  // float
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  // leave as string
  return v;
}

async function sendSelectedRows() {
  if (selectedIndices.size === 0) return alert('Select at least one row.');
  const payload = buildPayload();

  // UX: disable send button
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      showError(`Server returned ${res.status}: ${text}`);
      return;
    }

    const json = await res.json();
    displayPredictions(json, payload);
  } catch (err) {
    showError('Failed to contact server: ' + err.message);
  } finally {
    sendBtn.disabled = selectedIndices.size === 0;
    sendBtn.textContent = 'Send selected to model';
  }
}

function showError(msg) {
  predList.innerHTML = `<div class="pred-item" style="border-left:4px solid var(--danger)"><div class="label">Error</div><div class="value">${escapeHtml(msg)}</div></div>`;
}

function displayPredictions(predJson, inputs) {
  // predJson should be an array of predictions corresponding to inputs.
  // We'll try to handle both object-array and single object returns.
  predList.innerHTML = '';
  let preds = predJson;
  if (!Array.isArray(preds)) {
    // if the server returned { predictions: [...] } or single obj
    if (predJson && Array.isArray(predJson.predictions)) preds = predJson.predictions;
    else preds = [predJson];
  }

  // show each paired with original row index and text from prediction.prediction (or JSON string)
  const indices = Array.from(selectedIndices).sort((a,b)=>a-b);
  preds.forEach((p, i) => {
    const rowIdx = indices[i] !== undefined ? indices[i] + 1 : (i+1);
    let predText = (p && (p.prediction !== undefined ? p.prediction : JSON.stringify(p)));
    // Convert numeric prediction to gesture label
    if (!isNaN(predText)) {
      const numPred = parseInt(predText);
      predText = GESTURE_LABELS[numPred] || `Unknown gesture (${numPred})`;
    }
    const details = (p && p.confidence !== undefined) ? ` (confidence: ${(p.confidence * 100).toFixed(1)}%)` : '';
    const item = document.createElement('div');
    item.className = 'pred-item';
    item.innerHTML = `<div class="label">Row ${rowIdx}</div><div class="value">${escapeHtml(String(predText))}${details}</div>`;
    predList.appendChild(item);
  });

  // If server returned fewer preds than inputs, warn
  if (preds.length < inputs.length) {
    const note = document.createElement('div');
    note.className = 'muted';
    note.textContent = `Warning: server returned ${preds.length} predictions for ${inputs.length} input rows.`;
    predList.appendChild(note);
  }
}

/* tiny HTML escaper */
function escapeHtml(s){
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function(m){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
  });
}

// initial state
noFile.style.display = 'block';