import { getSessions, getSessionFrames, deleteSession, importSessionJSON, updateFrame } from '../db.js';
import { JsonEditor } from '../components/json-editor.js';

let activeSessionId = null;
let activeSessionObj = null;  // Stores full session object including tabUrl
let currentFrames = [];
let selectedFrameId = null;
let checkedFrameIds = new Set(); // Tracks checkbox-selected frame IDs

const sessionList = document.getElementById('sessionList');
const currentSessionTitle = document.getElementById('currentSessionTitle');
const currentSessionSubtitle = document.getElementById('currentSessionSubtitle');
const frameTableBody = document.getElementById('frameTableBody');
const frameSearch = document.getElementById('frameSearch');
const inspectorContent = document.getElementById('inspectorContent');
const btnDeleteSession = document.getElementById('btnDeleteSession');
const btnImport = document.getElementById('btnImport');
const importFileInput = document.getElementById('importFileInput');
const btnReplaySelected = document.getElementById('btnReplaySelected');
const selectAllFrames = document.getElementById('selectAllFrames');

document.addEventListener('DOMContentLoaded', async () => {
  await renderSessionsList();
});

// Render Sessions List in Sidebar
async function renderSessionsList() {
  const sessions = await getSessions();
  sessionList.innerHTML = '';

  if (sessions.length === 0) {
    sessionList.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:1rem; font-size:0.85rem;">No recorded sessions in Dexie DB</div>';
    currentSessionTitle.textContent = 'No Sessions';
    currentSessionSubtitle.textContent = '';
    frameTableBody.innerHTML = '';
    inspectorContent.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:2rem; font-size:0.85rem;">Select a frame from the table to inspect</div>';
    return;
  }

  for (const s of sessions) {
    const card = document.createElement('div');
    card.className = `session-card ${s.id === activeSessionId ? 'active' : ''}`;
    const timeStr = new Date(s.startTime).toLocaleString();

    card.innerHTML = `
      <div class="session-name">#${s.id} ${escapeHtml(s.name)}</div>
      <div class="session-meta">
        <span>${s.frameCount || 0} frames</span>
        <span>${timeStr}</span>
      </div>
    `;

    card.addEventListener('click', () => selectSession(s.id, s));
    sessionList.appendChild(card);
  }

  // Select first session if none selected
  if (!activeSessionId && sessions.length > 0) {
    selectSession(sessions[0].id, sessions[0]);
  }
}

// Select Session
async function selectSession(sessionId, sessionObj) {
  activeSessionId = sessionId;
  activeSessionObj = sessionObj;  // Keep reference for replay tab matching
  selectedFrameId = null;
  checkedFrameIds.clear();
  updateReplaySelectedBtn();

  // Highlight active session card
  const cards = sessionList.querySelectorAll('.session-card');
  cards.forEach(c => c.classList.remove('active'));

  await renderSessionsListUIOnly();

  currentSessionTitle.textContent = `#${sessionId} - ${sessionObj.name}`;
  currentSessionSubtitle.textContent = `Url: ${sessionObj.tabUrl || 'N/A'} | Frames: ${sessionObj.frameCount || 0}`;

  currentFrames = await getSessionFrames(sessionId);
  renderFrameTable();
  inspectorContent.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:2rem; font-size:0.85rem;">Select a frame from the table to inspect</div>';
}

