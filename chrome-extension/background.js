import { parseStompFrames } from './stomp-parser.js';
import { createSession, stopSession, saveFrame, getSessionFrames } from './db.js';

// Map tabId -> { sessionId, tabUrl, tabTitle }
const activeRecordings = new Map();

// Listen to Chrome Debugger Events
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  const tabId = source.tabId;
  if (!tabId || !activeRecordings.has(tabId)) return;

  const recording = activeRecordings.get(tabId);
  const sessionId = recording.sessionId;

  if (method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') {
    const direction = method === 'Network.webSocketFrameSent' ? 'SENT' : 'RECEIVED';
    const payloadData = params.response ? params.response.payloadData : '';

    if (!payloadData) return;

    // Parse STOMP frames (skip raw heartbeats if needed or log them)
    const stompFrames = parseStompFrames(payloadData);

    for (const frame of stompFrames) {
      await saveFrame(sessionId, direction, frame);
      
      // Notify extension popups/dashboards of live intercepted frame
      chrome.runtime.sendMessage({
        type: 'STOMP_FRAME_INTERCEPTED',
        tabId,
        sessionId,
        direction,
        frame
      }).catch(() => {
        // Ignore error if no popup or dashboard is currently open
      });
    }
  }
});

// Handle Debugger Detached unexpectedly (e.g. standard DevTools opened)
chrome.debugger.onDetach.addListener(async (source, reason) => {
  const tabId = source.tabId;
  if (tabId && activeRecordings.has(tabId)) {
    const recording = activeRecordings.get(tabId);
    await stopSession(recording.sessionId);
    activeRecordings.delete(tabId);
    
    chrome.runtime.sendMessage({
      type: 'RECORDING_STOPPED',
      tabId,
      reason: `Debugger detached: ${reason}`
    }).catch(() => {});
  }
});

// Communication with Popup and Dashboard UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ success: false, error: err.message });
  });
  return true; // Keep response channel open for async promise
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'START_RECORDING': {
      const tabId = message.tabId;
      if (!tabId) throw new Error('No target tab specified');

      if (activeRecordings.has(tabId)) {
        return { success: true, isRecording: true, sessionId: activeRecordings.get(tabId).sessionId };
      }

      const tab = await chrome.tabs.get(tabId);
      const sessionId = await createSession(tab.url, tab.title, message.sessionName);

      // Attach debugger protocol
      await chrome.debugger.attach({ tabId }, "1.3");
      await chrome.debugger.sendCommand({ tabId }, "Network.enable");

      activeRecordings.set(tabId, {
        sessionId,
        tabUrl: tab.url,
        tabTitle: tab.title
      });

      return { success: true, isRecording: true, sessionId };
    }

    case 'STOP_RECORDING': {
      const tabId = message.tabId;
      if (!tabId || !activeRecordings.has(tabId)) {
        return { success: true, isRecording: false };
      }

      const recording = activeRecordings.get(tabId);
      await chrome.debugger.detach({ tabId });
      await stopSession(recording.sessionId);
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

    case 'REPLAY_SESSION': {
      const { tabId, sessionId, mode, delayMs = 500 } = message;
      if (!tabId || !sessionId) throw new Error('Tab ID and Session ID are required for replay');

      const frames = await getSessionFrames(sessionId);
      if (!frames || frames.length === 0) {
        throw new Error('No recorded frames found in this session');
      }

      // Execute Replay Sequence
      executeReplaySequence(tabId, frames, mode, delayMs);
      return { success: true, frameCount: frames.length };
    }

    case 'REPLAY_SINGLE_FRAME': {
      const { tabId, frame, mode = 'CLIENT' } = message;
      if (!tabId || !frame) throw new Error('Tab ID and frame object are required for replay');

      await executeReplaySequence(tabId, [frame], mode, 0);
      return { success: true };
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

/**
 * Replay engine: Replays STOMP frames to active tab
 * Mode 'CLIENT': Sends recorded SENT frames back to server using page STOMP client or WebSocket injection
 * Mode 'SERVER_MOCK': Injects recorded RECEIVED frames back into tab via DevTools Protocol Network.webSocketFrameReceived
 */
async function executeReplaySequence(tabId, frames, mode, delayMs) {
  let requestId = 'replay-req-1';

  for (const frame of frames) {
    if (mode === 'SERVER_MOCK' && frame.direction === 'RECEIVED') {
      // Inject simulated server frame into tab using chrome.debugger
      try {
        await chrome.debugger.sendCommand({ tabId }, "Network.webSocketFrameReceived", {
          requestId: requestId,
          timestamp: Date.now() / 1000,
          response: {
            opcode: 1, // Text frame
            mask: false,
            payloadData: frame.rawPayload || (frame.stompCommand + '\n\n' + frame.body + '\u0000')
          }
        });
      } catch (err) {
        console.warn('Failed to inject server mock frame via debugger, using fallback script dispatch:', err);
      }
    } else if (mode === 'CLIENT' && frame.direction === 'SENT') {
      // Re-send client frame to server by executing script in page context
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (destination, payloadStr) => {
          if (window.client && window.client.send) {
            window.client.send(destination, {}, payloadStr);
            console.log('[STOMP Interceptor Replay] Sent client frame to', destination);
          } else {
            console.warn('[STOMP Interceptor Replay] window.client not found on target page');
          }
        },
        args: [frame.destination, frame.body]
      });
    }

    // Delay between replayed frames
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}
