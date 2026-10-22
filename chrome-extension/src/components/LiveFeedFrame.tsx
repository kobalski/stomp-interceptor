import React from 'react';
import { FrameDirection } from '../types';

interface LiveFeedFrameProps {
  direction: FrameDirection | string;
  command: string;
  destination: string;
}

export default function LiveFeedFrame({ direction, command, destination }: LiveFeedFrameProps) {
  const className = `frame-badge ${direction.toLowerCase()}`;

  return (
    <div className={className}>
      <span><strong>{direction}</strong> {command}</span>
      <span style={{ color: 'var(--text-muted)' }}>{destination || ''}</span>
    </div>
  );
}
