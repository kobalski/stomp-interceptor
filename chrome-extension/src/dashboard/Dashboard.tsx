import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getSessions,
  getSessionFrames,
  deleteSession,
  deleteFrame,
  deleteFrames,
  importSessionJSON,
  updateFrame,
  addManualFrame,
} from '../lib/db';
import SessionCard from '../components/SessionCard';
import FrameTable from '../components/FrameTable';
import FrameInspector from '../components/FrameInspector';
import ToastContainer, { ToastMessage } from '../components/Toast';
import { Session, FrameRecord, ReplayMode } from '../types';

const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 600;
const MIN_INSPECTOR = 250;
const MAX_INSPECTOR = 800;
const MIN_MIDDLE = 260;
const RESIZER_WIDTH = 6;

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeSessionObj, setActiveSessionObj] = useState<Session | null>(null);
  const [currentFrames, setCurrentFrames] = useState<FrameRecord[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null);
  const [checkedFrameIds, setCheckedFrameIds] = useState<Set<number>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [replayBtnText, setReplayBtnText] = useState('▶ Replay Selected');
  const [isReplayingSelected, setIsReplayingSelected] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeResizer, setActiveResizer] = useState<'left' | 'right' | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('stomp_sidebar_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= MIN_SIDEBAR && val <= MAX_SIDEBAR) return val;
      }
    } catch (_) {}
    return 280;
  });

  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('stomp_inspector_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= MIN_INSPECTOR && val <= MAX_INSPECTOR) return val;
      }
    } catch (_) {}
    return 420;
  });

  const importFileInputRef = useRef<HTMLInputElement>(null);

  const addToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleLeftPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setActiveResizer('left');

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.buttons === 0) {
        handlePointerUp();
        return;
      }
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = moveEvent.clientX - rect.left;
      const maxSidebar = rect.width - inspectorWidth - (2 * RESIZER_WIDTH) - MIN_MIDDLE;
      const newWidth = Math.max(MIN_SIDEBAR, Math.min(Math.min(MAX_SIDEBAR, maxSidebar), mouseX));
      setSidebarWidth(Math.round(newWidth));
    };

    const handlePointerUp = () => {
      setActiveResizer(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [inspectorWidth]);

  const handleRightPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setActiveResizer('right');

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.buttons === 0) {
        handlePointerUp();
        return;
      }
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseFromRight = rect.right - moveEvent.clientX;
      const maxInspector = rect.width - sidebarWidth - (2 * RESIZER_WIDTH) - MIN_MIDDLE;
      const newWidth = Math.max(MIN_INSPECTOR, Math.min(Math.min(MAX_INSPECTOR, maxInspector), mouseFromRight));
      setInspectorWidth(Math.round(newWidth));
    };

    const handlePointerUp = () => {
      setActiveResizer(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [sidebarWidth]);

  const handleResetSidebar = useCallback(() => {
    setSidebarWidth(280);
  }, []);

  const handleResetInspector = useCallback(() => {
    setInspectorWidth(420);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('stomp_sidebar_width', sidebarWidth.toString());
    } catch (_) {}
  }, [sidebarWidth]);

  useEffect(() => {
    try {
      localStorage.setItem('stomp_inspector_width', inspectorWidth.toString());
    } catch (_) {}
  }, [inspectorWidth]);

  useEffect(() => {
    if (activeResizer) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [activeResizer]);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const totalWidth = containerRef.current.clientWidth;
      const available = totalWidth - (2 * RESIZER_WIDTH) - MIN_MIDDLE;
      if (sidebarWidth + inspectorWidth > available && available > 0) {
        const ratio = available / (sidebarWidth + inspectorWidth);
        setSidebarWidth(prev => Math.max(MIN_SIDEBAR, Math.floor(prev * ratio)));
        setInspectorWidth(prev => Math.max(MIN_INSPECTOR, Math.floor(prev * ratio)));
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarWidth, inspectorWidth]);

  const selectSession = useCallback(async (sessionObj: Session) => {
    if (sessionObj.id === undefined) return;
    setActiveSessionId(sessionObj.id);
    setActiveSessionObj(sessionObj);
    setSelectedFrameId(null);
    setCheckedFrameIds(new Set());

    const frames = await getSessionFrames(sessionObj.id);
    setCurrentFrames(frames);
  }, []);

  const loadSessions = useCallback(async () => {
    const sessionList = await getSessions();
    setSessions(sessionList);

    if (sessionList.length > 0 && !activeSessionId) {
      await selectSession(sessionList[0]);
    } else if (sessionList.length === 0) {
      setActiveSessionId(null);
      setActiveSessionObj(null);
      setCurrentFrames([]);
      setSelectedFrameId(null);
      setCheckedFrameIds(new Set());
    }
  }, [activeSessionId, selectSession]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleFrameSelect = useCallback((frame: FrameRecord) => {
    if (frame.id !== undefined) {
      setSelectedFrameId(frame.id);
    }
  }, []);

  const handleFrameCheck = useCallback((frameId: number, checked: boolean) => {
    setCheckedFrameIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(frameId);
      } else {
        next.delete(frameId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean, filteredFrames: FrameRecord[]) => {
    setCheckedFrameIds(prev => {
      const next = new Set(prev);
      filteredFrames.forEach(f => {
        if (f.id !== undefined) {
          if (checked) {
            next.add(f.id);
          } else {
            next.delete(f.id);
          }
        }
      });
      return next;
    });
  }, []);

  const selectedFrame = useMemo(() => {
    if (!selectedFrameId) return null;
    return currentFrames.find(f => f.id === selectedFrameId) || null;
  }, [selectedFrameId, currentFrames]);

  async function resolveTargetTab(): Promise<chrome.tabs.Tab | null> {
    const allTabs = await chrome.tabs.query({});
    const webTabs = allTabs.filter((t: chrome.tabs.Tab) =>
      t.url &&
      !t.url.startsWith('chrome-extension://') &&
      !t.url.startsWith('chrome://') &&
      !t.url.startsWith('about:')
    );

    let targetTab: chrome.tabs.Tab | null = null;
    if (activeSessionObj && activeSessionObj.tabUrl) {
      try {
        const sessionOrigin = new URL(activeSessionObj.tabUrl).origin;
        targetTab = webTabs.find((t: chrome.tabs.Tab) => {
          try { return t.url ? new URL(t.url).origin === sessionOrigin : false; }
          catch { return false; }
        }) || null;
      } catch (_) { }
    }
    if (!targetTab && webTabs.length > 0) targetTab = webTabs[0];
    return targetTab;
  }

  const handleSavePayload = useCallback(async (frameId: number, newBody: string) => {
    try {
      await updateFrame(frameId, newBody);
      addToast('Payload saved successfully to database', 'success');
      if (activeSessionId) {
        const frames = await getSessionFrames(activeSessionId);
        setCurrentFrames(frames);
      }
    } catch (err: any) {
      addToast('Failed to save payload: ' + err.message, 'error');
    }
  }, [activeSessionId, addToast]);

  const handleAddNewFrame = useCallback(async () => {
    if (!activeSessionId) {
      addToast('Please select or record a session first', 'error');
      return;
    }
    try {
      const newFrameId = await addManualFrame(
        activeSessionId,
        'SEND',
        '/app/messages',
        'SENT',
        '{\n  "command": "SEND",\n  "payload": "{\\"status\\": \\"active\\", \\"data\\": {\\"key\\": \\"value\\"}}"\n}'
      );
      addToast(`New frame #${newFrameId} added to session`, 'success');

      const frames = await getSessionFrames(activeSessionId);
      setCurrentFrames(frames);
      setSelectedFrameId(newFrameId);

      const sessionList = await getSessions();
      setSessions(sessionList);
      const current = sessionList.find(s => s.id === activeSessionId);
      if (current) setActiveSessionObj(current);
    } catch (err: any) {
      addToast('Failed to add frame: ' + err.message, 'error');
    }
  }, [activeSessionId, addToast]);

  const handleReplayFrame = useCallback(async (updatedFrame: FrameRecord) => {
    const targetTab = await resolveTargetTab();
    if (!targetTab || !targetTab.id) {
      addToast('No active target tab found. Open your application tab first.', 'error');
      return;
    }

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'REPLAY_SINGLE_FRAME',
        tabId: targetTab.id,
        frame: updatedFrame,
        mode: 'CLIENT'
      });

      if (res && res.success) {
        addToast(`Replayed ${updatedFrame.stompCommand} frame to tab`, 'success');
      } else {
        addToast('Replay failed: ' + (res ? res.error : 'Unknown error'), 'error');
      }
    } catch (err: any) {
      addToast('Replay error: ' + err.message, 'error');
    }
  }, [activeSessionObj, addToast]);

  const handleDeleteSingleFrame = useCallback(async (frameId: number) => {
    if (!activeSessionId) return;
    try {
      await deleteFrame(frameId, activeSessionId);
      addToast(`Frame #${frameId} deleted from recording`, 'info');
      
      const frames = await getSessionFrames(activeSessionId);
      setCurrentFrames(frames);
      
      if (selectedFrameId === frameId) {
        setSelectedFrameId(null);
      }
      setCheckedFrameIds(prev => {
        const next = new Set(prev);
        next.delete(frameId);
        return next;
      });

      // Refresh session metadata count
      const sessionList = await getSessions();
      setSessions(sessionList);
      const current = sessionList.find(s => s.id === activeSessionId);
      if (current) setActiveSessionObj(current);
    } catch (err: any) {
      addToast('Failed to delete frame: ' + err.message, 'error');
    }
  }, [activeSessionId, selectedFrameId, addToast]);

  const handleDeleteCheckedFrames = useCallback(async () => {
    if (!activeSessionId || checkedFrameIds.size === 0) return;
    const count = checkedFrameIds.size;
    try {
      await deleteFrames(Array.from(checkedFrameIds), activeSessionId);
      addToast(`Deleted ${count} frame(s) from recording`, 'info');
      
      const frames = await getSessionFrames(activeSessionId);
      setCurrentFrames(frames);
      
      if (selectedFrameId && checkedFrameIds.has(selectedFrameId)) {
        setSelectedFrameId(null);
      }
      setCheckedFrameIds(new Set());

      // Refresh session metadata count
      const sessionList = await getSessions();
      setSessions(sessionList);
      const current = sessionList.find(s => s.id === activeSessionId);
      if (current) setActiveSessionObj(current);
    } catch (err: any) {
      addToast('Failed to delete frames: ' + err.message, 'error');
    }
  }, [activeSessionId, checkedFrameIds, selectedFrameId, addToast]);

  const handleReplaySelected = useCallback(async () => {
    if (checkedFrameIds.size === 0) return;

    const targetTab = await resolveTargetTab();
    if (!targetTab || !targetTab.id) {
      addToast('No active target tab found. Open your application tab first.', 'error');
      return;
    }

    const filter = searchFilter.trim().toLowerCase();
    const filtered = currentFrames.filter(f =>
      !filter || (f.destination && f.destination.toLowerCase().includes(filter))
    );
    const selected = filtered
      .filter(f => f.id !== undefined && checkedFrameIds.has(f.id))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (selected.length === 0) return;

    setIsReplayingSelected(true);
    setReplayBtnText(`⏳ Replaying 0/${selected.length}…`);

    let prevTimestamp = selected[0].timestamp;

    for (let i = 0; i < selected.length; i++) {
      const f = selected[i];
      const delay = i === 0 ? 0 : (f.timestamp - prevTimestamp);
      prevTimestamp = f.timestamp;

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      
      try {
        await chrome.runtime.sendMessage({
          type: 'REPLAY_SINGLE_FRAME',
          tabId: targetTab.id,
          frame: f,
          mode: 'CLIENT'
        });
      } catch (err) {
        console.error('Replay error for frame', f.id, err);
      }

      setReplayBtnText(`⏳ Replaying ${i + 1}/${selected.length}…`);
    }

    setReplayBtnText('▶ Replay Selected');
    setIsReplayingSelected(false);
    addToast(`Replayed ${selected.length} frame(s) successfully`, 'success');
  }, [checkedFrameIds, searchFilter, currentFrames, activeSessionObj, addToast]);

  const handleDeleteSession = useCallback(async () => {
    if (!activeSessionId) return;
    if (!window.confirm(`Are you sure you want to delete the entire session #${activeSessionId} and all its frames?`)) return;

    await deleteSession(activeSessionId);
    addToast(`Session #${activeSessionId} deleted`, 'info');
    setActiveSessionId(null);
    setActiveSessionObj(null);
    setCurrentFrames([]);
    setSelectedFrameId(null);
    setCheckedFrameIds(new Set());
    await loadSessions();
  }, [activeSessionId, loadSessions, addToast]);

  const handleImportClick = useCallback(() => {
    if (importFileInputRef.current) {
      importFileInputRef.current.click();
    }
  }, []);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const jsonContent = evt.target?.result as string;
        const newId = await importSessionJSON(jsonContent);
        addToast(`Imported session successfully as #${newId}`, 'success');
        const sessionList = await getSessions();
        setSessions(sessionList);
        const importedSession = sessionList.find(s => s.id === newId);
        if (importedSession) {
          await selectSession(importedSession);
        }
      } catch (err: any) {
        addToast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);

    e.target.value = '';
  }, [selectSession, addToast]);

  const noSessions = sessions.length === 0;

  return (
    <div className="dashboard-layout" ref={containerRef}>

      {/* Sidebar: Recording Sessions */}
      <div className="sidebar" style={{ width: `${sidebarWidth}px` }}>
        <div className="sidebar-header">
          <div className="sidebar-title">Recorded Sessions</div>
          <button
            className="btn btn-secondary"
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem' }}
            onClick={handleImportClick}
          >
            + Import
          </button>
        </div>

        <div className="session-list">
          {noSessions ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 1rem', fontSize: '0.8rem' }}>
              No recorded sessions in database
            </div>
          ) : (
            sessions.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                isActive={s.id === activeSessionId}
                onClick={() => selectSession(s)}
              />
            ))
          )}
        </div>
      </div>

      {/* Resizer: Sidebar / Main View */}
      <div
        className={`resizer ${activeResizer === 'left' ? 'resizing' : ''}`}
        onPointerDown={handleLeftPointerDown}
        onDoubleClick={handleResetSidebar}
        title="Drag to resize sidebar (Double-click to reset)"
      />

      {/* Main View: STOMP Frame Feed */}
      <div className="main-view">
        <div className="top-bar">
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {activeSessionObj
                ? `#${activeSessionObj.id} — ${activeSessionObj.name}`
                : (noSessions ? 'No Sessions' : 'Select a session')}
            </h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
              {activeSessionObj
                ? `${activeSessionObj.tabUrl || 'Direct'} • ${currentFrames.length} frames`
                : 'Inspect recorded STOMP frames'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              className="search-input"
              placeholder="Filter by destination..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />

            {/* Add New Frame */}
            <button
              className="btn btn-secondary"
              style={{ padding: '0.45rem 0.8rem', fontSize: '0.75rem', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
              disabled={!activeSessionId}
              onClick={handleAddNewFrame}
              title="Add a new STOMP frame with recursive JSON payload to this session"
            >
              ➕ Add Message
            </button>

            {/* Replay Selected Frames */}
            <button
              className="btn btn-cyan"
              style={{ padding: '0.45rem 0.8rem', fontSize: '0.75rem' }}
              disabled={checkedFrameIds.size === 0 || isReplayingSelected}
              onClick={handleReplaySelected}
            >
              {replayBtnText}
            </button>

            {/* Delete Selected Frames (when frames are checked) */}
            {checkedFrameIds.size > 0 ? (
              <button
                className="btn btn-red"
                style={{ padding: '0.45rem 0.8rem', fontSize: '0.75rem' }}
                onClick={handleDeleteCheckedFrames}
                title="Delete only the selected frames from this recording"
              >
                🗑 Delete Frames ({checkedFrameIds.size})
              </button>
            ) : (
              /* Delete Entire Session */
              <button
                className="btn btn-secondary"
                style={{ padding: '0.45rem 0.8rem', fontSize: '0.75rem', color: 'var(--accent-red)', borderColor: 'rgba(229, 83, 61, 0.4)' }}
                disabled={!activeSessionId}
                onClick={handleDeleteSession}
                title="Delete entire recording session"
              >
                Delete Session
              </button>
            )}
          </div>
        </div>

        <FrameTable
          frames={currentFrames}
          searchFilter={searchFilter}
          selectedFrameId={selectedFrameId}
          checkedFrameIds={checkedFrameIds}
          onFrameSelect={handleFrameSelect}
          onFrameCheck={handleFrameCheck}
          onSelectAll={handleSelectAll}
        />
      </div>

      {/* Resizer: Main View / Inspector */}
      <div
        className={`resizer ${activeResizer === 'right' ? 'resizing' : ''}`}
        onPointerDown={handleRightPointerDown}
        onDoubleClick={handleResetInspector}
        title="Drag to resize inspector (Double-click to reset)"
      />

      {/* Inspector Panel: Frame Detail */}
      <FrameInspector
        style={{ width: `${inspectorWidth}px` }}
        frame={selectedFrame}
        onSavePayload={handleSavePayload}
        onReplayFrame={handleReplayFrame}
        onDeleteFrame={handleDeleteSingleFrame}
      />

      {/* Hidden file input for import */}
      <input
        type="file"
        ref={importFileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
