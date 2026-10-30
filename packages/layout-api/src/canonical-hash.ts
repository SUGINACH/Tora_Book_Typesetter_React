/**
 * canonical-hash.ts — גיבוב קנוני ושלושת ה־hashes (ADR-002, שלב 10).
 *
 * הגדרות מדויקות (מה נכנס לכל hash):
 *   configHash      = SHA-256(canonicalJson({ v:1, kind:'config', settings }))
 *   inputHash       = SHA-256(canonicalJson({ v:1, kind:'input', sourceSha256,
 *                      configHash, fontsManifestSha256, assetsManifestSha256,
 *                      parserVersion, engineVersion }))
 *   layoutHash      = SHA-256(canonicalJson({ v:1, kind:'layout', ir }))
 *                      — ה־IR הקנוני בלבד: בלי timestamps, משך ריצה, host או progress.
 *   runFingerprint  = SHA-256(canonicalJson({ v:1, kind:'run', inputHash, layoutHash }))
 *   environmentHash = SHA-256(canonicalJson({ v:1, kind:'environment', ... }))
 *                      — תיאור הסביבה לתיעוד בלבד; אינו נכנס ל־layoutHash.
 *
 * כלל הזהב: אותם קלט, הגדרות אפקטיביות, גופנים, provider וגרסת מנוע
 * מניבים את אותו layoutHash — על כל host (אפיון §4.3, §22.2).
 */
import { sha256Hex } from './hash.js';
import { CanonicalHashError } from './canonical-hash-error.js';

/** סריאליזציה קנונית: מפתחות ממוינים רקורסיבית, escaping קבוע, ללא רווחים. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new CanonicalHashError('NON_FINITE_NUMBER', { value });
      }
      if (Object.is(value, -0)) return '0'; // נרמול אפס שלילי — דטרמיניזם
      return String(value); // ייצוג המחרוזת הקצר ביותר של JS — קבוע ודטרמיניסטי
    }
    case 'string':
      return JSON.stringify(value); // escaping קבוע של JSON
    case 'object': {
      if (Array.isArray(value)) {
        return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort(); // סדר לקסיקוגרפי קבוע (UTF-16)
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
    }
    default:
      // undefined, function, symbol, bigint — אסורים בערכים קנוניים
      throw new CanonicalHashError('UNSUPPORTED_TYPE', { type: typeof value });
  }
}

/** רכיבי הקלט לגיבוב inputHash (ADR-002). */
export interface InputHashComponents {
  /** SHA-256 של קובץ המקור (hex קטן). */
  readonly sourceSha256: string;
  /** ההגדרות האפקטיביות — אובייקט קנוני-סדיר. */
  readonly effectiveSettings: unknown;
  /** SHA-256 של מניפסט הגופנים (hex קטן). */
  readonly fontsManifestSha256: string;
  /** SHA-256 של מניפסט הנכסים (hex קטן). */
  readonly assetsManifestSha256: string;
  /** גרסת הפרסר. */
  readonly parserVersion: string;
  /** גרסת המנוע. */
  readonly engineVersion: string;
}

/** configHash — גיבוב ההגדרות האפקטיביות בלבד. */
export function configHash(effectiveSettings: unknown): string {
  return sha256Hex(canonicalJson({ v: 1, kind: 'config', settings: effectiveSettings }));
}

/** inputHash — כל מה שמשפיע על הפלט: מקור, הגדרות, גופנים, נכסים, פרסר ומנוע. */
export function inputHash(c: InputHashComponents): string {
  return sha256Hex(canonicalJson({
    v: 1,
    kind: 'input',
    sourceSha256: c.sourceSha256,
    configHash: configHash(c.effectiveSettings),
    fontsManifestSha256: c.fontsManifestSha256,
    assetsManifestSha256: c.assetsManifestSha256,
    parserVersion: c.parserVersion,
    engineVersion: c.engineVersion,
  }));
}

/**
 * layoutHash — ה־Layout IR הקנוני בלבד. אחריות הקורא: ה־IR חייב להיות
 * אובייקט סדיר (JSON-able) ונקי משדות רץ-זמן (timestamps, משכים, host, progress).
 */
export function layoutHash(ir: unknown): string {
  return sha256Hex(canonicalJson({ v: 1, kind: 'layout', ir }));
}

/** runFingerprint — מזהה ריצה: קלט מדויק + פלט מדויק. */
export function runFingerprint(ih: string, lh: string): string {
  return sha256Hex(canonicalJson({ v: 1, kind: 'run', inputHash: ih, layoutHash: lh }));
}

/** תיאור סביבה לתיעוד בלבד — אינו נכנס ל־layoutHash (ADR-002). */
export interface EnvironmentDescription {
  readonly runtime: string;
  readonly runtimeVersion: string;
  readonly platform: string;
  readonly measurementProvider: string;
  readonly measurementProviderVersion: string;
}

/** environmentHash — טביעת רגל של ה־host לצורך השוואות בין-סביבתיות. */
export function environmentHash(env: EnvironmentDescription): string {
  return sha256Hex(canonicalJson({ v: 1, kind: 'environment', ...env }));
}
