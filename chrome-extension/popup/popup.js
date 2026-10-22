import { getSessions, exportSessionJSON, getSessionsFrame } from '../db.js';

let currentTabId = null;
let isRecording = false;
let currentSessionId = null;

const recordingStatus = document.getElementById('recordingStatus');
const btnToggleRecord = document.getElementById('btnToggleRecord');
const sessionNameInput = document.getElementById('sessionName');
const sessionNameGroup = document.getElementById('sessionNameGroup');
const frameCount = document.getElementById('frameCount');
const liveFeed = document.getElementById('liveFeed');
const sessionSelect = document.getElementById('sessionSelect');

const btnReplay = document.getElementById('btnReplay');
const btnOpenDashboard = document.getElementById('btnOpenDashboard');
const btnExportJSON = document.getElementById('btnExportJSON');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
    await checkRecordingStatus();
  }
  await loadSessionsDropdown();

  // Check if a replay is already running (persists even if popup was closed)
  const replayStatus = await chrome.runtime.sendMessage({ type: 'GET_REPLAY_STATUS' });
  if (replayStatus && replayStatus.isReplayInProgress) {
    btnReplay.disabled = true;
    btnReplay.textContent = 'Replaying...';
  }
});

async function checkRecordingStatus() {
  const response = await chrome.runtime.sendMessage({
    type: 'GET_RECORDING_STATUS',
    tabId: currentTabId
  });

  if (response && response.isRecording && response.sessionId) {
    setRecordingUI(true, response.sessionId);
    const frame = await getSessionsFrame(response.sessionId);
    if (frames && frames.length > 0){
      frameCount.textContent = String(frames.length);
      liveFeed.innerHTML = '';
      const recent = frames.slice(-20).reverse();
      for(const f of recent){
        const badge = document.createElement('div');
        badge.className = `frame-badge ${f.direction.toLowerCase()}`;
        badge.innerHTML = `
          <span><strong>${f.direction}</strong> ${f.stompCommand}</span>
          <span style="color:var(--text-muted);">${f.destination || ''}</span>
        `;
        liveFeed.appendChild(badge);
      }
    }
  } 
  else {
    setRecordingUI(false, null);
  }
}

function setRecordingUI(recording, sessionId) {
  isRecording = recording;
  currentSessionId = sessionId;

  if (recording) {
    recordingStatus.textContent = 'Recording';
    recordingStatus.className = 'status-pill recording';
    btnToggleRecord.textContent = '■ Stop Recording';
    btnToggleRecord.className = 'btn btn-stop';
    sessionNameGroup.style.display = 'none';
  } else {
    recordingStatus.textContent = 'Idle';
    recordingStatus.className = 'status-pill';
    btnToggleRecord.textContent = '● Start Recording';
    btnToggleRecord.className = 'btn btn-rec';
    sessionNameGroup.style.display = 'block';
  }
}

// Toggle Record
btnToggleRecord.addEventListener('click', async () => {
  if (!currentTabId) return;

  if (!isRecording) {
    const sessionName = sessionNameInput.value.trim();
    const res = await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      tabId: currentTabId,
      sessionName
    });

    if (res && res.success) {
      setRecordingUI(true, res.sessionId);
      liveFeed.innerHTML = '';
      frameCount.textContent = '0';
    } else {
      alert('Failed to start recording: ' + (res ? res.error : 'Unknown error'));
    }
  } else {
    const res = await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING',
      tabId: currentTabId
    });

    if (res && res.success) {
      setRecordingUI(false, null);
      await loadSessionsDropdown();
    }
  }
});

// Listen to Live Frame Broadcasts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STOMP_FRAME_INTERCEPTED' && msg.tabId === currentTabId) {
    addLiveFeedFrame(msg.direction, msg.frame);
  }
});

function addLiveFeedFrame(direction, frame) {
  if (liveFeed.querySelector('div[style*="text-align:center"]')) {
    liveFeed.innerHTML = '';
  }

  const currentCount = parseInt(frameCount.textContent || '0', 10) + 1;
  frameCount.textContent = String(currentCount);

  const badge = document.createElement('div');
  badge.className = `frame-badge ${direction.toLowerCase()}`;
  badge.innerHTML = `
    <span><strong>${direction}</strong> ${frame.command}</span>
    <span style="color:var(--text-muted);">${frame.destination || ''}</span>
  `;

  liveFeed.prepend(badge);

  while (liveFeed.children.length > 20) {
    liveFeed.removeChild(liveFeed.lastChild);
  }
}

// Load Recorded Sessions Dropdown
async function loadSessionsDropdown() {
  const sessions = await getSessions();
  sessionSelect.innerHTML = '';

  if (sessions.length === 0) {
    sessionSelect.innerHTML = '<option value="">No recorded sessions</option>';
    btnReplay.disabled = true;
    return;
  }

  btnReplay.disabled = false;
  for (const s of sessions) {
    const dateStr = new Date(s.startTime).toLocaleTimeString();
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `#${s.id} - ${s.name} (${s.frameCount || 0} frames - ${dateStr})`;
    sessionSelect.appendChild(opt);
  }
}

// Replay Button
let isReplaying = false; // Kept only as local guard for double-click within same popup session

btnReplay.addEventListener('click', async () => {
  const sessionId = parseInt(sessionSelect.value, 10);

  if (!sessionId || !currentTabId) return;
  if (isReplaying) return;

  isReplaying = true;
  btnReplay.disabled = true;
  btnReplay.textContent = 'Replaying...';

  try {
    // Fire replay — background runs it async, REPLAY_COMPLETE will signal when done
    const res = await chrome.runtime.sendMessage({
      type: 'REPLAY_SESSION',
      tabId: currentTabId,
      sessionId: sessionId,
      mode: 'CLIENT',
      delayMs: 400
    });

    if (!res || !res.success) {
      // Failed before even starting (e.g. another replay is already running) — reset immediately
      alert('Replay error: ' + (res ? res.error : 'Unknown error'));
      isReplaying = false;
      btnReplay.disabled = false;
      btnReplay.textContent = '► Replay Session';
    }
    // If success: do NOT alert yet — wait for REPLAY_COMPLETE message below
  } catch (err) {
    alert('Replay exception: ' + err.message);
    isReplaying = false;
    btnReplay.disabled = false;
    btnReplay.textContent = '► Replay Session';
  }
});

// Listen to replay completion broadcast from background
// This fires even if popup was closed and reopened during replay
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'REPLAY_COMPLETE') {
    isReplaying = false;
    btnReplay.disabled = false;
    btnReplay.textContent = '► Replay Session';

    if (msg.success) {
      alert(`✅ Replay complete! ${msg.replayedFrames} frame(s) successfully replayed.`);
    } else {
      alert(`⚠️ Replay finished with errors.\nSuccessful: ${msg.replayedFrames}, Failed: ${msg.errorCount}`);
    }
  }
});

// Open Dashboard Options Page
btnOpenDashboard.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Export Session JSON
btnExportJSON.addEventListener('click', async () => {
  const sessionId = parseInt(sessionSelect.value, 10);
  if (!sessionId) {
    alert('Please select a session to export');
    return;
  }

  try {
    const jsonStr = await exportSessionJSON(sessionId);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stomp-session-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Export failed: ' + err.message);
  }
});
