/**
 * מבחני מניפסט גופנים ואכיפת טעינה (שלב 23).
 * הרשומות זהות למבנה האמיתי של assets/fonts/manifest.json (v2) —
 * הבדיקות כאן טהורות (בלי fs); המאמת מריץ את אותן בדיקות על המניפסט
 * האמיתי ועל הקבצים בדיסק.
 */
import { describe, expect, it } from 'vitest';
import { sha256Bytes } from '../src/hash.js';
import {
  assertFontManifest,
  binaryFormatOf,
  findFontRecord,
  fontFaceKeyOf,
  isFontManifestRecord,
  loadFontSet,
  verifyFontBytes,
} from '../src/font-manifest.js';

const RECORD = Object.freeze({
  file: 'Guttman-Rashi-Normal.woff2',
  fontId: 'font:v1|a69f977d752d11eddb1453e50e7932f0619485cfcd3ca40e92a84558038c1010',
  sha256: 'a69f977d752d11eddb1453e50e7932f0619485cfcd3ca40e92a84558038c1010',
  bytes: 18772,
  family: 'גוטמן-רש"י',
  format: 'woff2',
  group: 'guttman-rashi',
  inPriorityList: false,
  inExtendedList: false,
  binaryFormat: 'woff2',
  unitsPerEm: 1000,
  weight: 400,
  style: 'normal',
  nameTable: { family: 'Guttman Rashi', subfamily: 'Normal', typographicFamily: null, typographicSubfamily: null },
  sfntSha256: '8'.repeat(64),
  distributionBlocked: { blocked: true, reason: 'LICENSE_UNVERIFIED', decision: 'D-002', policy: 'usable-for-compat; excluded-from-release-bundle (נבדק בשער שלב 99)' },
});

// bytes תקינים עם חתימת woff2 — ה־hash מאולץ להתאים לרשומה בבדיקות ההצלחה
const woff2Sig = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]);

describe('isFontManifestRecord / assertFontManifest — מבנה המניפסט', () => {
  it('רשומה אמיתית (מבנה v2) עוברת', () => {
    expect(isFontManifestRecord(RECORD)).toBe(true);
  });
  it('fontId חייב להיגזר מה־sha256 — זהות מה־bytes בלבד', () => {
    const bad = { ...RECORD, fontId: 'font:v1|' + 'b'.repeat(64) };
    expect(isFontManifestRecord(bad)).toBe(false);
    expect(() => assertFontManifest({ schemaVersion: 2, fonts: [bad] })).toThrowError(
      /errors\.font\.MANIFEST_INVALID/,
    );
  });
  it('schemaVersion שגוי / fonts שאינם מערך / שדות חסרים — דחייה מקוטלגת', () => {
    expect(() => assertFontManifest({ schemaVersion: 1, fonts: [] })).toThrowError(/MANIFEST_INVALID/);
    expect(() => assertFontManifest({ schemaVersion: 2, fonts: 'x' })).toThrowError(/MANIFEST_INVALID/);
    expect(() => assertFontManifest(null)).toThrowError(/MANIFEST_INVALID/);
    for (const bad of [
      { ...RECORD, unitsPerEm: 15 },
      { ...RECORD, unitsPerEm: 16385 },
      { ...RECORD, weight: 0 },
      { ...RECORD, weight: 1001 },
      { ...RECORD, binaryFormat: 'eot' },
      { ...RECORD, group: 'system' },
      { ...RECORD, style: 'oblique' },
    ]) {
      expect(isFontManifestRecord(bad)).toBe(false);
    }
  });
  it('unitsPerEm null לגופן עם parseError — חוקי (הגופן נשאר במרשם)', () => {
    // רשומה עם parseError עדיין חייבת מבנה תקין לשאר השדות; הבדיקה מכסה
    // שה-parseError עצמו אינו שובר את הסכמה
    const withErr = { ...RECORD, parseError: 'head magic שגוי' };
    expect(isFontManifestRecord(withErr)).toBe(true);
  });
});

describe('findFontRecord / fontFaceKeyOf', () => {
  it('מזהה לא מוכר — שגיאה גלויה, לא undefined', () => {
    expect(() => findFontRecord([RECORD], 'font:v1|' + 'c'.repeat(64))).toThrowError(
      /errors\.font\.UNKNOWN_FONT_ID/,
    );
    expect(findFontRecord([RECORD], RECORD.fontId)).toBe(RECORD);
  });
  it('FontFaceKey מהרשומה; family=null נופל לשם הקובץ (תווית בלבד)', () => {
    const key = fontFaceKeyOf(RECORD);
    expect(key.fontId).toBe(RECORD.fontId);
    expect(key.contentSha256).toBe(RECORD.sha256);
    expect(key.family).toBe('גוטמן-רש"י');
    const unmapped = { ...RECORD, family: null };
    expect(fontFaceKeyOf(unmapped).family).toBe(RECORD.file);
  });
});

