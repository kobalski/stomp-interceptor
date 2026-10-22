# STOMP WebSocket Chrome Interceptor & Replay Extension

## Overview
This Chrome Extension (Manifest V3) intercepts STOMP protocol messages transmitted over WebSockets between web frontends and Spring Boot backends. It utilizes the **Chrome DevTools Protocol (`chrome.debugger` API)** to capture low-level raw WebSocket frames, parses STOMP commands, headers, and payloads, and stores recorded sessions inside **Dexie.js (IndexedDB)**.

Built with **React 19**, **TypeScript**, and **Vite**, this extension is designed for QA testing, intern onboarding, recording client/server interaction flows, and replaying recorded STOMP sequences.

> 📄 **Detailed Documentation**: See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for full project architecture and component breakdowns in Turkish.

---

## 🏗️ Architecture & Component Guide

```
chrome-extension/
├── dist/                    # Compiled extension bundle (Load this in chrome://extensions)
├── manifest.json            # Manifest V3 configuration with debugger & storage permissions
├── vite.config.js           # Vite + CRXJS plugin build configuration
├── tsconfig.json            # TypeScript compiler configuration (strict mode)
├── package.json             # React 19, TypeScript, Dexie.js dependencies & scripts
└── src/                     # React + TypeScript Source Files
    ├── types/
    │   └── index.ts         # StompFrame, Session, FrameRecord & message models
    ├── lib/
    │   ├── stomp-parser.ts  # STOMP 1.0/1.1/1.2 frame parser & serializer
    │   └── db.ts            # Dexie.js database schema & repository methods
    ├── background/
    │   └── index.ts         # Chrome Service Worker managing debugger protocol & replay
    ├── components/          # Reusable React UI Components
    │   ├── DirectionTag.tsx # SENT / RECEIVED tag badge
    │   ├── StatusPill.tsx   # Pulse recording indicator
    │   ├── SessionCard.tsx  # Session list item card
    │   ├── FrameTable.tsx   # STOMP frame table & filters
    │   ├── FrameInspector.tsx # Header & payload inspector panel
    │   └── JsonEditor.tsx   # Interactive JSON code & tree editor
    ├── popup/               # Extension Toolbar Popup UI (React + TSX)
    └── dashboard/           # Full-page Dashboard UI (React + TSX)
```

---

## 🚀 Build & Installation Guide

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Build Production Bundle**:
   ```bash
   npm run build
   ```

3. **Auto-Rebuild on File Changes (Development)**:
   ```bash
   npm run watch
   ```

4. **Load into Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in top-right corner).
   - Click **Load unpacked** and select the **`dist`** directory:
     `chrome-extension/dist`

---

## 🔍 How Interception Works (`chrome.debugger` API)

Standard Chrome Extensions cannot inspect raw WebSocket frames using standard Web Request APIs. This extension uses Chrome's **DevTools Protocol (`chrome.debugger`)**:

1. **Attach Debugger**: When user clicks **Start Recording** on a browser tab, `background/index.ts` executes:
   ```ts
   await chrome.debugger.attach({ tabId }, "1.3");
   await chrome.debugger.sendCommand({ tabId }, "Network.enable");
   ```
2. **Listen to Frame Events**: `background/index.ts` listens to `chrome.debugger.onEvent`:
   - `Network.webSocketFrameSent`: Triggered when client sends a WS frame.
   - `Network.webSocketFrameReceived`: Triggered when server pushes a WS frame.
3. **Parse STOMP Payload**: `stomp-parser.ts` extracts command (`CONNECT`, `SUBSCRIBE`, `SEND`, `MESSAGE`), headers (`destination`, `content-type`), and JSON/Text body.
4. **Store in Dexie DB**: Each parsed frame is stored in IndexedDB under the active `sessionId`.

---

## 💾 Dexie DB Schema (`db.ts`)

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
- Triggers websocket message event on page client via `chrome.scripting.executeScript`.

### 2. Client Flow Replay (`CLIENT`)
Re-sends recorded `SENT` client frames back to the live Spring Boot STOMP broker via the browser tab's active STOMP client:
- Script injection via `chrome.scripting.executeScript`:
  ```ts
  window.client.send(frame.destination, headers, frame.body);
  ```
