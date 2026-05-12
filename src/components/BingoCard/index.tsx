import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { checkBingo, getCellHighlight } from '../../lib/bingoChecker';
import type { BingoCardData } from '../../types';

interface BingoCardProps {
  card: BingoCardData;
  drawnNumbers?: number[];
  onCellClick?: (row: number, col: number, number: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const COLUMN_LABELS = ['B', 'I', 'N', 'G', 'O'];

export const BingoCard: React.FC<BingoCardProps> = ({
  card,
  drawnNumbers = [],
  onCellClick,
  readonly = false,
  size = 'md',
}) => {
  const { t } = useTranslation();
  const check = checkBingo(card);

  const isComplete = check.isFullCard;

  const handleClick = useCallback(
    (row: number, col: number) => {
      if (readonly) return;
      if (row === 2 && col === 2) return; // FREE cell
      if (onCellClick) {
        onCellClick(row, col, card.numbers[row][col]);
      }
    },
    [card.numbers, onCellClick, readonly]
  );

  const cellSizeClass =
    size === 'sm'
      ? 'text-xs sm:text-sm'
      : size === 'lg'
      ? 'text-base sm:text-lg md:text-xl'
      : 'text-sm sm:text-base';

  const headerSizeClass =
    size === 'sm'
      ? 'text-sm sm:text-base'
      : size === 'lg'
      ? 'text-lg sm:text-xl'
      : 'text-base sm:text-lg';

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Card container */}
      <div
        className={`rounded-2xl overflow-hidden shadow-2xl ${
          isComplete ? 'animate-full-bingo' : ''
        }`}
        style={{ background: 'var(--dark)' }}
      >
        {/* Column headers B I N G O */}
        <div className="grid grid-cols-5" style={{ background: 'var(--dark)' }}>
          {COLUMN_LABELS.map((label) => (
            <div
              key={label}
              className={`text-center font-title py-2 ${headerSizeClass}`}
              style={{ color: 'var(--gold)' }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="p-2 grid grid-cols-5 gap-1" style={{ background: '#f8f8f8' }}>
          {card.numbers.map((row, rowIdx) =>
            row.map((num, colIdx) => {
              const isFree = rowIdx === 2 && colIdx === 2;
              const isMarked = card.marked[rowIdx][colIdx];
              const highlight = getCellHighlight(rowIdx, colIdx, check);

              let cellClass = 'bingo-cell ';
              if (isFree) {
                cellClass += 'free-cell';
              } else if (isMarked) {
                cellClass += 'marked';
              } else {
                cellClass += 'unmarked';
              }

              if (highlight === 'partial' && isMarked) {
                cellClass += ' partial';
              } else if (highlight === 'full') {
                cellClass += ' full';
              }

              return (
                <button
                  key={`${rowIdx}-${colIdx}`}
                  className={`${cellClass} ${cellSizeClass} font-bold w-full`}
                  onClick={() => handleClick(rowIdx, colIdx)}
                  disabled={readonly || isFree}
                  aria-label={
                    isFree
                      ? t('game.freeCell')
                      : `${COLUMN_LABELS[colIdx]}${num}${isMarked ? ' (marcado)' : ''}`
                  }
                >
                  {isFree ? (
                    <span className="text-base sm:text-lg">🪶</span>
                  ) : (
                    <span>{num}</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Complete bingo banner */}
        {isComplete && (
          <div
            className="text-center py-3 font-title text-lg sm:text-xl animate-gold-glow"
            style={{ color: 'var(--gold)', background: 'var(--dark)' }}
          >
            {t('game.bingo_complete')}
          </div>
        )}
      </div>
    </div>
  );
};
