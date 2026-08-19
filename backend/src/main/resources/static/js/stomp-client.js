/**
 * Native Standard STOMP 1.2 WebSocket Client
 * Pure JavaScript implementation with frame parsing and serialization
 */
class SimpleStompClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.subscriptions = new Map(); // id -> { destination, callback }
    this.subCounter = 0;
    
    // Callbacks
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
    this.onFrameLog = null; // (direction, command, headers, body, raw)
  }

  connect(headers = {}) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        if (this.onError) this.onError(err);
        return reject(err);
      }

      this.ws.onopen = () => {
        // Send CONNECT frame
        const connectHeaders = Object.assign({
          'accept-version': '1.2,1.1,1.0',
          'heart-beat': '10000,10000'
        }, headers);

        this._sendFrame('CONNECT', connectHeaders, '');
      };

      this.ws.onmessage = (event) => {
        const rawData = event.data;
        // Ignore heartbeats (\n or \r\n)
        if (rawData === '\n' || rawData === '\r\n') return;

        const frame = this._parseFrame(rawData);
        if (!frame) return;

        if (this.onFrameLog) {
          this.onFrameLog('RECEIVED', frame.command, frame.headers, frame.body, rawData);
        }

        if (frame.command === 'CONNECTED') {
          this.connected = true;
          if (this.onConnect) this.onConnect(frame);
          resolve(frame);
        } else if (frame.command === 'MESSAGE') {
          const subId = frame.headers['subscription'];
          if (subId && this.subscriptions.has(subId)) {
            const sub = this.subscriptions.get(subId);
            sub.callback(frame.body, frame.headers);
          }
        } else if (frame.command === 'ERROR') {
          if (this.onError) this.onError(frame);
        }
      };

      this.ws.onerror = (error) => {
        if (this.onError) this.onError(error);
        reject(error);
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (this.onDisconnect) this.onDisconnect();
      };
    });
  }

  subscribe(destination, callback) {
    if (!this.connected) throw new Error('STOMP client is not connected');

    const subId = 'sub-' + (++this.subCounter);
    const headers = {
      id: subId,
      destination: destination
    };

    this.subscriptions.set(subId, { destination, callback });
    this._sendFrame('SUBSCRIBE', headers, '');
    return subId;
  }

  unsubscribe(subId) {
    if (!this.connected) return;
    if (this.subscriptions.has(subId)) {
      this._sendFrame('UNSUBSCRIBE', { id: subId }, '');
      this.subscriptions.delete(subId);
    }
  }

  send(destination, headers = {}, body = '') {
    if (!this.connected) throw new Error('STOMP client is not connected');

    const sendHeaders = Object.assign({
      destination: destination,
      'content-type': typeof body === 'object' ? 'application/json' : 'text/plain'
    }, headers);

    const payloadStr = typeof body === 'object' ? JSON.stringify(body) : String(body);
    this._sendFrame('SEND', sendHeaders, payloadStr);
  }

  disconnect() {
    if (this.connected && this.ws) {
      this._sendFrame('DISCONNECT', { receipt: 'disc-0' }, '');
      this.connected = false;
      this.ws.close();
    }
  }

  _sendFrame(command, headers, body) {
    let frameStr = command + '\n';
    for (const [key, val] of Object.entries(headers)) {
      frameStr += `${key}:${val}\n`;
    }
    frameStr += '\n';
    if (body) {
      frameStr += body;
    }
    frameStr += '\u0000';

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(frameStr);
      if (this.onFrameLog) {
        this.onFrameLog('SENT', command, headers, body, frameStr);
      }
    }
  }

  _parseFrame(data) {
    if (!data || typeof data !== 'string') return null;
    
    // Trim NULL character
    const raw = data.endsWith('\u0000') ? data.slice(0, -1) : data;
    const dividerIndex = raw.indexOf('\n\n');
    const headerPart = dividerIndex !== -1 ? raw.substring(0, dividerIndex) : raw;
    const body = dividerIndex !== -1 ? raw.substring(dividerIndex + 2) : '';

    const lines = headerPart.split('\n');
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

    return { command, headers, body };
  }
}
