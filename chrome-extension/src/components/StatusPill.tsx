import React from 'react';

interface StatusPillProps {
  isRecording: boolean;
}

export default function StatusPill({ isRecording }: StatusPillProps) {
  const className = `status-pill${isRecording ? ' recording' : ''}`;
  const text = isRecording ? 'Recording' : 'Idle';

  return <span className={className}>{text}</span>;
}
