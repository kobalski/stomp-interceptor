import React from 'react';
import { Session } from '../types';

interface SessionDropdownProps {
  sessions: Session[];
  value: string | number;
  onChange: (val: string) => void;
}

export default function SessionDropdown({ sessions, value, onChange }: SessionDropdownProps) {
  if (sessions.length === 0) {
    return (
      <select disabled>
        <option value="">No recorded sessions</option>
      </select>
    );
  }

  return (
    <select id="sessionSelect" value={value} onChange={e => onChange(e.target.value)}>
      {sessions.map(s => {
        const dateStr = new Date(s.startTime).toLocaleTimeString();
        return (
          <option key={s.id} value={s.id}>
            #{s.id} - {s.name} ({s.frameCount || 0} frames - {dateStr})
          </option>
        );
      })}
    </select>
  );
}
