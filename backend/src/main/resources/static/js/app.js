let client = null;
const activeSubscriptions = new Map(); // topic -> subId

// DOM elements
const wsUrlInput = document.getElementById('wsUrl');
const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');

const subTopicInput = document.getElementById('subTopic');
const btnSubscribe = document.getElementById('btnSubscribe');
const subscriptionList = document.getElementById('subscriptionList');

const pubDestinationInput = document.getElementById('pubDestination');
const pubPayloadInput = document.getElementById('pubPayload');
const btnSend = document.getElementById('btnSend');
const feedList = document.getElementById('feedList');
const btnClearLog = document.getElementById('btnClearLog');

// Presets
function applyPreset(preset) {
  if (preset === 'chat') {
    pubDestinationInput.value = '/app/chat';
    pubPayloadInput.value = JSON.stringify({
      sender: 'Alice',
      content: 'Hello STOMP room!',
      type: 'CHAT'
    }, null, 2);
  } else if (preset === 'echo') {
    pubDestinationInput.value = '/app/echo';
    pubPayloadInput.value = JSON.stringify({
      sender: 'Bob',
      content: 'Testing STOMP echo service',
      type: 'ECHO'
    }, null, 2);
  } else if (preset === 'custom') {
    pubDestinationInput.value = '/app/chat';
    pubPayloadInput.value = JSON.stringify({
      event: 'user_action',
      userId: 1042,
      data: { score: 99, status: 'active' }
    }, null, 2);
  }
}

// Connect
btnConnect.addEventListener('click', async () => {
  const url = wsUrlInput.value.trim();
  if (!url) return;

  updateStatus('connecting', 'Connecting...');
  btnConnect.disabled = true;

  client = new SimpleStompClient(url);

  client.onConnect = () => {
    updateStatus('connected', 'Connected');
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    btnSubscribe.disabled = false;
    btnSend.disabled = false;

    // Auto subscribe to default topics /topic/messages and /topic/system-status
    subscribeTopic('/topic/messages');
    subscribeTopic('/topic/system-status');
  };

  client.onDisconnect = () => {
    updateStatus('disconnected', 'Disconnected');
    btnConnect.disabled = false;
    btnDisconnect.disabled = true;
    btnSubscribe.disabled = true;
    btnSend.disabled = true;
    activeSubscriptions.clear();
    renderSubscriptions();
  };

  client.onError = (err) => {
    console.error('STOMP Error:', err);
    updateStatus('disconnected', 'Error');
    btnConnect.disabled = false;
    btnDisconnect.disabled = true;
  };

  client.onFrameLog = (direction, command, headers, body, rawData) => {
    addLogItem(direction, command, headers, body);
  };

  try {
    await client.connect();
  } catch (e) {
    console.error('Failed to connect:', e);
    updateStatus('disconnected', 'Connection Failed');
    btnConnect.disabled = false;
  }
});

// Disconnect
btnDisconnect.addEventListener('click', () => {
  if (client) {
    client.disconnect();
  }
});

// Subscribe
btnSubscribe.addEventListener('click', () => {
  const topic = subTopicInput.value.trim();
  if (topic) {
    subscribeTopic(topic);
  }
});

function subscribeTopic(topic) {
  if (!client || !client.connected || activeSubscriptions.has(topic)) return;

  const subId = client.subscribe(topic, (body, headers) => {
    // Message received callback is logged via onFrameLog
  });

  activeSubscriptions.set(topic, subId);
  renderSubscriptions();
}

function unsubscribeTopic(topic) {
  if (!client || !activeSubscriptions.has(topic)) return;
  const subId = activeSubscriptions.get(topic);
  client.unsubscribe(subId);
  activeSubscriptions.delete(topic);
  renderSubscriptions();
}

function renderSubscriptions() {
  subscriptionList.innerHTML = '';
  if (activeSubscriptions.size === 0) {
    subscriptionList.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">No active subscriptions</div>';
    return;
  }

  for (const [topic, subId] of activeSubscriptions.entries()) {
    const item = document.createElement('div');
    item.className = 'subscription-item';
    item.innerHTML = `
      <span class="subscription-topic">${topic}</span>
      <button class="btn btn-danger" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="unsubscribeTopic('${topic}')">Unsub</button>
    `;
    subscriptionList.appendChild(item);
  }
}

// Send Frame
btnSend.addEventListener('click', () => {
  if (!client || !client.connected) return;
  const dest = pubDestinationInput.value.trim();
  const payloadStr = pubPayloadInput.value.trim();

  if (!dest) return;

  let payload = payloadStr;
  try {
    payload = JSON.parse(payloadStr);
  } catch (e) {
    // Use raw string if not JSON
  }

  client.send(dest, {}, payload);
});

// Clear Log
btnClearLog.addEventListener('click', () => {
  feedList.innerHTML = '';
});

// Helper: Status UI
function updateStatus(state, label) {
  connectionStatus.className = 'status-badge ' + state;
  statusText.textContent = label;
}

// Helper: Add log item to feed
function addLogItem(direction, command, headers, body) {
  // If first item, clear empty placeholder
  if (feedList.querySelector('div[style*="text-align: center"]')) {
    feedList.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = `feed-item ${direction.toLowerCase()}`;

  const timeStr = new Date().toLocaleTimeString();
  const dest = headers.destination || headers.subscription || '';

  let bodyDisplay = body;
  try {
    const parsed = JSON.parse(body);
    bodyDisplay = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // Keep raw string
  }

  item.innerHTML = `
    <div class="feed-meta">
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <span class="feed-tag ${direction.toLowerCase()}">${direction}</span>
        <strong style="color:var(--text-main); font-family:monospace;">${command}</strong>
        ${dest ? `<span style="color:var(--accent-primary); font-family:monospace;">${dest}</span>` : ''}
      </div>
      <span>${timeStr}</span>
    </div>
    ${bodyDisplay ? `<pre class="feed-body">${escapeHtml(bodyDisplay)}</pre>` : ''}
  `;

  feedList.prepend(item);

  // Keep max 50 log items
  while (feedList.children.length > 50) {
    feedList.removeChild(feedList.lastChild);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
}
