import { parseStompFrames } from '../lib/stomp-parser';
import { createSession, stopSession, saveFrame, getSessionFrames } from '../lib/db';
import {
  ExtensionRequestMessage,
  ExtensionBroadcastEvent,
  FrameDirection,
  FrameRecord,
} from '../types';

interface ActiveRecording {
  sessionId: number;
  tabUrl: string;
  tabTitle: string;
};

interface TabState {
  attached: boolean,
  workerSession: string
}

export interface CdpRemoteObject<T = unknown> {
  type: string;
  subtype?: string;
  className?: string;
  value?: T;
  objectId?: string;
  description?: string;
}

export interface RuntimeEvaluateResult {
  result: CdpRemoteObject;
  exceptionDetails?: unknown;
}

export interface RuntimeQueryObjectsResult {
  objects: CdpRemoteObject;
}

export interface RuntimeCallFunctionOnResult<T = unknown> {
  result: CdpRemoteObject<T>;
  exceptionDetails?: unknown;
}

export interface ReplayResult {
  ok: boolean;
  url?: string;
  error?: string;
}

const tabState = new Map<number, TabState>();

// Map tabId -> { sessionId, tabUrl, tabTitle }
const activeRecordings = new Map<number, ActiveRecording>();

// Tracks whether a session replay is currently in progress
let isReplayInProgress = false;

// Tracks currently active STOMP subscriptions per tab, derived from intercepted WS frames
// Map<tabId, Map<destination, subId>>
const activeTabSubscriptions = new Map<number, Map<string, string>>();

const attachedTargets = new Map<string, number>();
const workerSessions = new Map();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url?.includes("localhost")) {
    let state = tabState.get(tabId);
    if (state) return;

    try {
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
        filter: [
          { type: "worker", exclude: false },
          { type: "service_worker", exclude: false },
          { type: "shared_worker", exclude: false }
        ]
      });
    } catch (err) {
      console.warn("Debugger attach failed:", err);
    }
  }
});

// Listen to Chrome Debugger Events
chrome.debugger.onEvent.addListener(async (source: chrome.debugger.Debuggee, method: string, params: any) => {
  if (!source.tabId) return;

  if (method === "Target.attachedToTarget") { 
    const { sessionId, targetInfo } = params;
    const workerSession = {
      tabId: source.tabId,
      sessionId: sessionId
    }

    workerSessions.set(sessionId, {
      tabId: source.tabId,
      workerUrl: targetInfo.url,
      workerType: targetInfo.type,
      targetId: targetInfo.targetId
    });

    if (!targetInfo.url.includes("src/client/workers/ws-worker.worker.js?") && tabState.get(source.tabId)) { 
      return;
    }

    if (source.tabId) { 
      attachedTargets.set(targetInfo.targetId, source.tabId);
      if (params.waitingForDebugger) { 
        chrome.debugger.sendCommand(workerSession, "Runtime.runIfWaitingForDebugger")
      }
      await chrome.debugger.sendCommand(workerSession, "Network.enable");
      try {
        await patchWebWorker(source.tabId, sessionId);
      } catch (error) {
        console.log(error);
      }
    }
 
    tabState.set(source.tabId, { attached: true, workerSession: sessionId });
    return;
  }

  if (method === "Target.detachedFromTarget") { 
    workerSessions.delete(params.sessionId);
   const state = tabState.get(source.tabId);
    if (!source.tabId && state?.workerSession === params.sessionId) { 
      tabState.delete(source.tabId);
    }
    return;
  }

  const tabId = source.tabId ? source.tabId : attachedTargets.get(source.targetId ?? "");
  if (!tabId) return;
  
  if (method === "Network.webSocketFrameSent") {
      const payloadData: string = params?.response?.payloadData || '';

      if (!payloadData) return;

      // Parse STOMP frames (skip raw heartbeats if needed or log them)
      const stompFrames = parseStompFrames(payloadData);

      for (const frame of stompFrames) {
        // Track SUBSCRIBE / UNSUBSCRIBE state from intercepted WS traffic
      if (!activeTabSubscriptions.has(tabId)) activeTabSubscriptions.set(tabId, new Map());
          const tabSubs = activeTabSubscriptions.get(tabId)!;
          if (frame.command === 'SUBSCRIBE' && frame.destination) {
            const subId = frame.headers?.id || `sub-tracked-${Date.now()}`;
            tabSubs.set(frame.destination, subId);
          } else if (frame.command === 'UNSUBSCRIBE' && frame.destination) {
            tabSubs.delete(frame.destination);
          }
      }
  }
  
  if (!activeRecordings.has(tabId)) return;

  const recording = activeRecordings.get(tabId)!;
  const sessionId = recording.sessionId;

 if (method === "Network.webSocketFrameSent" || method === "Network.webSocketFrameReceived") {
    const direction: FrameDirection = method === 'Network.webSocketFrameSent' ? 'SENT' : 'RECEIVED';
    const payloadData: string = params?.response?.payloadData || '';

    if (!payloadData) return;

    // Parse STOMP frames (skip raw heartbeats if needed or log them)
    const stompFrames = parseStompFrames(payloadData);
    for (const frame of stompFrames) {
      await saveFrame(sessionId, direction, frame);
      // Notify extension popups/dashboards of live intercepted frame
      broadcastMessage({
        type: 'STOMP_FRAME_INTERCEPTED',
        tabId,
        sessionId,
        direction,
        frame
      });
    }
  }
});