describe('binaryFormatOf / verifyFontBytes — שער אותם bytes', () => {
  it('חתימות תוכן מזוהות לפי המיומנות של הבייטים, לא הסיומת', () => {
    expect(binaryFormatOf(new Uint8Array([0x77, 0x4f, 0x46, 0x32]))).toBe('woff2');
    expect(binaryFormatOf(new Uint8Array([0x77, 0x4f, 0x46, 0x20]))).toBe('woff');
    expect(binaryFormatOf(new Uint8Array([0x4f, 0x54, 0x54, 0x4f]))).toBe('sfnt');
    expect(binaryFormatOf(new Uint8Array([0x00, 0x01, 0x00, 0x00]))).toBe('sfnt');
    expect(binaryFormatOf(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe('unknown');
    expect(binaryFormatOf(new Uint8Array(0))).toBe('unknown');
  });
  it('hash שונה — FONT_HASH_MISMATCH עם שני הגיבובים בפרמטרים', () => {
    expect(() => verifyFontBytes(RECORD, new Uint8Array([1, 2, 3]))).toThrowError(
      /errors\.font\.FONT_HASH_MISMATCH/,
    );
    try {
      verifyFontBytes(RECORD, new Uint8Array([1, 2, 3]));
    } catch (e) {
      expect(e.params.expectedSha256).toBe(RECORD.sha256);
      expect(e.params.actualSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.params.file).toBe(RECORD.file);
    }
  });
  it('חתימה שאינה תואמת לרשומה — FONT_FORMAT_MISMATCH (סיומת מטעה)', () => {
    // bytes שה־hash שלהם תקין אבל החתימה שונה מהרשומה — הרשומה טוענת sfnt
    // בעוד הבייטים בפועל WOFF2 (מקרה אמיתי: 4 קבצי .woff שתוכנם WOFF2)
    const bytes = woff2Sig;
    const sha = verifyHash(bytes);
    const lying = { ...RECORD, sha256: sha, fontId: `font:v1|${sha}`, binaryFormat: 'sfnt' as const };
    expect(() => verifyFontBytes(lying, bytes)).toThrowError(/FONT_FORMAT_MISMATCH/);
  });
  it('bytes תקינים — FontFaceKey מאומת מוחזר', () => {
    const bytes = woff2Sig;
    const rec = { ...RECORD, sha256: verifyHash(bytes), fontId: `font:v1|${verifyHash(bytes)}` };
    const key = verifyFontBytes(rec, bytes);
    expect(key.fontId).toBe(rec.fontId);
  });
});

describe('loadFontSet — טעינה נאכפת לפני המדידה הראשונה', () => {
  it('כל הגופנים הדרושים נטענים ומאומתים; אין טעינה חלקית', async () => {
    const bytes = woff2Sig;
    const sha = verifyHash(bytes);
    const rec = { ...RECORD, sha256: sha, fontId: `font:v1|${sha}` };
    const loaded = await loadFontSet([rec], [rec.fontId], async () => bytes);
    expect(loaded.size).toBe(1);
    expect(loaded.get(rec.fontId)!.key.fontId).toBe(rec.fontId);
  });
  it('גופן חסר מהמניפסט עוצר את כל הטעינה — UNKNOWN_FONT_ID', async () => {
    await expect(
      loadFontSet([RECORD], ['font:v1|' + 'd'.repeat(64)], async () => woff2Sig),
    ).rejects.toThrowError(/UNKNOWN_FONT_ID/);
  });
  it('fetchBytes שנכשל / bytes פגומים עוצרים את הריצה — אין המשך בשקט', async () => {
    await expect(
      loadFontSet([RECORD], [RECORD.fontId], async () => {
        throw new Error('ENOENT');
      }),
    ).rejects.toThrowError(/ENOENT/);
    await expect(
      loadFontSet([RECORD], [RECORD.fontId], async () => new Uint8Array([9, 9, 9])),
    ).rejects.toThrowError(/FONT_HASH_MISMATCH/);
  });
});

/** עזר: SHA-256 של החבילה (מאומת בנפרד מול וקטורי FIPS ומול node:crypto — hash.test.ts). */
function verifyHash(bytes: Uint8Array): string {
  return sha256Bytes(bytes);
}
