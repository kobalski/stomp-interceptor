import { parseStompFrames } from '../lib/stomp-parser';
import { createSession, stopSession, saveFrame, getSessionFrames } from '../lib/db';
import {
  ExtensionRequestMessage,
  ExtensionBroadcastEvent,
  FrameDirection,
  FrameRecord,
  ReplayMode
} from '../types';

interface ActiveRecording {
  sessionId: number;
  tabUrl: string;
  tabTitle: string;
}

// Map tabId -> { sessionId, tabUrl, tabTitle }
const activeRecordings = new Map<number, ActiveRecording>();

// Tracks whether a session replay is currently in progress
let isReplayInProgress = false;

// Tracks currently active STOMP subscriptions per tab, derived from intercepted WS frames
// Map<tabId, Map<destination, subId>>
const activeTabSubscriptions = new Map<number, Map<string, string>>();

const attachedTargets = new Map<string, number>();
const workerSessions = new Map();

// Listen to Chrome Debugger Events
chrome.debugger.onEvent.addListener(async (source: chrome.debugger.Debuggee, method: string, params: any) => {
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

    if (source.tabId) { 
      attachedTargets.set(targetInfo.targetId, source.tabId);
      await chrome.debugger.sendCommand(workerSession, "Network.enable");
    }
    return;
  }

  if (method === "Target.detachedFromTarget") { 
    workerSessions.delete(params.sessionId);
    return;
  }

  const tabId = source.tabId ? source.tabId : attachedTargets.get(source.targetId ?? "");
  if (!tabId || !activeRecordings.has(tabId)) return;

  const recording = activeRecordings.get(tabId)!;
  const sessionId = recording.sessionId;

 if (method === "Network.webSocketFrameSent" || method === "Network.webSocketFrameReceived"){
    const direction: FrameDirection = method === 'Network.webSocketFrameSent' ? 'SENT' : 'RECEIVED';
    const payloadData: string = params?.response?.payloadData || '';

    if (!payloadData) return;

    // Parse STOMP frames (skip raw heartbeats if needed or log them)
    const stompFrames = parseStompFrames(payloadData);

    for (const frame of stompFrames) {
      await saveFrame(sessionId, direction, frame);

      // Track SUBSCRIBE / UNSUBSCRIBE state from intercepted WS traffic
      if (direction === 'SENT') {
        if (!activeTabSubscriptions.has(tabId)) activeTabSubscriptions.set(tabId, new Map());
        const tabSubs = activeTabSubscriptions.get(tabId)!;
        if (frame.command === 'SUBSCRIBE' && frame.destination) {
          const subId = frame.headers?.id || `sub-tracked-${Date.now()}`;
          tabSubs.set(frame.destination, subId);
        } else if (frame.command === 'UNSUBSCRIBE' && frame.destination) {
          tabSubs.delete(frame.destination);
        }
      }

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

// Handle Debugger Detached unexpectedly
chrome.debugger.onDetach.addListener(async (source: chrome.debugger.Debuggee, reason: string) => {
  const tabId = source.tabId;
  if (tabId && activeRecordings.has(tabId)) {
    const recording = activeRecordings.get(tabId)!;
    await stopSession(recording.sessionId);
    activeRecordings.delete(tabId);
    attachedTargets.clear();

    broadcastMessage({
      type: 'RECORDING_STOPPED',
      tabId,
      reason: `Debugger detached: ${reason}`
    });
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

      // Attach debugger protocol
      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
      await chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
        filter: [
          {type: "worker", exclude:false},
          {type: "service_worker", exclude:false},
          {type: "shared_worker", exclude:false},
        ]
      })

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
      await chrome.debugger.detach({ tabId });
      await stopSession(recording.sessionId);
      activeRecordings.delete(tabId);
      for (const targetId of attachedTargets.keys()) {
        await chrome.debugger.detach({ targetId });
      }
      attachedTargets.clear();

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
      const { tabId, sessionId, mode, delayMs = 500 } = message;
      if (!tabId || !sessionId) throw new Error('Tab ID and Session ID are required for replay');

      if (isReplayInProgress) {
        return { success: false, error: 'A replay is already in progress. Please wait for it to finish.' };
      }

      const frames = await getSessionFrames(sessionId);
      if (!frames || frames.length === 0) {
        throw new Error('No recorded frames found in this session');
      }

      isReplayInProgress = true;
      executeReplaySequence(tabId, frames, mode, delayMs)
        .finally(() => { isReplayInProgress = false; });
      return { success: true, frameCount: frames.length };
    }

    case 'REPLAY_SINGLE_FRAME': {
      const { tabId, frame } = message;
      if (!tabId || !frame) throw new Error('Tab ID and frame object are required for replay');

      const mode: ReplayMode = 'CLIENT';
      const result = await executeReplaySequence(tabId, [frame], mode, 0, true);
      return { success: true, ...result };
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function executeReplaySequence(
  tabId: number,
  frames: FrameRecord[],
  mode: ReplayMode = 'CLIENT',
  delayMs: number,
  bypassFilter = false
): Promise<any> {
  if (bypassFilter && frames.length === 1) {
    const f = frames[0];
    console.log(`[STOMP Interceptor Replay] Replaying single frame (Command: ${f.stompCommand}, Direction: ${f.direction}, Mode: ${mode})`);
  } else {
    console.log(`[STOMP Interceptor Replay] Replaying session: ${frames.length} frames (Mode: ${mode})`);
  }

  const replayableFrames = bypassFilter ? frames : frames.filter(f => {
    return f.direction === 'SENT' && ['SEND', 'SUBSCRIBE', 'UNSUBSCRIBE', 'CONNECT'].includes(f.stompCommand);
  });

  if (replayableFrames.length === 0) {
    broadcastMessage({
      type: 'REPLAY_COMPLETE',
      tabId,
      success: true,
      totalFrames: 0,
      replayedFrames: 0,
      skippedFrames: frames.length,
      message: `No 'SENT' frames to replay in this session`
    });
    return;
  }

  try {
    if (mode === 'CLIENT') {
      const knownSubs = activeTabSubscriptions.get(tabId) || new Map<string, string>();
      const knownSubsObj = Object.fromEntries(knownSubs);
      console.log('[STOMP Interceptor Replay] Bootstrap: injecting', knownSubs.size, 'known subscription(s) from WS intercept:', knownSubsObj);
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (subsObj: Record<string, string>) => {
          (window as any).__stompReplaySubs = Object.assign({}, subsObj, (window as any).__stompReplaySubs || {});
          console.log('[STOMP Interceptor Replay] Bootstrap complete. Tracked subs:', JSON.stringify((window as any).__stompReplaySubs));
        },
        args: [knownSubsObj]
      }).catch((err) => {
        console.warn('[STOMP Interceptor Replay] Bootstrap inject failed:', err);
      });
    }

    let replayedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < replayableFrames.length; i++) {
      const frame = replayableFrames[i];
      let frameSuccess = false;
      let frameError: string | null = null;

        if (mode === 'CLIENT') {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (command: string, destination: string, headersJson: string, payloadStr: string) => {
              const win = window as any;
              if (!win.client) {
                console.warn('[STOMP Interceptor Replay] window.client not found.');
                return false;
              }
              const headers = JSON.parse(headersJson);

              if (!win.__stompReplaySubs) win.__stompReplaySubs = {};

              if (command === 'SEND') {
                win.client.send(destination, headers, payloadStr);
              } else if (command === 'SUBSCRIBE') {
                if (win.__stompReplaySubs[destination]) {
                  return 'SKIPPED';
                }
                const subId = win.client.subscribe(destination, () => { });
                win.__stompReplaySubs[destination] = subId || destination;
              } else if (command === 'UNSUBSCRIBE') {
                if (!win.__stompReplaySubs || !win.__stompReplaySubs[destination]) {
                  return 'SKIPPED';
                }
                const unsubId = win.__stompReplaySubs[destination];
                win.client.unsubscribe(unsubId);
                delete win.__stompReplaySubs[destination];
              }
              return true;
            },
            args: [
              frame.stompCommand,
              frame.destination,
              JSON.stringify(frame.headers || {}),
              frame.body || ''
            ]
          });
          frameSuccess = true;
          replayedCount++;
        } catch (err: any) {
          frameError = err.message;
          errorCount++;
          console.warn(`[Replay] CLIENT frame #${i + 1} failed:`, err);
        }
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

      if (i < replayableFrames.length - 1) {
        const currentTimestamp = replayableFrames[i].timestamp;
        const nextTimestamp = replayableFrames[i + 1].timestamp;
        const timestampDelta = nextTimestamp - currentTimestamp;

        if (timestampDelta > 0) {
          await new Promise(resolve => setTimeout(resolve, timestampDelta));
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

function buildStompFrameFromRecord(frame: FrameRecord): string {
  let frameStr = (frame.stompCommand || 'MESSAGE') + '\n';
  const headers = frame.headers || {};
  for (const [key, val] of Object.entries(headers)) {
    frameStr += `${key}:${val}\n`;
  }
  frameStr += '\n';
  if (frame.body) {
    frameStr += frame.body;
  }
  frameStr += '\u0000';
  return frameStr;
}

function broadcastMessage(msg: ExtensionBroadcastEvent): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Ignore if no listener is active
  });
}
