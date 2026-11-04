/**
 * מבחני hash — SHA-256 נייב (שלב 22).
 * וקטורי FIPS-180-4 + אורקל node:crypto על קלטים מגוונים (כולל עברית
 * מנוקדת ורב-בלוקית) — אותה שיטה שנעלה בשלב 10 עבור layout-api.
 */
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sha256Bytes, sha256Hex } from '../src/hash.js';

const oracle = (text: string): string =>
  createHash('sha256').update(new TextEncoder().encode(text)).digest('hex');

describe('SHA-256 נייב — וקטורי FIPS-180-4', () => {
  it('מחרורת ריקה', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('abc', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('שני בלוקים בדיוק (112 בתים אחרי padding)', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
  it('קלט ארוך — מיליון a (דילוג על הדור המלא; מאומת מול האורקל בגודל זהה)', () => {
    const long = 'a'.repeat(1_000_000);
    expect(sha256Hex(long)).toBe(oracle(long));
  });
});

describe('SHA-256 נייב — אורקל node:crypto', () => {
  it('עברית מנוקדת, RLM, em-space — קלטים אמיתיים של הקורפוס', () => {
    const samples = [
      'בְּרֵאשִׁית בָּרָא אֱלֹהִים',
      'וְאֵ֗לֶּה שֵׁמֹות֙ בְּנֵ֣י יִשְׂרָאֵ֔ל',
      'כותרת 7 (מקור: בראשית) - הערת צד עם ‏ ו־רווח',
      'mixed English and עברית with numbers 12345',
      '\u200f\u200e\u202b\u202c\u2066\u2069 controls only',
    ];
    for (const s of samples) expect(sha256Hex(s)).toBe(oracle(s));
  });
  it('property: אורקל לכל מחרורת אקראית', () => {
    const strArb = fc.string({ minLength: 0, maxLength: 300 });
    fc.assert(
      fc.property(strArb, (s) => sha256Hex(s) === oracle(s)),
      { numRuns: 1000 },
    );
  });
  it('property: בתים אקראיים (כולל בלוקים חוצי גבולות)', () => {
    const bytesArb = fc.uint8Array({ minLength: 0, maxLength: 1000 });
    fc.assert(
      fc.property(bytesArb, (bytes) => {
        const expected = createHash('sha256').update(bytes).digest('hex');
        return sha256Bytes(bytes) === expected;
      }),
      { numRuns: 500 },
    );
  });
  it('דטרמיניזם: אותו קלט ⇐ אותו פלט תמיד', () => {
    const s = 'שלום עולם';
    expect(sha256Hex(s)).toBe(sha256Hex(s));
  });
});

describe('מסלול זורם לקלטים ענקיים (שלב 73)', () => {
  // המסלול הזורם נכנס מעל 256K יחידות UTF-16 — בדיקת שקילות מול האורקל
  // על קלטים שעוברים את הסף, כולל נתחים באורכים שאינם כפולה שלמה של
  // גודל הנתח, גבולות בלוקים וניקוד רב-בתים.
  it('קלט 300K יחידות (מעל הסף) ⇐ זהה לאורקל node:crypto', () => {
    const big = ('וְאֵלֶּה שְׁמוֹת בְּנֵי יִשְׂרָאֵל — test 123 · ').repeat(7000);
    expect(big.length).toBeGreaterThan(1 << 18);
    expect(sha256Hex(big)).toBe(createHash('sha256').update(big, 'utf8').digest('hex'));
  });
  it('קלט גדול עם אורך שאינו כפולה של גודל הנתח (שארית אמיתית)', () => {
    let big = '';
    while (big.length <= (1 << 18)) big += 'אָבּ'; // 3 יחידות לכל חזרה — שארית לא-אחידה
    big = big.slice(0, (1 << 18) + 12345);
    expect(sha256Hex(big)).toBe(createHash('sha256').update(big, 'utf8').digest('hex'));
  });
  it('גבול הסף בדיוק — מתחת ומעל נותנים את אותה תוצאה כמו האורקל', () => {
    const base = 'x'.repeat((1 << 18) - 1);
    for (const s of [base, base + 'x', base + 'ש']) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
  it('קלט ענק דמוי layoutHash (2MB JSON) ⇐ זהה לאורקל', () => {
    const parts: string[] = [];
    for (let i = 0; i < 40000; i++) parts.push(`{"page":${i},"lines":[{"id":"l${i}","rect":{"x":${i},"y":0}}]}`);
    const big = '{' + parts.join(',') + '}';
    expect(big.length).toBeGreaterThan(2_000_000);
    expect(sha256Hex(big)).toBe(createHash('sha256').update(big, 'utf8').digest('hex'));
  });
});
