# STOMP WebSocket Chrome Interceptor & Replay Extension

## Overview
This Chrome Extension (Manifest V3) intercepts STOMP protocol messages transmitted over WebSockets between web frontends and Spring Boot backends. It utilizes the **Chrome DevTools Protocol (`chrome.debugger` API)** to capture low-level raw WebSocket frames, parses STOMP commands, headers, and payloads, and stores recorded sessions inside **Dexie.js (IndexedDB)**.

This extension is built for QA automation, intern testing, recording client/server interaction flows, and replaying recorded STOMP sequences.

---

## 🏗️ Architecture & Component Guide

```
chrome-extension/
├── manifest.json            # MV3 configuration with debugger & storage permissions
├── background.js           # Service Worker managing chrome.debugger protocol & message dispatch
├── db.js                   # Dexie.js database schema & session/frame repository methods
├── stomp-parser.js         # STOMP 1.0/1.1/1.2 frame parser & serializer utility
├── lib/
│   └── dexie.min.js        # Dexie.js IndexedDB wrapper library
├── popup/
│   ├── popup.html          # Extension popup UI (Quick recording toggle & live stream)
│   ├── popup.css           # Styling for popup UI
│   └── popup.js            # Popup controller logic
└── dashboard/
    ├── dashboard.html      # Full-page session inspector & Dexie DB viewer
    ├── dashboard.css       # Styling for inspector dashboard
    └── dashboard.js        # Inspector logic, search filters, import/export
```

---

## 🔍 How Interception Works (`chrome.debugger` API)

Standard Chrome Extensions cannot inspect raw WebSocket frames using standard Web Request APIs. This extension uses Chrome's **DevTools Protocol (`chrome.debugger`)**:

1. **Attach Debugger**: When user clicks **Start Recording** on a browser tab, `background.js` executes:
   ```js
   await chrome.debugger.attach({ tabId }, "1.3");
   await chrome.debugger.sendCommand({ tabId }, "Network.enable");
   ```
2. **Listen to Frame Events**: `background.js` listens to `chrome.debugger.onEvent`:
   - `Network.webSocketFrameSent`: Triggered when client sends a WS frame.
   - `Network.webSocketFrameReceived`: Triggered when server pushes a WS frame.
3. **Parse STOMP Payload**: `stomp-parser.js` extracts command (`CONNECT`, `SUBSCRIBE`, `SEND`, `MESSAGE`), headers (`destination`, `content-type`), and JSON/Text body.
4. **Store in Dexie DB**: Each parsed frame is stored under the active `sessionId`.

---

## 💾 Dexie DB Schema (`db.js`)

IndexedDB database name: **`StompInterceptorDB`**

### `sessions` Store
- `id` (Auto Increment primary key)
- `name` (User-defined session label)
- `startTime` / `endTime` (Timestamps)
- `frameCount` (Total intercepted frames)
- `tabUrl` / `tabTitle` (Metadata)
- `status` ('RECORDING' | 'STOPPED' | 'IMPORTED')

### `frames` Store
- `id` (Auto Increment primary key)
- `sessionId` (Foreign key to `sessions.id`)
- `timestamp` (Epoch millis)
- `direction` ('SENT' | 'RECEIVED')
- `stompCommand` ('CONNECT' | 'SUBSCRIBE' | 'SEND' | 'MESSAGE' | etc.)
- `destination` (e.g. `/topic/messages` or `/app/chat`)
- `headers` (Key-value map of STOMP headers)
- `body` (Raw body payload string / JSON string)
- `rawPayload` (Full raw WebSocket frame string)

---

## 🔁 Replay Engine

The extension provides two flexible replay strategies:

### 1. Server Mock Mode (`SERVER_MOCK`)
Replays recorded `RECEIVED` server messages back into the target browser tab without needing a live backend!
- Uses DevTools Protocol injection:
  ```js
  await chrome.debugger.sendCommand({ tabId }, "Network.webSocketFrameReceived", {
    requestId: 'replay-req-1',
    timestamp: Date.now() / 1000,
    response: {
      opcode: 1, // Text frame
      mask: false,
      payloadData: frame.rawPayload
    }
  });
  ```

### 2. Client Flow Replay (`CLIENT`)
Re-sends recorded `SENT` client frames back to the live Spring Boot STOMP broker via the browser tab's active STOMP client:
- Script injection via `chrome.scripting.executeScript`:
  ```js
  window.client.send(frame.destination, {}, frame.body);
  ```

---

## 🚀 How to Load and Test in Chrome

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in upper-right corner).
3. Click **Load unpacked** and select the directory:
   `/home/kobalski/Development/stomp-interceptor/chrome-extension/`
4. Start your Spring Boot Backend (`http://localhost:8080`).
5. Open the Web Application at `http://localhost:8080`.
6. Click the **STOMP Interceptor** Extension icon in Chrome's extension bar.
7. Click **● Start Recording**.
8. In the web app, click **Connect**, subscribe to topics, and send STOMP frames.
9. Click **■ Stop Recording** in the Extension Popup.
10. Click **Full Dashboard** to inspect all recorded frames in Dexie DB or click **Export JSON**!

---

## 👩‍💻 Intern Developer Notes: Modifying & Extending

- **Custom Frame Filters**: Modify `stomp-parser.js` to parse custom STOMP headers or handle binary STOMP frames (`content-type: application/octet-stream`).
- **Automated Test Assertions**: Extend `dashboard.js` to add automated JSON schema validation for replayed STOMP frames.
- **Export Formats**: `db.js` exports standard JSON format, which can easily be converted to Postman WS collections or HAR files.
