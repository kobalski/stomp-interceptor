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
              <th className="th-checkbox">
                <input type="checkbox" disabled />
              </th>
              <th className="th-index">#</th>
              <th className="th-time">Time</th>
              <th className="th-dir">Dir</th>
              <th className="th-cmd">Command</th>
              <th className="th-dest">Destination</th>
              <th className="th-size">Size</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem 1rem' }}>
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
            <th className="th-checkbox">
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
            <th className="th-index">#</th>
            <th className="th-time">Time</th>
            <th className="th-dir">Dir</th>
            <th className="th-cmd">Command</th>
            <th className="th-dest">Destination</th>
            <th className="th-size">Size</th>
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
                <td className="td-checkbox">
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
                <td className="td-index">{index + 1}</td>
                <td className="td-time">{timeStr}</td>
                <td className="td-dir"><DirectionTag direction={f.direction} /></td>
                <td className="td-cmd">{f.stompCommand}</td>
                <td className="td-dest" title={f.destination || '-'}>
                  {f.destination || '-'}
                </td>
                <td className="td-size">{size} B</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
