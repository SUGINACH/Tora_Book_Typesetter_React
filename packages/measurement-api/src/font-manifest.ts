/**
 * font-manifest.ts — חוזה מניפסט הגופנים ואכיפת טעינה (שלב 23; אפיון §6.4, §18-M3).
 *
 * עקרונות (תכנית שלב 23):
 *   1. כל הגופנים נרשמים — כולל היסטוריים וכאלה שלא זוהה להם שימוש; שום
 *      גופן אינו נעלם בשקט ואין החלפה בגופן אחר.
 *   2. טעינה נאכפת לפני המדידה הראשונה: קובץ פגום, רישיון חסר או hash
 *      שונה עוצרים את הריצה עם קוד מפורש (MISSING_FONT / FONT_HASH_MISMATCH /
 *      FONT_FORMAT_MISMATCH / UNKNOWN_FONT_ID). אין fallback לגופן מערכת
 *      ואין fallback לרשת — החוזה עצמו אינו מכיר באפשרות כזאת.
 *   3. המודול טהור לחלוטין: ה־bytes מסופקים בהזרקה (Node fs / אריזת נכסים
 *      בדפדפן) — הליבה אינה קוראת קבצים ואינה פונה לרשת.
 *
 * identity: fontId = ‎font:v1|contentSha256‎ — נגזר מה־bytes בלבד; שני קבצים
 * זהי-bytes הם אותו גופן (מזהה אחד), וכל שינוי byte מחליף זהות.
 */

import { EngineError } from './errors.js';
import { sha256Bytes } from './hash.js';
import { isFontFaceKey } from './provider.js';
import type { FontFaceKey } from './provider.js';

/** רשומת גופן במניפסט — השדות שהמנוע והספק צורכים (מניפסט v2, שלב 23). */
export interface FontManifestRecord {
  readonly file: string;
  /** font:v1|<contentSha256> — זהות מה־bytes בלבד. */
  readonly fontId: string;
  /** SHA-256 של תוכן הקובץ — 64 hex קטנים; נעילת "אותם bytes". */
  readonly sha256: string;
  /** שם משפחה עברי ממקורות הישן (fonts.json); null ל־4 גופנים ללא מיפוי. */
  readonly family: string | null;
  readonly group: 'bundled' | 'selfhost' | 'guttman-rashi';
  /** לפי חתימת התוכן — הרישור גילה קבצי ‎.woff שתוכנם WOFF2 (שלב 23). */
  readonly binaryFormat: 'woff2' | 'woff' | 'sfnt';
  /** מטבלת head; תקין תמיד 16–16384 (אחרת parseError). */
  readonly unitsPerEm: number;
  /** usWeightClass מ־OS/2 — האמת הבינארית, גם כשהיא לא-סטנדרטית. */
  readonly weight: number | null;
  readonly style: 'normal' | 'italic';
  /** SHA-256 של ה־sfnt הקנוני אחרי פריקת WOFF2 — לזהות בין hosts (שלב 29). */
  readonly sfntSha256?: string;
  /** גופן שלא ניתן לפענוח — נשאר במרשם עם סיבה מפורשת, לא מוסר. */
  readonly parseError?: string;
  /** דגל הפצה (D-001/D-002) — אינו מסיר ואינו מחליף; נבדק בשער שלב 99. */
  readonly distributionBlocked: {
    readonly blocked: boolean;
    readonly reason: string;
    readonly decision: string | null;
    readonly policy: string;
  };
}

const FONT_ID_RE = /^font:v1\|[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const GROUPS: readonly FontManifestRecord['group'][] = ['bundled', 'selfhost', 'guttman-rashi'];
const FORMATS: readonly FontManifestRecord['binaryFormat'][] = ['woff2', 'woff', 'sfnt'];

const fontManifestIssue = (reason: string): EngineError =>
  new EngineError('errors.font.MANIFEST_INVALID', { reason });

/** טלאומורפיזם: האם הערך רשומת מניפסט תקינה (מבנה + טווחים). */
export function isFontManifestRecord(value: unknown): value is FontManifestRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.file === 'string' && r.file.length > 0
    && typeof r.fontId === 'string' && FONT_ID_RE.test(r.fontId)
    && typeof r.sha256 === 'string' && SHA256_RE.test(r.sha256)
    && r.fontId === `font:v1|${r.sha256}`
    && (r.family === null || typeof r.family === 'string')
    && GROUPS.includes(r.group as FontManifestRecord['group'])
    && FORMATS.includes(r.binaryFormat as FontManifestRecord['binaryFormat'])
    && typeof r.unitsPerEm === 'number' && Number.isSafeInteger(r.unitsPerEm)
    && r.unitsPerEm >= 16 && r.unitsPerEm <= 16384
    && (r.weight === null
      || (typeof r.weight === 'number' && Number.isSafeInteger(r.weight) && r.weight >= 1 && r.weight <= 1000))
    && (r.style === 'normal' || r.style === 'italic')
    && (r.sfntSha256 === undefined || (typeof r.sfntSha256 === 'string' && SHA256_RE.test(r.sfntSha256)))
    && (r.parseError === undefined || typeof r.parseError === 'string')
    && typeof r.distributionBlocked === 'object' && r.distributionBlocked !== null
    && typeof (r.distributionBlocked as Record<string, unknown>).blocked === 'boolean'
    && typeof (r.distributionBlocked as Record<string, unknown>).reason === 'string'
    && ((r.distributionBlocked as Record<string, unknown>).decision === null
      || typeof (r.distributionBlocked as Record<string, unknown>).decision === 'string')
    && typeof (r.distributionBlocked as Record<string, unknown>).policy === 'string'
  );
}

