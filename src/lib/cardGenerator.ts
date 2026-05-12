import type { BingoCardData } from '../types';

/**
 * Generate a classic 5x5 BINGO card.
 * For range 1-75: B=1-15, I=16-30, N=31-45, G=46-60, O=61-75
 * For custom ranges: divide proportionally into 5 bands.
 * FREE cell at center [2][2] (0-indexed), always marked.
 */
export function generateCard(
  rangeMin = 1,
  rangeMax = 75
): BingoCardData {
  const totalNumbers = rangeMax - rangeMin + 1;
  const bandSize = Math.floor(totalNumbers / 5);

  const numbers: number[][] = [];
  const marked: boolean[][] = [];

  for (let col = 0; col < 5; col++) {
    const bandMin = rangeMin + col * bandSize;
    const bandMax =
      col === 4 ? rangeMax : rangeMin + (col + 1) * bandSize - 1;

    const pool = shuffle(range(bandMin, bandMax)).slice(0, 5).sort((a, b) => a - b);
    numbers.push(pool);
    marked.push([false, false, false, false, false]);
  }

  // Transpose: numbers[col][row] → grid[row][col]
  const grid: number[][] = [];
  const markedGrid: boolean[][] = [];

  for (let row = 0; row < 5; row++) {
    grid.push([]);
    markedGrid.push([]);
    for (let col = 0; col < 5; col++) {
      grid[row].push(numbers[col][row]);
      markedGrid[row].push(false);
    }
  }

  // FREE cell at center [2][2]
  grid[2][2] = 0;
  markedGrid[2][2] = true;

  return { numbers: grid, marked: markedGrid };
}

function range(min: number, max: number): number[] {
  const arr: number[] = [];
  for (let i = min; i <= max; i++) arr.push(i);
  return arr;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  const buf = new Uint32Array(a.length);
  crypto.getRandomValues(buf);
  for (let i = a.length - 1; i > 0; i--) {
    const j = buf[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Compute a SHA-256 hash of the card's numbers for deduplication.
 */
export async function hashCard(card: BingoCardData): Promise<string> {
  const text = JSON.stringify(card.numbers);
  const encoded = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
