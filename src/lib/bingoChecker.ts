import type { BingoCardData, BingoCheck, GameMode } from '../types';

/**
 * Check the current card state and return which lines/cols/diagonals are complete.
 */
export function checkBingo(card: BingoCardData): BingoCheck {
  const { marked } = card;

  const completedRows: number[] = [];
  const completedCols: number[] = [];
  const completedDiagonals: ('main' | 'anti')[] = [];

  // Check rows
  for (let r = 0; r < 5; r++) {
    if (marked[r].every(Boolean)) {
      completedRows.push(r);
    }
  }

  // Check columns
  for (let c = 0; c < 5; c++) {
    if (marked.every((row) => row[c])) {
      completedCols.push(c);
    }
  }

  // Check main diagonal (top-left → bottom-right)
  if ([0, 1, 2, 3, 4].every((i) => marked[i][i])) {
    completedDiagonals.push('main');
  }

  // Check anti-diagonal (top-right → bottom-left)
  if ([0, 1, 2, 3, 4].every((i) => marked[i][4 - i])) {
    completedDiagonals.push('anti');
  }

  // Check full card
  const isFullCard = marked.every((row) => row.every(Boolean));

  const hasPartialBingo =
    completedRows.length > 0 ||
    completedCols.length > 0 ||
    completedDiagonals.length > 0;

  const hasFullBingo = isFullCard;

  return {
    hasPartialBingo,
    hasFullBingo,
    completedRows,
    completedCols,
    completedDiagonals,
    isFullCard,
  };
}

/**
 * Determine if a bingo claim is valid given the game modes and drawn numbers.
 */
export function validateBingoClaim(
  card: BingoCardData,
  drawnNumbers: number[],
  modes: GameMode[]
): boolean {
  // Recompute marked based on drawn numbers
  const effectiveMarked: boolean[][] = card.numbers.map((row, r) =>
    row.map((num, c) => {
      if (r === 2 && c === 2) return true; // FREE cell
      return drawnNumbers.includes(num);
    })
  );

  const effectiveCard: BingoCardData = {
    numbers: card.numbers,
    marked: effectiveMarked,
  };

  const check = checkBingo(effectiveCard);

  for (const mode of modes) {
    switch (mode) {
      case 'linha':
        if (check.completedRows.length > 0) return true;
        break;
      case 'coluna':
        if (check.completedCols.length > 0) return true;
        break;
      case 'diagonal':
        if (check.completedDiagonals.length > 0) return true;
        break;
      case 'cartela_cheia':
        if (check.isFullCard) return true;
        break;
      case 'primeiro':
        // First to get any bingo — always valid if any pattern matches
        if (check.hasPartialBingo || check.isFullCard) return true;
        break;
      case 'ultimo':
        // Last card to complete — valid if full card
        if (check.isFullCard) return true;
        break;
    }
  }

  return false;
}

/**
 * Get cell highlighting class based on bingo check results.
 */
export function getCellHighlight(
  row: number,
  col: number,
  check: BingoCheck
): 'none' | 'partial' | 'full' {
  if (check.isFullCard) return 'full';

  if (
    check.completedRows.includes(row) ||
    check.completedCols.includes(col) ||
    (check.completedDiagonals.includes('main') && row === col) ||
    (check.completedDiagonals.includes('anti') && row + col === 4)
  ) {
    return 'partial';
  }

  return 'none';
}
