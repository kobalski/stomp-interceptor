import React from 'react';
import { Session } from '../types';

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}

export default function SessionCard({ session, isActive, onClick }: SessionCardProps) {
  const timeStr = new Date(session.startTime).toLocaleString();
  const className = `session-card ${isActive ? 'active' : ''}`;

  return (
    <div className={className} onClick={onClick}>
      <div className="session-name">
        #{session.id} {session.name}
      </div>
      <div className="session-meta">
        <span>{session.frameCount || 0} frames</span>
        <span>{timeStr}</span>
      </div>
    </div>
  );
}
