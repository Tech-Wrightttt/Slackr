import React from 'react';
import { useStore } from '../store/useStore';

// Koala line art recolored per theme (design spec §4): forest olive on paper, luminous lime on obsidian.
// Both files are transparent PNGs precached by the service worker.
const LOGO_SRC = {
  light: '/brand/logo-light.png',
  dark: '/brand/logo-dark.png',
} as const;

export const BrandLogo: React.FC<{ className?: string; alt?: string }> = ({ className = '', alt = 'Slackr logo' }) => {
  const theme = useStore((s) => s.theme);
  return <img src={LOGO_SRC[theme]} alt={alt} className={`object-contain select-none ${className}`} draggable={false} />;
};
