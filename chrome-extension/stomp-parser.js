/**
 * Utility for parsing and serializing STOMP 1.0, 1.1, 1.2 protocol frames
 */
export function parseStompFrames(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'string') return [];

  // STOMP frames are terminated by NULL byte (\u0000)
  // Heartbeats are single \n or \r\n characters
  const rawFrames = rawPayload.split('\u0000');
  const parsedList = [];

  for (let raw of rawFrames) {
    // Strip leading heartbeats/newlines
    raw = raw.replace(/^[\r\n]+/, '');
    if (!raw.trim()) continue;

    const dividerIndex = raw.indexOf('\n\n');
    const headerSection = dividerIndex !== -1 ? raw.substring(0, dividerIndex) : raw;
    const bodySection = dividerIndex !== -1 ? raw.substring(dividerIndex + 2) : '';

    const lines = headerSection.split('\n');
    const command = lines[0].trim();
    const headers = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }

    const destination = headers['destination'] || headers['subscription'] || '';

    parsedList.push({
      command,
      destination,
      headers,
      body: bodySection,
      rawPayload: raw + '\u0000'
    });
  }

  return parsedList;
}

export function buildStompFrame(command, headers = {}, body = '') {
  let frameStr = command + '\n';
  for (const [key, val] of Object.entries(headers)) {
    frameStr += `${key}:${val}\n`;
  }
  frameStr += '\n';
  if (body) {
    frameStr += body;
  }
  frameStr += '\u0000';
  return frameStr;
}
