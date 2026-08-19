import { getSessions, getSessionFrames, deleteSession, importSessionJSON } from '../db.js';

let activeSessionId = null;
let currentFrames = [];
let selectedFrameId = null;

const sessionList = document.getElementById('sessionList');
const currentSessionTitle = document.getElementById('currentSessionTitle');
const currentSessionSubtitle = document.getElementById('currentSessionSubtitle');
const frameTableBody = document.getElementById('frameTableBody');
const frameSearch = document.getElementById('frameSearch');
const inspectorContent = document.getElementById('inspectorContent');
const btnDeleteSession = document.getElementById('btnDeleteSession');
const btnImport = document.getElementById('btnImport');
const importFileInput = document.getElementById('importFileInput');

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
  selectedFrameId = null;

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
    return (f.stompCommand && f.stompCommand.toLowerCase().includes(filter)) ||
           (f.destination && f.destination.toLowerCase().includes(filter)) ||
           (f.body && f.body.toLowerCase().includes(filter));
  });

  if (filtered.length === 0) {
    frameTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No matching frames found</td></tr>`;
    return;
  }

  filtered.forEach((f, index) => {
    const tr = document.createElement('tr');
    if (f.id === selectedFrameId) tr.className = 'selected';
    const timeStr = new Date(f.timestamp).toLocaleTimeString();
    const size = (f.body || '').length;

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${timeStr}</td>
      <td><span class="tag ${f.direction.toLowerCase()}">${f.direction}</span></td>
      <td style="font-weight:600; font-family:var(--font-mono);">${f.stompCommand}</td>
      <td style="color:var(--accent-cyan); font-family:var(--font-mono);">${f.destination || '-'}</td>
      <td>${size} B</td>
    `;

    tr.addEventListener('click', () => {
      frameTableBody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      selectedFrameId = f.id;
      inspectFrame(f);
    });

    frameTableBody.appendChild(tr);
  });
}

// Search Filter Input
frameSearch.addEventListener('input', () => {
  renderFrameTable();
});

// Inspect Frame Details
function inspectFrame(frame) {
  let formattedBody = frame.body;
  try {
    const parsed = JSON.parse(frame.body);
    formattedBody = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // String body
  }

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
      <div class="inspector-label">Message Payload</div>
      <pre class="code-block">${escapeHtml(formattedBody)}</pre>
    </div>

    <div class="inspector-section">
      <div class="inspector-label">Raw WebSocket Frame</div>
      <pre class="code-block" style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(frame.rawPayload || '')}</pre>
    </div>
  `;
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
