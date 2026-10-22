import { StompFrame } from '../types';

/**
 * Utility for parsing and serializing STOMP 1.0, 1.1, 1.2 protocol frames
 */
export function parseStompFrames(rawPayload: string): StompFrame[] {
  if (!rawPayload || typeof rawPayload !== 'string') return [];

  // STOMP frames are terminated by NULL byte (\u0000)
  // Heartbeats are single \n or \r\n characters
  const rawFrames = extractStompMessages(rawPayload)
  const parsedList: StompFrame[] = [];

  for (let raw of rawFrames) {
    // Strip leading heartbeats/newlines
    raw = raw.replace(/^[\r\n]+/, '');
    if (!raw.trim()) continue;

    const dividerIndex = raw.indexOf('\n\n');
    const headerSection = dividerIndex !== -1 ? raw.substring(0, dividerIndex) : raw;
    const bodySection = dividerIndex !== -1 ? raw.substring(dividerIndex + 2) : '';

    const lines = headerSection.split('\n');
    const command = lines[0].trim();
    const headers: Record<string, string> = {};

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

function extractStompMessages(rawFrame : string) {
    // 1. Ignore SockJS connection and heartbeat frames
    if (rawFrame === 'o' || rawFrame === 'h') {
        return []; // Nothing to process
    }

    // 2. Check if it's a message array (starts with 'a')
    if (rawFrame.startsWith('a') || rawFrame.startsWith("[")) {
        try {
            // Remove the 'a' prefix to get valid JSON: '["MESSAGE..."]'
            const jsonArrayString = rawFrame.startsWith("[") ? rawFrame: rawFrame.substring(1);
            
            // Parse the JSON array. This automatically handles escaped \n and quotes.
            const messages = JSON.parse(jsonArrayString) as string[];

            // 3. Optional: Remove the STOMP null-byte terminator (\u0000) 
            // so the string prints cleanly in the console
            return messages.map(msg=> msg.replace(/\u0000$/, ''));
            
        } catch (error) {
            console.error("Failed to parse SockJS frame:", error);
            return [];
        }
    }

    // Ignore other SockJS control frames like 'c' (close)
    return [];
}

export function buildStompFrame(command: string, headers: Record<string, string> = {}, body = ''): string {
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