async function patchWebWorker(tabId: number, sessionId: string) {
  const hookCode = `
    if (!self.__TESTING_SOCKETS__) {
      const OriginalWebSocket = self.WebSocket;
      self.__TESTING_SOCKETS__ = [];

      self.WebSocket = function(url, protocols) {
        const ws = protocols !== undefined
          ? new OriginalWebSocket(url, protocols)
          : new OriginalWebSocket(url);

        // Prevent fake ACK/NACK frames for replayed messages ("replay-...")
        // from being sent to the real backend server, which would cause the
        // broker to reject the unknown message-id and close the subscription.
        const origSend = ws.send.bind(ws);
        ws.send = function(data) {
          if (typeof data === "string" && data.includes("replay-") && (data.includes("ACK\\n") || data.includes("NACK\\n"))) {
            console.log("[Worker Replay] Suppressed outgoing ACK/NACK for replayed message:", data);
            return;
          }
          return origSend(data);
        };

        self.__TESTING_SOCKETS__.push(ws);
        return ws;
      };
      self.WebSocket.prototype = OriginalWebSocket.prototype;
      Object.assign(self.WebSocket, OriginalWebSocket);
    }

    // Outgoing (Client -> Server): Sends a real network packet to backend
    self.__sendTestMessage = function(message, index = 0) {
      const openSockets = self.__TESTING_SOCKETS__.filter((s) => s && s.readyState === 1);
      const socket = openSockets[openSockets.length - 1] || self.__TESTING_SOCKETS__[index];
      if (socket && socket.readyState === 1) {
        socket.send(message);
        return "Sent from Worker!";
      }
      return "Worker socket not ready";
    };

    // Incoming Simulation (Server -> Client): Triggers JS handler directly inside Worker
    self.__receiveTestMessage = function(sockJsFrame, index = 0) {
      const openSockets = self.__TESTING_SOCKETS__.filter((s) => s && s.readyState === 1);
      const socket = openSockets[openSockets.length - 1] || self.__TESTING_SOCKETS__[index];

      if (socket && socket.readyState === 1) {
        // 1. Unwrap if already in a["..."] so we can sanitize the inner STOMP frame
        let innerStomp = sockJsFrame;
        if (sockJsFrame.startsWith("a[")) {
          try {
            innerStomp = JSON.parse(sockJsFrame.slice(1))[0];
          } catch {}
        }

        // 2. Remove any existing content-length header (a 1-byte mismatch leaves
        // leftover bytes in STOMP's partialData buffer and breaks all future messages!)
        // and guarantee the frame ends with EXACTLY ONE null byte (\\x00) and nothing after it.
        const cleanStomp =
          innerStomp
            .replace(/^content-length:.*\\r?\\n/gm, "")
            .replace(/\\x00+[\\s\\S]*$/, "") + "\\x00";

        const formattedFrame = "a" + JSON.stringify([cleanStomp]);
        console.log("[Worker Replay] Triggering sanitized SockJS frame:", formattedFrame);

        const event = new MessageEvent("message", {
          data: formattedFrame,
          origin: socket.url
        });

        socket.dispatchEvent(event);
        return "Simulated receive in Worker!";
      }
      return "Worker socket not ready (total=" + self.__TESTING_SOCKETS__.length + ")";
    };
  `;

  void chrome.debugger.sendCommand(  { tabId , sessionId}, "Runtime.evaluate", {
    expression: hookCode,
    silent: true
  });
}

