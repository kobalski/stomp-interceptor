import React from 'react';
import { FrameDirection } from '../types';

interface DirectionTagProps {
  direction: FrameDirection | string;
}

export default function DirectionTag({ direction }: DirectionTagProps) {
  return (
    <span className={`tag ${direction.toLowerCase()}`}>
      {direction}
    </span>
  );
}
