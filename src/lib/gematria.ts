/**
 * המרת מספר לאותיות עבריות (גימטריא).
 *
 * 1 → א, 10 → י, 15 → ט״ו, 100 → ק, 1000 → א׳
 */
export function toGematria(num: number): string {
  if (num <= 0) return '';
  if (num > 1000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    const thousandsStr = thousands === 1 ? 'א׳' : toGematria(thousands) + '׳';
    return remainder > 0 ? `${thousandsStr}${toGematria(remainder)}` : thousandsStr;
  }

  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת'];

  const h = Math.floor(num / 100);
  const t = Math.floor((num % 100) / 10);
  const o = num % 10;

  // טיפול מיוחד ב-15 (ט"ו) ו-16 (ט"ז) — נמנע מ-יה ו-יו מטעמי קדושה
  if (num === 15) return 'ט״ו';
  if (num === 16) return 'ט״ז';

  let result = '';

  // טיפול ב-400+ (ת, תק, תר, תש, תת, תתק...)
  if (num >= 400) {
    const thousandsOf400 = Math.floor(num / 400);
    for (let i = 0; i < thousandsOf400; i++) {
      result += 'ת';
    }
    const remainder = num % 400;
    if (remainder > 0) {
      result = result + toGematria(remainder);
    }
    // הוספת גרשיים אם רב-תוי
    if (result.length > 1 && !result.includes('״')) {
      const last = result.slice(-1);
      const rest = result.slice(0, -1);
      return `${rest}״${last}`;
    }
    return result;
  }

  if (h > 0) result += hundreds[Math.min(h, 4)]!;
  if (t > 0) result += tens[t]!;
  if (o > 0) result += ones[o]!;

  // הוספת גרשיים למספרים מעל יחידה אחת
  if (result.length > 1) {
    const last = result.slice(-1);
    const rest = result.slice(0, -1);
    return `${rest}״${last}`;
  }

  return result;
}