async function sendReceivedWorkerSocketMessage(tabId: number, workerSessionId: string, message: string) {
  const hookCode = `self.__receiveTestMessage(${JSON.stringify(message)})`;
  return await chrome.debugger.sendCommand({ tabId, sessionId: workerSessionId }, "Runtime.evaluate", {
    expression: hookCode,
    silent: true
  });
}

async function sendSentWorkerSocketMessage(tabId: number, workerSessionId: string, message: string) {
  const hookCode = `self.__sendTestMessage(${JSON.stringify(message)})`;
  return await chrome.debugger.sendCommand({ tabId, sessionId: workerSessionId }, "Runtime.evaluate", {
    expression: hookCode,
    silent: true
  });
}

// Handle Debugger Detached unexpectedly
chrome.debugger.onDetach.addListener(async (source: chrome.debugger.Debuggee, reason: string) => {
  const tabId = source.tabId;
  if (tabId && activeRecordings.has(tabId)) {
    const recording = activeRecordings.get(tabId)!;
    await stopSession(recording.sessionId);
    activeRecordings.delete(tabId);
    attachedTargets.clear();
    tabState.clear();
  }
});

// Communication with Popup and Dashboard UI

chrome.runtime.onMessage.addListener((message: ExtensionRequestMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err: any) => {
      sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
    });
  return true; // Keep response channel open for async promise
});

