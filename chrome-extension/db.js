import './lib/dexie.min.js';
import { buildStompFrame } from './stomp-parser.js';

// Dexie is available globally as self.Dexie or window.Dexie or Dexie
const Dexie = self.Dexie;

export const db = new Dexie('StompInterceptorDB');

db.version(1).stores({
  sessions: '++id, name, startTime, endTime, frameCount, tabUrl, tabTitle, status',
  frames: '++id, sessionId, timestamp, direction, stompCommand, destination'
});

export async function createSession(tabUrl, tabTitle, sessionName = '') {
  const name = sessionName || `Recording - ${new Date().toLocaleTimeString()}`;
  const id = await db.sessions.add({
    name,
    startTime: Date.now(),
    endTime: null,
    frameCount: 0,
    tabUrl,
    tabTitle,
    status: 'RECORDING'
  });
  return id;
}

export async function stopSession(sessionId) {
  if (!sessionId) return;
  const count = await db.frames.where('sessionId').equals(sessionId).count();
  await db.sessions.update(sessionId, {
    endTime: Date.now(),
    frameCount: count,
    status: 'STOPPED'
  });
}

export async function saveFrame(sessionId, direction, frameInfo) {
  if (!sessionId) return;

  const { command, destination, headers, body, rawPayload } = frameInfo;
  
  await db.frames.add({
    sessionId,
    timestamp: Date.now(),
    direction, // 'SENT' or 'RECEIVED'
    stompCommand: command,
    destination: destination || '',
    headers: headers || {},
    body: body || '',
    rawPayload: rawPayload || ''
  });

  // Increment frame count in session
  const session = await db.sessions.get(sessionId);
  if (session) {
    await db.sessions.update(sessionId, {
      frameCount: (session.frameCount || 0) + 1
    });
  }
}

export async function updateFrame(frameId, newBody) {
  if (!frameId) return;
  const frame = await db.frames.get(frameId);
  if (!frame) return;

  const rawPayload = buildStompFrame(frame.stompCommand, frame.headers, newBody);

  await db.frames.update(frameId, {
    body: newBody,
    rawPayload: rawPayload
  });
}

export async function getSessions() {
  return await db.sessions.orderBy('id').reverse().toArray();
}

export async function getSessionFrames(sessionId) {
  return await db.frames.where('sessionId').equals(sessionId).sortBy('timestamp');
}

export async function deleteSession(sessionId) {
  await db.transaction('rw', db.sessions, db.frames, async () => {
    await db.frames.where('sessionId').equals(sessionId).delete();
    await db.sessions.delete(sessionId);
  });
}

export async function exportSessionJSON(sessionId) {
  const session = await db.sessions.get(sessionId);
  if (!session) throw new Error('Session not found');

  const frames = await getSessionFrames(sessionId);

  return JSON.stringify({
    version: '1.0',
    exportedAt: new Date().toISOString(),
    session,
    frames
  }, null, 2);
}

export async function importSessionJSON(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data || !data.session || !Array.isArray(data.frames)) {
    throw new Error('Invalid recording JSON format');
  }

  return await db.transaction('rw', db.sessions, db.frames, async () => {
    const newSessionId = await db.sessions.add({
      name: `${data.session.name} (Imported)`,
      startTime: data.session.startTime || Date.now(),
      endTime: data.session.endTime || Date.now(),
      frameCount: data.frames.length,
      tabUrl: data.session.tabUrl || '',
      tabTitle: data.session.tabTitle || '',
      status: 'IMPORTED'
    });

    for (const f of data.frames) {
      await db.frames.add({
        sessionId: newSessionId,
        timestamp: f.timestamp || Date.now(),
        direction: f.direction || 'SENT',
        stompCommand: f.stompCommand || f.command || 'SEND',
        destination: f.destination || '',
        headers: f.headers || {},
        body: f.body || '',
        rawPayload: f.rawPayload || ''
      });
    }

    return newSessionId;
  });
}

export async function clearAllSessions() {
  await db.transaction('rw', db.sessions, db.frames, async () => {
    await db.frames.clear();
    await db.sessions.clear();
  });
}
