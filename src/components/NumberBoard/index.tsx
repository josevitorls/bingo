import React from 'react';

interface NumberBoardProps {
  drawnNumbers: number[];
  rangeMin?: number;
  rangeMax?: number;
  lastDrawn?: number | null;
}

export const NumberBoard: React.FC<NumberBoardProps> = ({
  drawnNumbers,
  rangeMin = 1,
  rangeMax = 75,
  lastDrawn,
}) => {
  const allNumbers = Array.from(
    { length: rangeMax - rangeMin + 1 },
    (_, i) => i + rangeMin
  );

  // Show up to 75 numbers in a grid; if more, paginate or truncate
  const displayNumbers = allNumbers.slice(0, 75);

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-1 justify-center">
        {displayNumbers.map((num) => {
          const isDrawn = drawnNumbers.includes(num);
          const isLast = num === lastDrawn;

          return (
            <div
              key={num}
              className={`
                w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center
                text-xs sm:text-sm font-bold transition-all duration-300
                ${isLast
                  ? 'scale-125 ring-2 ring-yellow-400'
                  : ''}
                ${isDrawn
                  ? 'bg-green-600 text-white'
                  : 'bg-white/10 text-white/40'}
              `}
            >
              {num}
            </div>
          );
        })}
      </div>
    </div>
  );
};
