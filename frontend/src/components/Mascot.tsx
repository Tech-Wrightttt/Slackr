import React from 'react';
import { useStore } from '../store/useStore';

export type MascotPose = 'studying' | 'success' | 'loading' | 'error' | 'bug';

// Koala poses recolored per theme, like BrandLogo. Decorative unless given alt text.
export const Mascot: React.FC<{ pose: MascotPose; className?: string; alt?: string }> = ({
  pose,
  className = '',
  alt = '',
}) => {
  const theme = useStore((s) => s.theme);
  return (
    <img
      src={`/mascot/koala-${pose}-${theme === 'dark' ? 'dark' : 'light'}.svg`}
      alt={alt}
      width={512}
      height={512}
      draggable={false}
      className={`select-none object-contain ${className}`}
    />
  );
};
