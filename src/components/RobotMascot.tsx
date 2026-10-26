import React from 'react';

interface RobotMascotProps {
  mood?: 'idle' | 'thinking' | 'success' | 'warning' | 'cheer';
  message?: string;
  className?: string;
}

export const RobotMascot: React.FC<RobotMascotProps> = ({
  mood = 'idle',
  message,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Robot SVG */}
      <div className="relative shrink-0 w-12 h-12 md:w-14 md:h-14">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full drop-shadow-md transition-transform duration-300 hover:scale-105"
        >
          {/* Antenna */}
          <line x1="50" y1="20" x2="50" y2="8" stroke="#4F41A6" strokeWidth="4" strokeLinecap="round" />
          <circle
            cx="50"
            cy="7"
            r="5"
            fill={mood === 'success' ? '#16A34A' : mood === 'warning' ? '#F59E0B' : '#4F41A6'}
            className={mood === 'thinking' ? 'animate-ping' : ''}
          />

          {/* Ears */}
          <rect x="18" y="32" width="6" height="12" rx="3" fill="#6A5BBA" />
          <rect x="76" y="32" width="6" height="12" rx="3" fill="#6A5BBA" />

          {/* Head */}
          <rect x="22" y="18" width="56" height="42" rx="10" fill="#2B245E" />

          {/* Face Screen */}
          <rect x="26" y="22" width="48" height="34" rx="6" fill="#E8E5F7" />

          {/* Eyes */}
          {mood === 'cheer' || mood === 'success' ? (
            <>
              {/* Happy curved eyes */}
              <path d="M 33 38 Q 38 32 43 38" stroke="#2B245E" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M 57 38 Q 62 32 67 38" stroke="#2B245E" strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
          ) : mood === 'thinking' ? (
            <>
              {/* Rolling / thinking eyes */}
              <circle cx="38" cy="36" r="4" fill="#4F41A6" />
              <circle cx="62" cy="34" r="4" fill="#4F41A6" />
            </>
          ) : mood === 'warning' ? (
            <>
              {/* Surprised eyes */}
              <circle cx="38" cy="35" r="5" fill="#D97706" />
              <circle cx="62" cy="35" r="5" fill="#D97706" />
            </>
          ) : (
            <>
              {/* Normal friendly eyes */}
              <circle cx="38" cy="35" r="4" fill="#2B245E" />
              <circle cx="62" cy="35" r="4" fill="#2B245E" />
              <circle cx="40" cy="33" r="1.5" fill="#FFFFFF" />
              <circle cx="64" cy="33" r="1.5" fill="#FFFFFF" />
            </>
          )}

          {/* Mouth */}
          {mood === 'success' || mood === 'cheer' ? (
            <path d="M 40 46 Q 50 53 60 46" stroke="#16A34A" strokeWidth="3" fill="none" strokeLinecap="round" />
          ) : mood === 'thinking' ? (
            <line x1="43" y1="46" x2="57" y2="46" stroke="#4F41A6" strokeWidth="3" strokeLinecap="round" />
          ) : mood === 'warning' ? (
            <ellipse cx="50" cy="46" rx="4" ry="2" fill="#D97706" />
          ) : (
            <path d="M 42 45 Q 50 50 58 45" stroke="#2B245E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          )}

          {/* Body */}
          <rect x="28" y="63" width="44" height="28" rx="8" fill="#4F41A6" />

          {/* Chest Gauge */}
          <rect x="36" y="69" width="28" height="14" rx="4" fill="#FFFFFF" />
          <line x1="40" y1="76" x2="60" y2="76" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />

          {/* Arms */}
          <rect x="14" y="66" width="10" height="6" rx="3" fill="#42358F" />
          <rect x="76" y="66" width="10" height="6" rx="3" fill="#42358F" />
        </svg>
      </div>

      {/* Speech message bubble if provided */}
      {message && (
        <div className="relative bg-white border border-blue-200 text-slate-800 text-xs md:text-sm px-3.5 py-2 rounded-xl shadow-xs max-w-sm">
          <div className="absolute top-1/2 -left-2 -translate-y-1/2 w-0 h-0 border-t-6 border-t-transparent border-b-6 border-b-transparent border-r-8 border-r-blue-200" />
          <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-0 h-0 border-t-5 border-t-transparent border-b-5 border-b-transparent border-r-7 border-r-white" />
          {message}
        </div>
      )}
    </div>
  );
};
