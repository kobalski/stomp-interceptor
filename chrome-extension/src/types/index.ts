export interface StompFrame {
  command: string;
  destination: string;
  headers: Record<string, string>;
  body: string;
  rawPayload: string;
}

export type SessionStatus = 'RECORDING' | 'STOPPED' | 'IMPORTED';

export interface Session {
  id?: number;
  name: string;
  startTime: number;
  endTime: number | null;
  frameCount: number;
  tabUrl: string;
  tabTitle: string;
  status: SessionStatus;
}

export type FrameDirection = 'SENT' | 'RECEIVED';

export interface FrameRecord {
  id?: number;
  sessionId: number;
  timestamp: number;
  direction: FrameDirection;
  stompCommand: string;
  destination: string;
  headers: Record<string, string>;
  body: string;
  rawPayload: string;
}

export type ReplayMode = 'CLIENT';

export interface StartRecordingMessage {
  type: 'START_RECORDING';
  tabId: number;
  sessionName?: string;
}

export interface StopRecordingMessage {
  type: 'STOP_RECORDING';
  tabId: number;
}

export interface GetRecordingStatusMessage {
  type: 'GET_RECORDING_STATUS';
  tabId: number;
}

export interface GetReplayStatusMessage {
  type: 'GET_REPLAY_STATUS';
}

export interface ReplaySessionMessage {
  type: 'REPLAY_SESSION';
  tabId: number;
  sessionId: number;
  mode: ReplayMode;
  delayMs?: number;
}

export interface ReplaySingleFrameMessage {
  type: 'REPLAY_SINGLE_FRAME';
  tabId: number;
  frame: FrameRecord;
  mode?: ReplayMode;
}

export type ExtensionRequestMessage =
  | StartRecordingMessage
  | StopRecordingMessage
  | GetRecordingStatusMessage
  | GetReplayStatusMessage
  | ReplaySessionMessage
  | ReplaySingleFrameMessage;

export interface StompFrameInterceptedEvent {
  type: 'STOMP_FRAME_INTERCEPTED';
  tabId: number;
  sessionId: number;
  direction: FrameDirection;
  frame: StompFrame;
}

export interface RecordingStoppedEvent {
  type: 'RECORDING_STOPPED';
  tabId: number;
  reason: string;
}

export interface ReplayFrameStatusEvent {
  type: 'REPLAY_FRAME_STATUS';
  tabId: number;
  frameIndex: number;
  totalFrames: number;
  success: boolean;
  error: string | null;
  frame: {
    stompCommand: string;
    destination: string;
    direction: FrameDirection;
  };
}

export interface ReplayCompleteEvent {
  type: 'REPLAY_COMPLETE';
  tabId: number;
  success: boolean;
  totalFrames?: number;
  replayedFrames?: number;
  skippedFrames?: number;
  errorCount?: number;
  message?: string;
  error?: string;
}

export type ExtensionBroadcastEvent =
  | StompFrameInterceptedEvent
  | RecordingStoppedEvent
  | ReplayFrameStatusEvent
  | ReplayCompleteEvent;

export interface ExportedSessionData {
  version: string;
  exportedAt: string;
  session: Session;
  frames: FrameRecord[];
}
