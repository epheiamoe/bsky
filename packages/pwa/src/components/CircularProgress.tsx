import React from 'react';

interface CircularProgressProps {
  value: number;      // current character count
  max?: number;       // max characters (default 300)
  size?: number;      // svg size in px (default 20)
  strokeWidth?: number;
}

export function CircularProgress({
  value,
  max = 300,
  size = 20,
  strokeWidth = 2,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const dashoffset = circumference * (1 - progress);

  let colorClass = 'text-text-secondary';
  if (value > max) {
    colorClass = 'text-red-500';
  } else if (value >= max * 0.93) {
    colorClass = 'text-yellow-500';
  }

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className={`transform -rotate-90 ${colorClass}`}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="opacity-20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      {value > max && (
        <span className="absolute text-[8px] font-bold text-red-500">{value - max}</span>
      )}
    </div>
  );
}
