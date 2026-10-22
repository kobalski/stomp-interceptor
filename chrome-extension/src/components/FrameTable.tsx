import React, { useMemo } from 'react';
import DirectionTag from './DirectionTag';
import { FrameRecord } from '../types';

interface FrameTableProps {
  frames: FrameRecord[];
  searchFilter: string;
  selectedFrameId: number | null;
  checkedFrameIds: Set<number>;
  onFrameSelect: (frame: FrameRecord) => void;
  onFrameCheck: (frameId: number, isChecked: boolean) => void;
  onSelectAll: (isChecked: boolean, filteredFrames: FrameRecord[]) => void;
}

export default function FrameTable({
  frames,
  searchFilter,
  selectedFrameId,
  checkedFrameIds,
  onFrameSelect,
  onFrameCheck,
  onSelectAll,
}: FrameTableProps) {
  const filteredFrames = useMemo(() => {
    const filter = (searchFilter || '').trim().toLowerCase();
    if (!filter) return frames;
    return frames.filter(
      f => f.destination && f.destination.toLowerCase().includes(filter)
    );
  }, [frames, searchFilter]);

  const allChecked = filteredFrames.length > 0 && filteredFrames.every(f => f.id !== undefined && checkedFrameIds.has(f.id));
  const someChecked = !allChecked && filteredFrames.some(f => f.id !== undefined && checkedFrameIds.has(f.id));

  const handleSelectAllChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSelectAll(e.target.checked, filteredFrames);
  };

  if (filteredFrames.length === 0) {
    return (
      <div className="frame-table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: '36px' }}>
                <input type="checkbox" disabled />
              </th>
              <th>#</th>
              <th>Time</th>
              <th>Dir</th>
              <th>Command</th>
              <th>Destination</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                No matching frames found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="frame-table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: '36px' }}>
              <input
                type="checkbox"
                id="selectAllFrames"
                checked={allChecked}
                ref={el => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={handleSelectAllChange}
              />
            </th>
            <th>#</th>
            <th>Time</th>
            <th>Dir</th>
            <th>Command</th>
            <th>Destination</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          {filteredFrames.map((f, index) => {
            const timeStr = new Date(f.timestamp).toLocaleTimeString();
            const size = (f.body || '').length;
            const isSelected = f.id === selectedFrameId;
            const isChecked = f.id !== undefined && checkedFrameIds.has(f.id);

            return (
              <tr
                key={f.id || index}
                className={isSelected ? 'selected' : ''}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.tagName === 'INPUT') return;
                  onFrameSelect(f);
                }}
              >
                <td style={{ width: '36px' }}>
                  <input
                    type="checkbox"
                    className="frame-checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (f.id !== undefined) {
                        onFrameCheck(f.id, e.target.checked);
                      }
                    }}
                  />
                </td>
                <td>{index + 1}</td>
                <td>{timeStr}</td>
                <td><DirectionTag direction={f.direction} /></td>
                <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{f.stompCommand}</td>
                <td style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                  {f.destination || '-'}
                </td>
                <td>{size} B</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
