/**
 * cache-key.ts — חוזה מפתח מטמון shaping (שלב 22; אפיון §6.4, §17.3).
 *
 * המטמון עצמו (פינוי, תקרת זיכרון, ביטול job) — שלב 26. כאן ננעל
 * המפתח הקנוני בלבד: אותן בקשות ⇐ אותו מפתח, בכל סדר קריאות ובכל
 * host. אסור שהמפתח יכלול זמן, מונה, מיקום ב־batch או סדר רשת —
 * אחרת cold/warm לא היה זהה (שער שלב 26) וזהות בין hosts (שלב 29)
 * הייתה נשברת.
 *
 * הכללה מלאה של §6.4: text/atoms + font hash + size + features +
 * direction + letter spacing + provider hash (+ שפה — חלק מהבקשה).
 */
import { EngineError } from './errors.js';
import { canonicalJson } from './canonical.js';
import { sha256Hex } from './hash.js';
import {
  assertShapeRequest,
  fontFingerprint,
  providerIdentityIssues,
} from './provider.js';
import type { ShapeRequest } from './provider.js';

/**
 * מפתח מטמון קנוני — SHA-256 של הייצוג הקנוני של כל מה שמשפיע על
 * התוצאה: הבקשה כולה (אטומים: id+text+bidiLevel; פנים; גודל; כיוון;
 * שפה; features; ריווח) + זהות provider מלאה (providerId, גרסה,
 * wasmSha256, environmentHash). טביעת האצבע של הפנים כבר כוללת את
 * contentSha256 — "גופן+hash" מ§6.4.
 *
 * שינוי כל רכיב (למשל bytes גופן אחרים) מחליף מפתח — אין פגיעה
 * בתוצאות קיימות ואין "לכלוך" בין גופנים.
 */
export function canonicalShapeCacheKey(
  identity: { providerId: string; providerVersion: string; wasmSha256: string; environmentHash: string },
  request: ShapeRequest,
): string {
  const identityIssues = providerIdentityIssues(identity);
  if (identityIssues.length > 0) {
    throw new EngineError('errors.shape.INVALID_PROVIDER', {
      reason: identityIssues.join(';'),
    });
  }
  assertShapeRequest(request);
  return sha256Hex(canonicalJson({
    v: 1,
    kind: 'shape-cache-key',
    provider: {
      providerId: identity.providerId,
      providerVersion: identity.providerVersion,
      wasmSha256: identity.wasmSha256,
      environmentHash: identity.environmentHash,
    },
    fontFingerprint: fontFingerprint(request.font),
    request: {
      atoms: request.atoms.map((a) => ({ id: a.id, text: a.text, bidiLevel: a.bidiLevel })),
      fontSizeLu: request.fontSizeLu,
      direction: request.direction,
      language: request.language,
      features: request.features,
      letterSpacingLu: request.letterSpacingLu,
    },
  }));
}

/**
 * חוזה המטמון (נאכף בשלב 26; מוצהר כאן כדי שהמנוע ייכתב מולו):
 *   1. get(key) אחרי set(key, value) מחזיר ביט-ביט את אותו ערך.
 *   2. פינוי (eviction) מותר רק כשינוי ביצועים — לעולם לא שינוי תוצאה:
 *      miss אחרי פינוי מחזיר את אותו ערך שהיה בקרה קרה.
 *   3. אין תלות בסדר קריאות: אותה קבוצת בקשות בכל סדר ⇐ אותם
 *      התוצאות (גם אם יחסי hit/miss שונים).
 *   4. מדדי hit/miss וזיכרון אינם נכנסים לתוצאה ולא למפתח.
 *
 * ShapingCache — ממשק המימוש של שלב 26. מוגדר כאן כדי שהחוזה
 * יהיה יציב כבר עכשיו (המנוע יכול להיכתב מולו; שער שלב 22).
 */
export interface ShapingCache {
  /** שליפה — null במקרה miss; הערך קפוא ואינו משתנה לאחר ההחזרה. */
  get(key: string): ShapedCacheValue | null;
  /** הכנסה — ערך על בסיס אותו מפתח קנוני; דורסת את הקודם. */
  set(key: string, value: ShapedCacheValue): void;
  /** מספר הרשומות כרגע — למדדים ולתקרת זיכרון בלבד. */
  get size(): number;
  /** מדדים מצטברים — מחוץ לקביעת התוצאה. */
  readonly metrics: { hits: number; misses: number; evictions: number };
}

/** ערך מטמון — ShapedRun קפוא עם המפתח שהוזן בו (לניפוי ולביקורת). */
export interface ShapedCacheValue {
  readonly cacheKey: string;
  readonly run: import('./provider.js').ShapedRun;
}
