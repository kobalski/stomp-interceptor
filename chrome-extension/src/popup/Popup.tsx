import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSessions, exportSessionJSON,getSessionFrames } from '../lib/db';
import StatusPill from '../components/StatusPill';
import LiveFeedFrame from '../components/LiveFeedFrame';
import SessionDropdown from '../components/SessionDropdown';
import ToastContainer, { ToastMessage } from '../components/Toast';
import { Session, FrameDirection, ReplayDirectionFilter } from '../types';

const MAX_LIVE_FEED_FRAMES = 20;

interface LiveFrameItem {
  id: number;
  direction: FrameDirection | string;
  command: string;
  destination: string;
}

export default function Popup() {
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [frameCount, setFrameCount] = useState(0);
  const [liveFeedFrames, setLiveFeedFrames] = useState<LiveFrameItem[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [replayFilter, setReplayFilter] = useState<ReplayDirectionFilter>('ALL');
  
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayBtnText, setReplayBtnText] = useState('► Replay Session');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const isReplayingRef = useRef(false);

  const addToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (cancelled) return;
      if (tab && tab.id) {
        setCurrentTabId(tab.id);
        const response = await chrome.runtime.sendMessage({
          type: 'GET_RECORDING_STATUS',
          tabId: tab.id
        });
        if (!cancelled && response && response.isRecording && response.sessionId) {
          setIsRecording(true);
          setCurrentSessionId(response.sessionId);

          const recordedFrames = await getSessionFrames(response.sessionId);
          if(!cancelled && recordedFrames) {
            setFrameCount(recordedFrames.length);
            const recentFrames: LiveFrameItem[] = recordedFrames.slice(-
              MAX_LIVE_FEED_FRAMES).reverse().map((f,index) => ({
                  id: f.id || (Date.now() + index),
                  direction: f.direction,
                  command: f.stompCommand,
                  destination: f.destination
              }));  
              setLiveFeedFrames(recentFrames);
          }
        }
      }

      const sessionList = await getSessions();
      if (!cancelled) {
        setSessions(sessionList);
        if (sessionList.length > 0 && sessionList[0].id !== undefined) {
          setSelectedSessionId(String(sessionList[0].id));
        }
      }

      const replayStatus = await chrome.runtime.sendMessage({ type: 'GET_REPLAY_STATUS' });
      if (!cancelled && replayStatus && replayStatus.isReplayInProgress) {
        setIsReplaying(true);
        setReplayBtnText('Replaying...');
        isReplayingRef.current = true;
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleMessage(msg: any) {
      if (msg.type === 'STOMP_FRAME_INTERCEPTED' && msg.tabId === currentTabId) {
        setLiveFeedFrames(prev => {
          const newFrame: LiveFrameItem = {
            id: Date.now() + Math.random(),
            direction: msg.direction,
            command: msg.frame.command,
            destination: msg.frame.destination
          };
          const updated = [newFrame, ...prev];
          return updated.slice(0, MAX_LIVE_FEED_FRAMES);
        });
        setFrameCount(prev => prev + 1);
      }

      if (msg.type === 'REPLAY_COMPLETE') {
        isReplayingRef.current = false;
        setIsReplaying(false);
        setReplayBtnText('► Replay Session');

        if (msg.success) {
          addToast(`Replay complete! ${msg.replayedFrames} frame(s) replayed`, 'success');
        } else {
          addToast(`Replay error. Success: ${msg.replayedFrames}, Failed: ${msg.errorCount}`, 'error');
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [currentTabId, addToast]);

  const handleToggleRecord = useCallback(async () => {
    if (!currentTabId) return;

    if (!isRecording) {
      const res = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        tabId: currentTabId,
        sessionName: sessionName.trim()
      });

      if (res && res.success) {
        setIsRecording(true);
        setCurrentSessionId(res.sessionId);
        setLiveFeedFrames([]);
        setFrameCount(0);
        addToast('Started recording STOMP session', 'success');
      } else {
        addToast('Failed to start: ' + (res ? res.error : 'Unknown error'), 'error');
      }
    } else {
      const res = await chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
        tabId: currentTabId
      });

      if (res && res.success) {
        setIsRecording(false);
        setCurrentSessionId(null);
        addToast('Recording stopped and saved', 'info');
        const sessionList = await getSessions();
        setSessions(sessionList);
        if (sessionList.length > 0 && sessionList[0].id !== undefined) {
          setSelectedSessionId(String(sessionList[0].id));
        }
      }
    }
  }, [currentTabId, isRecording, sessionName, addToast]);

  const handleReplay = useCallback(async () => {
    const sessionId = parseInt(selectedSessionId, 10);
    if (!sessionId || !currentTabId) return;
    if (isReplayingRef.current) return;

    isReplayingRef.current = true;
    setIsReplaying(true);
    setReplayBtnText('Replaying...');

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'REPLAY_SESSION',
        tabId: currentTabId,
        sessionId: sessionId,
        directionFilter: replayFilter,
      });

      if (!res || !res.success) {
        addToast('Replay error: ' + (res ? res.error : 'Unknown error'), 'error');
        isReplayingRef.current = false;
        setIsReplaying(false);
        setReplayBtnText('► Replay Session');
      }
    } catch (err: any) {
      addToast('Replay error: ' + err.message, 'error');
      isReplayingRef.current = false;
      setIsReplaying(false);
      setReplayBtnText('► Replay Session');
    }
  }, [selectedSessionId, currentTabId, replayFilter, addToast]);

  const handleExportJSON = useCallback(async () => {
    const sessionId = parseInt(selectedSessionId, 10);
    if (!sessionId) {
      addToast('Please select a session to export', 'error');
      return;
    }

    try {
      const jsonStr = await exportSessionJSON(sessionId);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stomp-session-${sessionId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Session exported to JSON', 'success');
    } catch (err: any) {
      addToast('Export failed: ' + err.message, 'error');
    }
  }, [selectedSessionId, addToast]);

  const handleOpenDashboard = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  const hasLiveFeedFrames = liveFeedFrames.length > 0;

  return (
    <>
      {/* Header */}
      <div className="header">
        <div className="title">
          <div className="icon">S</div>
          <span>STOMP Interceptor</span>
        </div>
        <StatusPill isRecording={isRecording} />
      </div>

      {/* Recording Controls */}
      <div className="section">
        <div className="section-title">Recorder</div>
        {!isRecording && (
          <div className="form-group">
            <label htmlFor="sessionName">Session Name</label>
            <input
              type="text"
              id="sessionName"
              placeholder="e.g. User Chat Flow Test"
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
            />
          </div>
        )}
        <button
          className={`btn ${isRecording ? 'btn-stop' : 'btn-rec'}`}
          onClick={handleToggleRecord}
        >
          {isRecording ? '■ Stop Recording' : '● Start Recording'}
        </button>
      </div>

      {/* Live Intercepted Stream Preview */}
      <div className="section">
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Intercepted Frames</span>
          <span style={{ color: 'var(--accent-cyan)' }}>{frameCount}</span>
        </div>
        <div className="live-feed">
          {!hasLiveFeedFrames ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem' }}>
              Ready to record STOMP frames
            </div>
          ) : (
            liveFeedFrames.map(frame => (
              <LiveFeedFrame
                key={frame.id}
                direction={frame.direction}
                command={frame.command}
                destination={frame.destination}
              />
            ))
          )}
        </div>
      </div>

      {/* Quick Replay Control */}
      <div className="section">
        <div className="section-title">Quick Replay</div>
        <div className="form-group">
          <label htmlFor="sessionSelect">Select Recorded Session</label>
          <SessionDropdown
            sessions={sessions}
            value={selectedSessionId}
            onChange={setSelectedSessionId}
          />
        </div>

        <div className="form-group">
          <label htmlFor="replayTargetSelect">Replay Target</label>
          <select
            id="replayTargetSelect"
            value={replayFilter}
            onChange={e => setReplayFilter(e.target.value as ReplayDirectionFilter)}
            disabled={isReplaying}
          >
            <option value="ALL">All Messages (User &amp; Server)</option>
            <option value="SENT">Play Only User Interactions (Sent)</option>
            <option value="RECEIVED">Play Only Server Events (Received)</option>
          </select>
        </div>
        
        <button
          className="btn btn-primary"
          onClick={handleReplay}
          disabled={isReplaying || sessions.length === 0}
        >
          {replayBtnText}
        </button>
      </div>

      {/* Footer Actions */}
      <div className="footer-actions">
        <button className="btn btn-secondary" onClick={handleOpenDashboard}>
          Full Dashboard
        </button>
        <button className="btn btn-secondary" onClick={handleExportJSON}>
          Export JSON
        </button>
      </div>

      {/* In-app Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