async function renderSessionsListUIOnly() {
  const cards = sessionList.querySelectorAll('.session-card');
  cards.forEach((card, idx) => {
    if (card.querySelector('.session-name').textContent.startsWith(`#${activeSessionId} `)) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
}

// Render Table
function renderFrameTable() {
  frameTableBody.innerHTML = '';
  const filter = frameSearch.value.trim().toLowerCase();

  const filtered = currentFrames.filter(f => {
    if (!filter) return true;
    // Filter only by destination
    return (f.destination && f.destination.toLowerCase().includes(filter));
  });

  // Sync select-all checkbox state
  if (selectAllFrames) {
    const allChecked = filtered.length > 0 && filtered.every(f => checkedFrameIds.has(f.id));
    selectAllFrames.checked = allChecked;
    selectAllFrames.indeterminate = !allChecked && filtered.some(f => checkedFrameIds.has(f.id));
  }

  if (filtered.length === 0) {
    frameTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No matching frames found</td></tr>`;
    return;
  }

  filtered.forEach((f, index) => {
    const tr = document.createElement('tr');
    if (f.id === selectedFrameId) tr.className = 'selected';
    const timeStr = new Date(f.timestamp).toLocaleTimeString();
    const size = (f.body || '').length;
    const isChecked = checkedFrameIds.has(f.id);

    // Checkbox cell
    const tdCheck = document.createElement('td');
    tdCheck.style.width = '36px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'frame-checkbox';
    checkbox.checked = isChecked;
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        checkedFrameIds.add(f.id);
      } else {
        checkedFrameIds.delete(f.id);
      }
      updateReplaySelectedBtn();
      // Sync select-all
      const allBoxes = frameTableBody.querySelectorAll('.frame-checkbox');
      const allChecked2 = allBoxes.length > 0 && [...allBoxes].every(cb => cb.checked);
      selectAllFrames.checked = allChecked2;
      selectAllFrames.indeterminate = !allChecked2 && [...allBoxes].some(cb => cb.checked);
    });
    tdCheck.appendChild(checkbox);
    tr.appendChild(tdCheck);

    // Remaining cells via innerHTML
    const dataHtml = `
      <td>${index + 1}</td>
      <td>${timeStr}</td>
      <td><span class="tag ${f.direction.toLowerCase()}">${f.direction}</span></td>
      <td style="font-weight:600; font-family:var(--font-mono);">${f.stompCommand}</td>
      <td style="color:var(--accent-cyan); font-family:var(--font-mono);">${f.destination || '-'}</td>
      <td>${size} B</td>
    `;
    const temp = document.createElement('tbody');
    temp.innerHTML = `<tr>${dataHtml}</tr>`;
    const dataCells = temp.querySelector('tr').querySelectorAll('td');
    dataCells.forEach(cell => tr.appendChild(cell));

    tr.addEventListener('click', (e) => {
      if (e.target === checkbox || e.target === tdCheck) return;
      frameTableBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      selectedFrameId = f.id;
      inspectFrame(f);
    });

    frameTableBody.appendChild(tr);
  });
}

function updateReplaySelectedBtn() {
  btnReplaySelected.disabled = checkedFrameIds.size === 0;
}

// Search Filter Input
frameSearch.addEventListener('input', () => {
  renderFrameTable();
});

// Select All Frames toggle
selectAllFrames.addEventListener('change', () => {
  const filter = frameSearch.value.trim().toLowerCase();
  const filtered = currentFrames.filter(f =>
    !filter || (f.destination && f.destination.toLowerCase().includes(filter))
  );
  if (selectAllFrames.checked) {
    filtered.forEach(f => checkedFrameIds.add(f.id));
  } else {
    filtered.forEach(f => checkedFrameIds.delete(f.id));
  }
  updateReplaySelectedBtn();
  renderFrameTable();
});

// Replay Selected Frames (with timing)
btnReplaySelected.addEventListener('click', async () => {
  if (checkedFrameIds.size === 0) return;

  // Resolve target tab
  const allTabs = await chrome.tabs.query({});
  const webTabs = allTabs.filter(t =>
    t.url &&
    !t.url.startsWith('chrome-extension://') &&
    !t.url.startsWith('chrome://') &&
    !t.url.startsWith('about:')
  );

  let targetTab = null;
  if (activeSessionObj && activeSessionObj.tabUrl) {
    try {
      const sessionOrigin = new URL(activeSessionObj.tabUrl).origin;
      targetTab = webTabs.find(t => {
        try { return new URL(t.url).origin === sessionOrigin; }
        catch { return false; }
      });
    } catch (_) { }
  }
  if (!targetTab) targetTab = webTabs[0];

  if (!targetTab) {
    alert('No suitable web page tab found.\n\nOpen the test page in another tab, connect to STOMP, then retry.');
    return;
  }

  // Collect selected frames sorted by original timestamp
  const filter = frameSearch.value.trim().toLowerCase();
  const filtered = currentFrames.filter(f =>
    !filter || (f.destination && f.destination.toLowerCase().includes(filter))
  );
  const selected = filtered
    .filter(f => checkedFrameIds.has(f.id))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (selected.length === 0) return;

  btnReplaySelected.disabled = true;
  btnReplaySelected.textContent = `⏳ Replaying 0/${selected.length}…`;

  let prevTimestamp = selected[0].timestamp;

  for (let i = 0; i < selected.length; i++) {
    const f = selected[i];
    const delay = i === 0 ? 0 : (f.timestamp - prevTimestamp);
    prevTimestamp = f.timestamp;

    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const mode = f.direction === 'RECEIVED' ? 'SERVER_MOCK' : 'CLIENT';
    try {
      await chrome.runtime.sendMessage({
        type: 'REPLAY_SINGLE_FRAME',
        tabId: targetTab.id,
        frame: f,
        mode: mode
      });
    } catch (err) {
      console.error('Replay error for frame', f.id, err);
    }

    btnReplaySelected.textContent = `⏳ Replaying ${i + 1}/${selected.length}…`;
  }

  btnReplaySelected.textContent = '▶ Replay Selected';
  btnReplaySelected.disabled = checkedFrameIds.size === 0;
  alert(`Replayed ${selected.length} frame(s) with original timing.`);
});

// Inspect Frame Details
let currentJsonEditor = null;

function inspectFrame(frame) {
  const headersJson = JSON.stringify(frame.headers || {}, null, 2);

  inspectorContent.innerHTML = `
    <div class="inspector-section">
      <div class="inspector-label">Command & Direction</div>
      <div style="display:flex; gap:0.5rem; align-items:center;">
        <span class="tag ${frame.direction.toLowerCase()}">${frame.direction}</span>
        <strong style="font-size:1.1rem; font-family:var(--font-mono);">${frame.stompCommand}</strong>
      </div>
    </div>

    <div class="inspector-section">
      <div class="inspector-label">Destination</div>
      <div style="font-family:var(--font-mono); color:var(--accent-cyan); font-weight:600;">
        ${frame.destination || 'N/A'}
      </div>
    </div>

    <div class="inspector-section">
      <div class="inspector-label">STOMP Headers</div>
      <pre class="code-block">${escapeHtml(headersJson)}</pre>
    </div>

    <div class="inspector-section">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
        <div class="inspector-label">Message Payload (JSON Editor)</div>
        <div style="display:flex; gap:0.4rem;">
          <button id="btnSavePayload" class="btn btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.75rem;">💾 Save</button>
          <button id="btnReplayFrame" class="btn btn-cyan" style="padding:0.25rem 0.5rem; font-size:0.75rem;">► Replay Frame</button>
        </div>
      </div>
      <div id="jsonEditorContainer"></div>
    </div>

    <div class="inspector-section" style="margin-top:0.5rem;">
      <div class="inspector-label">Raw WebSocket Frame</div>
      <pre class="code-block" style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(frame.rawPayload || '')}</pre>
    </div>
  `;

  const container = document.getElementById('jsonEditorContainer');
  let editedBody = frame.body;

  currentJsonEditor = new JsonEditor(container, {
    initialValue: frame.body,
    onChange: (newValue) => {
      editedBody = newValue;
    }
  });

  // Handle Save Payload
  const btnSavePayload = document.getElementById('btnSavePayload');
  btnSavePayload.addEventListener('click', async () => {
    try {
      await updateFrame(frame.id, editedBody);
      frame.body = editedBody;
      alert('Payload saved successfully to database!');
      currentFrames = await getSessionFrames(activeSessionId);
      renderFrameTable();
    } catch (err) {
      alert('Failed to save payload: ' + err.message);
    }
  });

  // Handle Single Frame Replay
  const btnReplayFrame = document.getElementById('btnReplayFrame');
  btnReplayFrame.addEventListener('click', async () => {
    // Try to find the tab where the session was originally recorded (match by origin)
    const allTabs = await chrome.tabs.query({});
    const webTabs = allTabs.filter(t =>
      t.url &&
      !t.url.startsWith('chrome-extension://') &&
      !t.url.startsWith('chrome://') &&
      !t.url.startsWith('about:')
    );

    let targetTab = null;

    // 1. Try to match session's recorded tabUrl by origin (e.g. http://localhost:8080)
    if (activeSessionObj && activeSessionObj.tabUrl) {
      try {
        const sessionOrigin = new URL(activeSessionObj.tabUrl).origin;
        targetTab = webTabs.find(t => {
          try { return new URL(t.url).origin === sessionOrigin; }
          catch { return false; }
        });
      } catch (_) { }
    }

    // 2. Fallback: use the first available web tab
    if (!targetTab) {
      targetTab = webTabs[0];
    }

    if (!targetTab) {
      alert('No suitable web page tab found.\n\nOpen the test page (e.g. http://localhost:8080) in another tab, connect to STOMP, then retry.');
      return;
    }

    try {
      const updatedFrame = { ...frame, body: editedBody };
      const mode = frame.direction === 'RECEIVED' ? 'SERVER_MOCK' : 'CLIENT';
      const res = await chrome.runtime.sendMessage({
        type: 'REPLAY_SINGLE_FRAME',
        tabId: targetTab.id,
        frame: updatedFrame,
        mode: mode
      });

      if (res && res.success) {
        alert(`Successfully replayed ${frame.stompCommand} frame to tab: ${targetTab.url}`);
      } else {
        alert('Replay failed: ' + (res ? res.error : 'Unknown error'));
      }
    } catch (err) {
      alert('Replay exception: ' + err.message);
    }
  });

}

// Delete Active Session
btnDeleteSession.addEventListener('click', async () => {
  if (!activeSessionId) return;
  if (confirm(`Are you sure you want to delete session #${activeSessionId}?`)) {
    await deleteSession(activeSessionId);
    activeSessionId = null;
    await renderSessionsList();
  }
});

// Import Session JSON
btnImport.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const newId = await importSessionJSON(evt.target.result);
      alert(`Imported session successfully as #${newId}`);
      activeSessionId = newId;
      await renderSessionsList();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
