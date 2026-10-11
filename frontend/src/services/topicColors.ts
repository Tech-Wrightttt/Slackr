import type React from 'react';
import { REGISTERED_TOPICS } from './analyticsEngine';

// Accent hues drawn from the design system (forest primary, sage, teal tertiary,
// sky, amber, indigo, emerald, rose). Each topic keeps the same hue everywhere
// it appears; `.topic-*` classes in index.css derive tints and readable text
// for both themes from the single `--topic` value.
const TOPIC_HUES = [
  '#4F8F2A', // forest olive
  '#2F8F8F', // teal
  '#0EA5E9', // sky
  '#6366F1', // indigo
  '#D97706', // amber
  '#E11D48', // rose
  '#10B981', // emerald
  '#8B5CF6', // violet
  '#65A30D', // lime
  '#0891B2', // cyan
];

const hashString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

// Known syllabus topics cycle through the palette in order so hues spread evenly;
// anything unregistered falls back to a stable hash
export const topicHue = (topic: string) => {
  const i = REGISTERED_TOPICS.indexOf(topic);
  return TOPIC_HUES[(i === -1 ? hashString(topic) : i) % TOPIC_HUES.length]!;
};

/** Inline style that sets `--topic` for the `.topic-*` utility classes. */
export const topicStyle = (topic: string) => ({ '--topic': topicHue(topic) }) as React.CSSProperties;

/** `object-oriented-programming` -> `Object Oriented Programming` */
export const topicLabel = (topic: string) =>
  topic
    .split('-')
    .map((w) => (w.length <= 2 && w !== 'it' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