async function handleMessage(message: ExtensionRequestMessage, sender: chrome.runtime.MessageSender): Promise<any> {
  switch (message.type) {
    case 'START_RECORDING': {
      const tabId = message.tabId;
      if (!tabId) throw new Error('No target tab specified');

      if (activeRecordings.has(tabId)) {
        return { success: true, isRecording: true, sessionId: activeRecordings.get(tabId)!.sessionId };
      }

      const tab = await chrome.tabs.get(tabId);
      const sessionId = await createSession(tab.url || '', tab.title || '', message.sessionName);

      activeRecordings.set(tabId, {
        sessionId,
        tabUrl: tab.url || '',
        tabTitle: tab.title || ''
      });

      return { success: true, isRecording: true, sessionId };
    }

    case 'STOP_RECORDING': {
      const tabId = message.tabId;
      if (!tabId || !activeRecordings.has(tabId)) {
        return { success: true, isRecording: false };
      }

      const recording = activeRecordings.get(tabId)!;
      await stopSession(recording.sessionId);
      broadcastMessage({
        type: 'RECORDING_STOPPED',
        tabId,
        reason: "User stopped recording"
      });
      activeRecordings.delete(tabId);
           return { success: true, isRecording: false, sessionId: recording.sessionId };
    }

    case 'GET_RECORDING_STATUS': {
      const tabId = message.tabId;
      const isRecording = activeRecordings.has(tabId);
      const recording = activeRecordings.get(tabId);
      return {
        success: true,
        isRecording,
        sessionId: recording ? recording.sessionId : null
      };
    }

    case 'GET_REPLAY_STATUS': {
      return { success: true, isReplayInProgress };
    }

    case 'REPLAY_SESSION': {
      const { tabId, sessionId } = message;
      if (!tabId || !sessionId) throw new Error('Tab ID and Session ID are required for replay');

      if (isReplayInProgress) {
        return { success: false, error: 'A replay is already in progress. Please wait for it to finish.' };
      }

      const frames = await getSessionFrames(sessionId);
      if (!frames || frames.length === 0) {
        throw new Error('No recorded frames found in this session');
      }

      isReplayInProgress = true;
      executeReplaySequence(tabId, frames)
        .finally(() => { isReplayInProgress = false; });
      return { success: true, frameCount: frames.length };
    }

    case 'REPLAY_SINGLE_FRAME': {
      const { tabId, frame } = message;
      if (!tabId || !frame) throw new Error('Tab ID and frame object are required for replay');
      await replayMessageToWorker(tabId, {
        topic: frame.destination,
        body: frame.body,
        direction: frame.direction
      });
      return { success: true };
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

export function parseTimestampToMs(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    // If timestamp is in seconds (e.g. UNIX seconds < 1e11, or relative seconds like 0, 5, 10...)
    // Year 1973 in milliseconds is 1e11 (100,000,000,000). Modern ms timestamps are ~1.7e12.
    // If val is less than 1e11, it is in seconds, so multiply by 1000 to get milliseconds.
    if (val > 0 && val < 1e11) {
      return Math.round(val * 1000);
    }
    return Math.round(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const asNum = Number(trimmed);
    if (!isNaN(asNum)) {
      if (asNum > 0 && asNum < 1e11) {
        return Math.round(asNum * 1000);
      }
      return Math.round(asNum);
    }
    const asDate = new Date(trimmed).getTime();
    if (!isNaN(asDate)) {
      return asDate;
    }
  }
  return 0;
}

async function executeReplaySequence(
  tabId: number,
  frames: FrameRecord[],
): Promise<any> {
  const replayableFrames = frames
    .filter(f => {
      const dir = (f.direction || '').toUpperCase();
      return dir === 'RECEIVED' || dir === 'SENT';
    })
    .sort((a, b) => parseTimestampToMs(a.timestamp) - parseTimestampToMs(b.timestamp));

  if (replayableFrames.length === 0) {
    broadcastMessage({
      type: 'REPLAY_COMPLETE',
      tabId,
      success: true,
      totalFrames: 0,
      replayedFrames: 0,
      skippedFrames: frames.length,
      message: `No frames to replay in this session`
    });
    return;
  }

  try {
    let replayedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < replayableFrames.length; i++) {
      const frame = replayableFrames[i];
      let frameSuccess = false;
      let frameError: string | null = null;
      try {
        await replayMessageToWorker(tabId, {
          topic: frame.destination,
          body: frame.body,
          direction: frame.direction
        });
        frameSuccess = true;
        replayedCount++;
      } catch (err: any) {
        frameError = err.message;
        errorCount++;
        console.warn(`[Replay] Frame #${i + 1} failed:`, err);
      }

      broadcastMessage({
        type: 'REPLAY_FRAME_STATUS',
        tabId,
        frameIndex: i,
        totalFrames: replayableFrames.length,
        success: frameSuccess,
        error: frameError,
        frame: {
          stompCommand: frame.stompCommand,
          destination: frame.destination,
          direction: frame.direction
        }
      });

      // Wait according to the timestamp difference between the current frame and the next frame
      if (i < replayableFrames.length - 1) {
        const currentTimestamp = parseTimestampToMs(replayableFrames[i].timestamp);
        const nextTimestamp = parseTimestampToMs(replayableFrames[i + 1].timestamp);
        const timestampDelta = nextTimestamp - currentTimestamp;

        if (timestampDelta > 0) {
          const delayMs = Math.min(timestampDelta, 300000); // safety cap at 5 minutes
          console.log(`[Replay] Waiting ${delayMs}ms before replaying frame #${i + 2}...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    broadcastMessage({
      type: 'REPLAY_COMPLETE',
      tabId,
      success: errorCount === 0,
      totalFrames: replayableFrames.length,
      replayedFrames: replayedCount,
      errorCount,
      message: errorCount === 0
        ? `Successfully replayed ${replayedCount} frames`
        : `Replayed ${replayedCount}/${replayableFrames.length} frames (${errorCount} errors)`
    });

  } catch (err: any) {
    broadcastMessage({
      type: 'REPLAY_COMPLETE',
      tabId,
      success: false,
      error: err.message,
      totalFrames: replayableFrames.length,
      replayedFrames: 0
    });
  }
}

async function replayMessageToWorker(tabId: number,
  { topic, body, direction } : { topic: string, body: string, direction: FrameDirection}) {
  
  const state = tabState.get(tabId);
  if (!state?.workerSession) {
    throw new Error(`No worker session attached for tab ${tabId}`);
  }
  const resolvedSubId = activeTabSubscriptions.get(tabId)?.get(topic) || "sub-0";
  if (direction === "RECEIVED") {
    await sendReceivedWorkerSocketMessage(tabId, state.workerSession, createReceivedSockMessage(body, topic, resolvedSubId));
  } else if(direction === "SENT") { 
    await sendSentWorkerSocketMessage(tabId, state.workerSession, createSentSockMessage(body, topic));
  }
}


function createSentSockMessage(body: string, topic: string) { 
  let bodyStr: string;
  if (typeof body === "string") {
    bodyStr = body.trim();
    try {
      const parsed = JSON.parse(bodyStr);
      if (typeof parsed === "string") {
        bodyStr = parsed;
      }
    } catch {
      // Plain text body 
    }
  } else { 
    bodyStr = JSON.stringify(body);
  }
  const NULL_CHAR = String.fromCharCode(0);
  const safeBodyStr = bodyStr.split(NULL_CHAR)[0];

  const stompFrame =
    `SEND\n` +
    `destination:${topic}\n` +
    `clientSessionId: 5636103b-4d3e-4e01-83e7-a92ea4d8578c\n` +
    `debugCommands:\n` +
    `clientUserName:fkm2\n` +
    `consoleId:1\n` +
    `content-length:30\n\n` +
    `${safeBodyStr}${NULL_CHAR}`;
  

  return JSON.stringify([stompFrame]);
}

function createReceivedSockMessage(body: string, topic: string, resolvedSubId: string) { 
  let bodyStr: string;
  if (typeof body === "string") {
    bodyStr = body.trim();
    try {
      const parsed = JSON.parse(bodyStr);
      if (typeof parsed === "string") {
        bodyStr = parsed;
      }
    } catch {
      // Plain text body 
    }
  } else { 
    bodyStr = JSON.stringify(body);
  }
  const NULL_CHAR = String.fromCharCode(0);
  const safeBodyStr = bodyStr.split(NULL_CHAR)[0];

  // Build STOMP MESSAGE frame + SockJS a["..."] wrapper
  const stompFrame =
    `MESSAGE\n` +
    `destination:${topic}\n` +
    `subscription:${resolvedSubId}\n` +
    `message-id:replay-${Date.now()}\n` +
    `content-type:application/json\n\n` +
    `${safeBodyStr}${NULL_CHAR}`;
  

  return "a" + JSON.stringify([stompFrame]);
}

function broadcastMessage(msg: ExtensionBroadcastEvent): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Ignore if no listener is active
  });
}
