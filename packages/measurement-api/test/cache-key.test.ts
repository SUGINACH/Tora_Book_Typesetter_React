/**
 * מבחני מפתח מטמון קנוני (שלב 22; אפיון §6.4, §17.3).
 * השער: המפתח תלוי בכל מה שמשפיע על התוצאה ובו בלבד — אין זמן,
 * אין סדר קריאות, אין מיקום ב-batch.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalShapeCacheKey } from '../src/cache-key.js';
import type { FontFaceKey, ShapeRequest, ShapingAtom } from '../src/provider.js';

const FONT: FontFaceKey = Object.freeze({
  fontId: 'font:v1|aaed3fc950d2d71a3815160b3ae98d09088019df7306f4d935e7fc83df35c67e',
  contentSha256: 'aaed3fc950d2d71a3815160b3ae98d09088019df7306f4d935e7fc83df35c67e',
  family: 'assistant',
  weight: 400,
  style: 'normal',
});

const IDENTITY = Object.freeze({
  providerId: 'harfbuzz-wasm',
  providerVersion: '8.5.0-pinned',
  wasmSha256: 'aaed3fc950d2d71a3815160b3ae98d09088019df7306f4d935e7fc83df35c67e',
  environmentHash: 'env-v1',
});

function atom(i: number, text: string): ShapingAtom {
  return Object.freeze({
    id: `atom:v1|doc|body|${i}+${i + 1}||0` as ShapingAtom['id'],
    text,
    script: 'hebrew',
    bidiLevel: 1,
    breakBefore: i === 0 ? 'forbidden' : 'allowed',
  });
}

function request(over: Partial<ShapeRequest> = {}): ShapeRequest {
  return Object.freeze({
    atoms: [atom(0, 'א'), atom(1, 'ב'), atom(2, 'ג')],
    font: FONT,
    fontSizeLu: 12 * 65536,
    direction: 'rtl',
    language: 'he',
    features: { kern: true },
    letterSpacingLu: 0,
    ...over,
  });
}

describe('canonicalShapeCacheKey — קנוניות', () => {
  it('אותה בקשה ⇐ אותו מפתח, תמיד', () => {
    expect(canonicalShapeCacheKey(IDENTITY, request())).toBe(
      canonicalShapeCacheKey(IDENTITY, request()),
    );
  });
  it('סדר מפתחות features אינו משנה', () => {
    const a = request({ features: { kern: true, liga: false, mark: true } });
    const b = request({ features: { mark: true, kern: true, liga: false } });
    expect(canonicalShapeCacheKey(IDENTITY, a)).toBe(canonicalShapeCacheKey(IDENTITY, b));
  });
  it('שינוי כל רכיב השפעה מחליף מפתח', () => {
    const base = canonicalShapeCacheKey(IDENTITY, request());
    expect(canonicalShapeCacheKey(IDENTITY, request({ fontSizeLu: 13 * 65536 }))).not.toBe(base);
    expect(canonicalShapeCacheKey(IDENTITY, request({ direction: 'ltr' }))).not.toBe(base);
    expect(canonicalShapeCacheKey(IDENTITY, request({ language: 'en' }))).not.toBe(base);
    expect(canonicalShapeCacheKey(IDENTITY, request({ letterSpacingLu: 1 }))).not.toBe(base);
    expect(canonicalShapeCacheKey(IDENTITY, request({ features: { kern: false } }))).not.toBe(base);
    // גופן: אותה משפחה, bytes אחרים (contentSha256 שונה) — מפתח אחר
    expect(
      canonicalShapeCacheKey(IDENTITY, request({ font: { ...FONT, contentSha256: 'b'.repeat(64) } })),
    ).not.toBe(base);
    // גודל הפנים שונה — מפתח אחר
    expect(
      canonicalShapeCacheKey(IDENTITY, request({ font: { ...FONT, weight: 700 } })),
    ).not.toBe(base);
    // provider שונה — מפתח אחר (גם environmentHash בלבד)
    expect(
      canonicalShapeCacheKey({ ...IDENTITY, environmentHash: 'env-v2' }, request()),
    ).not.toBe(base);
  });
  it('זהות האטום נכנסת למפתח: אטומים שונים ⇐ מפתח שונה', () => {
    const base = canonicalShapeCacheKey(IDENTITY, request());
    const otherAtoms = [
      { ...atom(0, 'א'), id: 'atom:v1|doc|body|0+1||1' as ShapingAtom['id'] },
      atom(1, 'ב'),
      atom(2, 'ג'),
    ];
    expect(canonicalShapeCacheKey(IDENTITY, request({ atoms: otherAtoms }))).not.toBe(base);
  });
  it('script/breakBefore אינם במפתח (אינם משפיעים על shaping)', () => {
    const variant = [
      { ...atom(0, 'א'), script: 'other' as const, breakBefore: 'required' as const },
      atom(1, 'ב'),
      atom(2, 'ג'),
    ];
    expect(canonicalShapeCacheKey(IDENTITY, request({ atoms: variant }))).toBe(
      canonicalShapeCacheKey(IDENTITY, request()),
    );
  });
  it('property: אין תלות בסדר יצירת הבקשות — אותן בקשות בכל סדר החזרה ⇐ אותם מפתחות', () => {
    const textArb = fc.stringMatching(/^[א-ת]{1,5}$/);
    const reqArb = fc.record({
      text: textArb,
      size: fc.integer({ min: 1, max: 1000 }),
    });
    fc.assert(
      fc.property(fc.array(reqArb, { minLength: 1, maxLength: 10 }), (items) => {
        const mk = (r: { text: string; size: number }): string => {
          const atoms = [...r.text].map((ch, i) => atom(i, ch));
          return canonicalShapeCacheKey(IDENTITY, request({ atoms, fontSizeLu: r.size }));
        };
        const keys = items.map(mk);
        const reversed = [...items].reverse().map(mk).reverse();
        return keys.every((k, i) => k === reversed[i]);
      }),
      { numRuns: 300 },
    );
  });
  it('בקשה לא חוקית נדחית עם קוד מקוטלג (אין מפתח לקלט פסול)', () => {
    expect(() => canonicalShapeCacheKey(IDENTITY, request({ atoms: [] }))).toThrowError(
      /errors\.shape\.INVALID_REQUEST/,
    );
  });
});