/** אימות מניפסט שלם — זורק עם סיבה מפורשת במקום להמשיך בשקט. */
export function assertFontManifest(manifest: unknown): readonly FontManifestRecord[] {
  if (typeof manifest !== 'object' || manifest === null) {
    throw fontManifestIssue('not-an-object');
  }
  const m = manifest as Record<string, unknown>;
  if (m.schemaVersion !== 2) throw fontManifestIssue(`schemaVersion=${String(m.schemaVersion)}`);
  if (!Array.isArray(m.fonts)) throw fontManifestIssue('fonts:not-an-array');
  const seen = new Map<string, string>(); // fontId → file (לכידת כפילויות)
  for (let i = 0; i < m.fonts.length; i++) {
    const f = m.fonts[i];
    if (!isFontManifestRecord(f)) {
      throw fontManifestIssue(`fonts[${i}]:invalid-record`);
    }
    const prev = seen.get(f.fontId);
    if (prev !== undefined && prev !== f.file) {
      // אותם bytes בשני קבצים — חוקי (זהות אחת), אך נרשם; קובץ אחד עם
      // שני מזהים שונים בלתי אפשרי (המזהה נגזר מה־hash) — ולכן אין בדיקה הפוכה.
      continue;
    }
    seen.set(f.fontId, f.file);
  }
  return m.fonts as readonly FontManifestRecord[];
}

/** מזהה גופן ← רשומה; דלייה בלתי-ידועה היא שגיאה גלויה, לא undefined בשקט. */
export function findFontRecord(
  manifest: readonly FontManifestRecord[],
  fontId: string,
): FontManifestRecord {
  const record = manifest.find((f) => f.fontId === fontId);
  if (record === undefined) {
    throw new EngineError('errors.font.UNKNOWN_FONT_ID', { fontId });
  }
  return record;
}

/**
 * FontFaceKey מרשומת מניפסט. family לגופנים ללא מיפוי עברי = שם הקובץ
 * (תווית בלבד — הזהות היא fontId+contentSha256).
 */
export function fontFaceKeyOf(record: FontManifestRecord): FontFaceKey {
  const key: FontFaceKey = {
    fontId: record.fontId,
    contentSha256: record.sha256,
    family: record.family ?? record.file,
    weight: record.weight ?? 400,
    style: record.style,
  };
  if (!isFontFaceKey(key)) {
    throw fontManifestIssue(`fontFaceKey:${record.file}`);
  }
  return key;
}

/** חתימת תוכן לפי ה-magic הראשון — woff2 / woff / sfnt. */
export function binaryFormatOf(bytes: Uint8Array): 'woff2' | 'woff' | 'sfnt' | 'unknown' {
  const sig = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (sig === 'wOF2') return 'woff2';
  if (sig === 'wOF ') return 'woff';
  if (sig === 'OTTO' || sig === 'true' || sig === 'ttcf') return 'sfnt';
  const b0 = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  const b1 = ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0);
  if (b0 === 0x0001 && b1 === 0x0000) return 'sfnt';
  return 'unknown';
}

/**
 * אימות bytes מול רשומת מניפסט — שער "אותם bytes" לפני כל שימוש:
 * hash שונה = FONT_HASH_MISMATCH; חתימה שאינה תואמת = FONT_FORMAT_MISMATCH.
 * מחזיר את ה־FontFaceKey המאומת.
 */
export function verifyFontBytes(record: FontManifestRecord, bytes: Uint8Array): FontFaceKey {
  const actual = sha256Bytes(bytes);
  if (actual !== record.sha256) {
    throw new EngineError('errors.font.FONT_HASH_MISMATCH', {
      file: record.file,
      expectedSha256: record.sha256,
      actualSha256: actual,
    });
  }
  const fmt = binaryFormatOf(bytes);
  if (fmt !== record.binaryFormat) {
    throw new EngineError('errors.font.FONT_FORMAT_MISMATCH', {
      file: record.file,
      expectedFormat: record.binaryFormat,
      actualFormat: fmt,
    });
  }
  return fontFaceKeyOf(record);
}

/** גופן טעון ומאומת — מוכן להזרקה לספק (פריקת WOFF2 ו־shaping — שלב 24). */
export interface LoadedFont {
  readonly record: FontManifestRecord;
  readonly bytes: Uint8Array;
  readonly key: FontFaceKey;
}

/**
 * טעינת סט גופנים שלם לפני המדידה הראשונה (§6.4: "טעינת כל הגופנים
 * מסתיימת לפני מדידה ראשונה"). כל גופן חסר/פגום עוצר את הריצה כולה —
 * אין טעינה חלקית ואין המשך בשקט. fetchBytes מוזרק (Node/Worker/טאורי).
 */
export async function loadFontSet(
  manifest: readonly FontManifestRecord[],
  requiredFontIds: readonly string[],
  fetchBytes: (record: FontManifestRecord) => Promise<Uint8Array>,
): Promise<ReadonlyMap<string, LoadedFont>> {
  const loaded = new Map<string, LoadedFont>();
  for (const fontId of requiredFontIds) {
    const record = findFontRecord(manifest, fontId);
    const bytes = await fetchBytes(record);
    const key = verifyFontBytes(record, bytes);
    loaded.set(fontId, Object.freeze({ record, bytes, key }));
  }
  return Object.freeze(loaded);
}
