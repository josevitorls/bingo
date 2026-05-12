import { supabase } from './supabase';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

/**
 * Generate a random 4-character game code using uppercase A-Z + 0-9.
 * Must contain at least 1 letter and 1 digit.
 */
export function generateCode(): string {
  const buf = new Uint8Array(4);

  while (true) {
    crypto.getRandomValues(buf);
    const chars = Array.from(buf).map((b) => CHARS[b % CHARS.length]);
    const hasLetter = chars.some((c) => LETTERS.includes(c));
    const hasDigit = chars.some((c) => DIGITS.includes(c));
    if (hasLetter && hasDigit) {
      return chars.join('');
    }
  }
}

/**
 * Generate a unique game code that doesn't already exist in the DB.
 * Retries up to 10 times before throwing.
 */
export async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const { data } = await supabase
      .from('games')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!data) {
      return code;
    }
  }
  throw new Error('Failed to generate unique game code after 10 attempts');
}
