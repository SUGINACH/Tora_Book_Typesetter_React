/**
 * storage.ts — הפשטת אחסון KV מוזרקת לחמשת ה־stores (שלב 76; אפיון §13.1).
 *
 * עקרונות:
 *   1. ה־stores אינם נוגעים ב־localStorage ישירות — הם מקבלים ערוץ KV
 *      מוזרק (חברה: דפדפן; בדיקות: זיכרון; Tauri: מימוש עתידי). כך כל
 *      התנהגות השמירה נבדקת בלי DOM.
 *   2. מפתחות המשטר החדש הם `tora-ui:*:v1` — גרסאות מפורשות; מפתחות
 *      המשטר הישן `tora-typesetter-*` נקראים למיגרציה בלבד ואינם נמחקים
 *      (legacy-migrate.ts).
 *   3. JSON פגום ⇐ ערך ברירת מחדל בשקט — קלט שמור אינו מפיל את ה־UI
 *      (אין throw מקריאת state ישן).
 */

/** ערוץ KV סינכרוני — משטר הערכים היחיד שה־stores רואים. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** מפתחות המשטר החדש — `tora-ui:*:v1` (גרסה מפורשת לכל אחד). */
export const STORAGE_KEYS = Object.freeze({
  editor: 'tora-ui:editor:v1',
  settings: 'tora-ui:settings:v1',
  view: 'tora-ui:view:v1',
  migrationFlag: 'tora-ui:migrated:v1',
} as const);

/** מפתחות המשטר הישן — קריאה בלבד למיגרציה; לעולם אינם נמחקים. */
export const LEGACY_STORAGE_KEYS = Object.freeze({
  editor: 'tora-typesetter-document',
  settings: 'tora-typesetter-settings',
  view: 'tora-typesetter-view',
} as const);

/** מימוש זיכרון לבדיקות ולסביבות בלי DOM — מפה אחת, העתק נאמן. */
export function createMemoryKVStorage(
  initial: Readonly<Record<string, string>> = {},
): KVStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * מימוש דפדפן — localStorage אמיתי; אם הגישה נזרקת (מצב פרטי/SSR/חסום)
 * נופלים בזמן ריצה לזיכרון: ה־UI חי, השמירה פשוט אינה עמידה.
 */
export function createBrowserKVStorage(): KVStorage {
  const memory = createMemoryKVStorage();
  const canUse = (): boolean => {
    try {
      const probe = '__tora-probe__';
      globalThis.localStorage?.setItem(probe, '1');
      globalThis.localStorage?.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  };
  if (!canUse()) return memory;
  return {
    getItem: (key) => {
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        globalThis.localStorage.setItem(key, value);
      } catch {
        /* מלא/חסום — שותקים; ה־UI אינו נפל אלא איבד שמירה */
      }
    },
    removeItem: (key) => {
      try {
        globalThis.localStorage.removeItem(key);
      } catch {
        /* כמו לעיל */
      }
    },
  };
}

let currentStorage: KVStorage = createBrowserKVStorage();

/** הערוץ הפעיל — ה־stores קוראים לזה בזמן פעולה, לא בזמן ייבוא. */
export function getKVStorage(): KVStorage {
  return currentStorage;
}

/** הזרקת ערוץ (בדיקות/Tauri) — מחליף את הפעיל. */
export function setKVStorage(storage: KVStorage): void {
  currentStorage = storage;
}

/** קריאת JSON שמור — פגום/חסר ⇐ הערך החלופי; לעולם אינה זורקת. */
export function readJson<T>(key: string, fallback: T): T {
  let raw: string | null;
  try {
    raw = getKVStorage().getItem(key);
  } catch {
    return fallback;
  }
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** כתיבת JSON — מחזיר האם הצליחה (שקטה בכישלון; ה־UI אינו נפל). */
export function writeJson(key: string, value: unknown): boolean {
  try {
    getKVStorage().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** דגלון חד־פעמי (למשל מיגרציה) — קיום הערך, לא תוכנו, הוא הסימן. */
export function readFlag(key: string): boolean {
  try {
    return getKVStorage().getItem(key) !== null;
  } catch {
    return false;
  }
}

/** כתיבת דגלון. */
export function writeFlag(key: string): void {
  writeJson(key, '1');
}
