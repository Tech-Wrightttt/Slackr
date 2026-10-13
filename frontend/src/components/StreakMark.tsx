import React from 'react';

// Eucalyptus leaf for the study streak (the koala's food, not a flame). Solid while a streak is alive, outlined at zero.
export const StreakMark: React.FC<{ active: boolean; className?: string }> = ({ active, className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={`shrink-0 ${className}`}
  >
    <path
      d="M6 18C6 10.5 10.5 6 19 5c-1 8.5-5.5 13-13 13Z"
      fill={active ? 'currentColor' : 'none'}
      fillOpacity={active ? 0.22 : undefined}
    />
    <path d="M6 18l8.5-8.5" />
    <path d="M6 18l-2 2" />
  </svg>
);

export const streakLabel = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;
