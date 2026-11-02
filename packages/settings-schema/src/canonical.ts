/**
 * canonical.ts — סריאליזציה קנונית מקומית לחוזי המדידה (שלב 22).
 *
 * אותם כללי ADR-002 (שלב 10): מפתחות ממוינים רקורסיבית, escaping קבוע,
 * ללא רווחים, נרמול אפס שלילי. העותק מקומי כי ל־measurement-api אין
 * תלויות (גרף §5) והיא אינה רשאית לייבא את layout-api — בדיוק כמו
 * הקטלוג המקומי של content-model (שלב 14). הזהות בין שני המימושים
 * נאכפת בבדיקות על וקטורים משותפים.
 */
import { SettingsError } from './errors.js';

/** סריאליזציה קנונית: מפתחות ממוינים רקורסיבית, escaping קבוע, ללא רווחים. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new SettingsError('errors.settings.NON_FINITE_NUMBER', { value }, '/canonical');
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
      throw new SettingsError('errors.settings.UNSUPPORTED_TYPE', { type: typeof value }, '/canonical');
  }
}
