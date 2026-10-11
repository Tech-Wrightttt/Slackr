import React from 'react';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  shimmerWidth?: number;
  /** Solid text color under the shine; without it only the shine band is visible */
  baseColor?: string;
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 4,
  className = '',
  shimmerWidth = 100,
  baseColor,
}) => {
  const animationDuration = `${speed}s`;

  return (
    <span
      className={`inline-block text-transparent bg-clip-text ${disabled ? '' : 'animate-shine'} ${className}`}
      style={{
        backgroundImage: baseColor
          ? `linear-gradient(120deg, transparent 40%, rgba(255, 255, 255, 0.75) 50%, transparent 60%), linear-gradient(${baseColor}, ${baseColor})`
          : 'linear-gradient(120deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 50%, rgba(255, 255, 255, 0) 100%)',
        backgroundSize: baseColor ? `${shimmerWidth}% 100%, 100% 100%` : `${shimmerWidth}% 100%`,
        WebkitBackgroundClip: 'text',
        animationDuration: animationDuration,
      }}
    >
      {text}
    </span>
  );
};
