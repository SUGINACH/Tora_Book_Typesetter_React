/**
 * FNV-1a 32-bit hash — דטרמיניסטי, מהיר, אינו קריפטוגרפי.
 * מתאים לבדיקת יציבות בין ריצות.
 */
export function fnv1a32(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // המרה ל-unsigned 32-bit ואז hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}
