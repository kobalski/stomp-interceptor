import React, { useState, useCallback, useRef } from 'react';
import DirectionTag from './DirectionTag';
import JsonEditor from './JsonEditor';
import { FrameRecord } from '../types';

interface FrameInspectorProps {
  frame: FrameRecord | null;
  onSavePayload: (frameId: number, newBody: string) => Promise<void>;
  onReplayFrame: (frame: FrameRecord) => Promise<void>;
  onDeleteFrame?: (frameId: number) => Promise<void>;
}

export default function FrameInspector({
  frame,
  onSavePayload,
  onReplayFrame,
  onDeleteFrame,
}: FrameInspectorProps) {
  const [editedBody, setEditedBody] = useState(frame ? frame.body : '');
  const editorKeyRef = useRef(0);

  const currentFrameId = frame ? frame.id : null;
  const [lastFrameId, setLastFrameId] = useState<number | null | undefined>(null);
  if (currentFrameId !== lastFrameId) {
    setLastFrameId(currentFrameId);
    setEditedBody(frame ? frame.body : '');
    editorKeyRef.current += 1;
  }

  const handleEditorChange = useCallback((newValue: string) => {
    setEditedBody(newValue);
  }, []);

  const handleSave = useCallback(async () => {
    if (!frame || frame.id === undefined) return;
    await onSavePayload(frame.id, editedBody);
  }, [frame, editedBody, onSavePayload]);

  const handleReplay = useCallback(async () => {
    if (!frame) return;
    await onReplayFrame({ ...frame, body: editedBody });
  }, [frame, editedBody, onReplayFrame]);

  const handleDelete = useCallback(async () => {
    if (!frame || frame.id === undefined || !onDeleteFrame) return;
    await onDeleteFrame(frame.id);
  }, [frame, onDeleteFrame]);

  if (!frame) {
    return (
      <div className="inspector">
        <div className="inspector-title">Frame Inspector</div>
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
          Select a frame from the table to inspect headers &amp; payload
        </div>
      </div>
    );
  }

  const headersJson = JSON.stringify(frame.headers || {}, null, 2);

  return (
    <div className="inspector">
      <div className="inspector-title">
        <span>Frame Inspector</span>
        {onDeleteFrame && (
          <button
            className="btn btn-red"
            style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
            onClick={handleDelete}
            title="Delete this single frame"
          >
            🗑 Delete Frame
          </button>
        )}
      </div>

      <div id="inspectorContent">
        {/* Command & Direction */}
        <div className="inspector-section">
          <div className="inspector-label">Command &amp; Direction</div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <DirectionTag direction={frame.direction} />
            <strong style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)' }}>
              {frame.stompCommand}
            </strong>
          </div>
        </div>

        {/* Destination */}
        <div className="inspector-section">
          <div className="inspector-label">Destination</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {frame.destination || 'N/A'}
          </div>
        </div>

        {/* STOMP Headers */}
        <div className="inspector-section">
          <div className="inspector-label">STOMP Headers</div>
          <pre className="code-block">{headersJson}</pre>
        </div>

        {/* Message Payload (JSON Editor) */}
        <div className="inspector-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <div className="inspector-label">Message Payload (JSON Editor)</div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                onClick={handleSave}
              >
                💾 Save
              </button>
              <button
                className="btn btn-cyan"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                onClick={handleReplay}
              >
                ► Replay Frame
              </button>
            </div>
          </div>
          <JsonEditor
            key={editorKeyRef.current}
            initialValue={frame.body || ''}
            onChange={handleEditorChange}
          />
        </div>

        {/* Raw WebSocket Frame */}
        <div className="inspector-section" style={{ marginTop: '0.5rem' }}>
          <div className="inspector-label">Raw WebSocket Frame</div>
          <pre className="code-block" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {frame.rawPayload || ''}
          </pre>
        </div>
      </div>
    </div>
  );
}
