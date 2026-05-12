import React, { useEffect, useRef } from 'react';

interface NumberBoardProps {
  drawnNumbers: number[];
  rangeMin?: number;
  rangeMax?: number;
  lastDrawn?: number | null;
}

export const NumberBoard: React.FC<NumberBoardProps> = React.memo(({
  drawnNumbers,
  rangeMin = 1,
  rangeMax = 75,
  lastDrawn,
}) => {
  const newNumRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (newNumRef.current) {
      newNumRef.current.classList.remove('animate-number-pop');
      void newNumRef.current.offsetWidth; // reflow
      newNumRef.current.classList.add('animate-number-pop');
    }
  }, [lastDrawn]);

  if (drawnNumbers.length === 0) return null;

  // Group drawn numbers by decade (rangeMin to rangeMax)
  const decadeSize = 10;
  const firstDecade = Math.floor(rangeMin / decadeSize) * decadeSize;

  const groups: { label: string; numbers: number[] }[] = [];
  for (let start = firstDecade; start <= rangeMax; start += decadeSize) {
    const end = Math.min(start + decadeSize - 1, rangeMax);
    const nums = drawnNumbers
      .filter((n) => n >= Math.max(start, rangeMin) && n <= end)
      .sort((a, b) => a - b);
    if (nums.length > 0) {
      const labelStart = Math.max(start, rangeMin);
      groups.push({ label: `${String(labelStart).padStart(2, '0')}–${String(end).padStart(2, '0')}`, numbers: nums });
    }
  }

  return (
    <div className="w-full space-y-1.5">
      {groups.map(({ label, numbers }) => (
        <div key={label} className="flex items-center gap-2">
          {/* Decade label */}
          <span className="text-white/30 text-xs w-12 shrink-0 tabular-nums">{label}</span>
          {/* Numbers in this decade */}
          <div className="flex flex-wrap gap-1">
            {numbers.map((n) => {
              const isLast = n === lastDrawn;
              return (
                <span
                  key={n}
                  ref={isLast ? newNumRef : null}
                  className={`
                    inline-flex items-center justify-center rounded-lg font-bold tabular-nums
                    text-sm px-2 py-0.5 min-w-[2rem]
                    transition-colors duration-200
                    ${isLast
                      ? 'text-dark'
                      : 'bg-white/15 text-white'}
                  `}
                  style={isLast ? { background: 'var(--gold)', color: 'var(--dark)' } : {}}
                >
                  {n}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

NumberBoard.displayName = 'NumberBoard';
