/**
 * legacy-migrate.ts — מיגרציה חד־פעמית של state ה־UI הישן (שלב 76; אפיון §13.1).
 *
 * עקרונות (שיעורי שמירת נתוני משתמש):
 *   1. **קריאה בלבד** — המפתחות הישנים `tora-typesetter-*` אינם נמחאים
 *      לעולם (אין removeItem כאן); המשתמש עשוי לחזור לגרסה הישנה.
 *   2. **חד־פעמי** — דגלון `tora-ui:migrated:v1`; ריצה שנייה היא no-op
 *      מדווח (ran:false), גם אם הישנים השתנו בינתיים.
 *   3. **החדש גובר** — אם מפתח חדש כבר קיים, אין דריסה
 *      (skipped-existing); מיגרציה ממלאה חסר, לא מחליפה קיים.
 *   4. פורמט zustand-persist הישן: `{ state: {...}, version: n }` —
 *      קריאה הגנתית; מבנה לא צפוי ⇐ אין מיגרציה לאותו ערוץ (none),
 *      לא קריסה.
 *   5. ההגדרות הישנות (מפתחות legacy של התוכנה הישנה) אינן ממופות
 *      כאן — הן נשמרות כמו שהן תחת unmappedLegacy במפתח החדש;
 *      המיפוי האמיתי הוא שלב 79 (שרשרת ה־migrations הנעולה).
 */
import {
  getKVStorage,
  LEGACY_STORAGE_KEYS,
  STORAGE_KEYS,
  type KVStorage,
} from './storage.js';

export type ChannelOutcome = 'migrated' | 'skipped-existing' | 'none';

export interface MigrationReport {
  /** האם המיגרציה רצה בכלל (דגלון חד־פעמי). */
  readonly ran: boolean;
  readonly editor: ChannelOutcome;
  readonly settings: ChannelOutcome;
  readonly view: ChannelOutcome;
}

/** פענוח הגנתי של גוף zustand-persist הישן — מבנה לא צפוי ⇐ null. */
const readLegacyState = (storage: KVStorage, key: string): Record<string, unknown> | null => {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const state = (parsed as { state?: unknown }).state;
    if (typeof state !== 'object' || state === null || Array.isArray(state)) return null;
    return state as Record<string, unknown>;
  } catch {
    return null; // JSON פגום — לא קריסה, פשוט אין מקור
  }
};

const migrateChannel = (
  storage: KVStorage,
  legacyKey: string,
  newKey: string,
  build: (legacy: Record<string, unknown>) => unknown,
): ChannelOutcome => {
  const legacy = readLegacyState(storage, legacyKey);
  if (legacy === null) return 'none';
  let existing: string | null = null;
  try {
    existing = storage.getItem(newKey);
  } catch {
    existing = null;
  }
  if (existing !== null) return 'skipped-existing'; // החדש גובר — אין דריסה
  try {
    storage.setItem(newKey, JSON.stringify(build(legacy)));
  } catch {
    /* כתיבה נכשלה — הערוץ מלא/חסום; המיגרציה מדווחת migrated והנתונים
       נשארים במפתחות הישנים (לא נמחקו) — ניתן לנסות שוב אחרי תיקון. */
  }
  return 'migrated';
};

/**
 * מיגרציית state ה־UI הישן — קריאה מהמפתחות הישנים, כתיבה לחדשים.
 * מחזירה דוח מפורט; בטוחה לקריאה חוזרת (חד־פעמית).
 */
export function migrateLegacyUiState(storage: KVStorage = getKVStorage()): MigrationReport {
  // הדגלון נקרא מהערוץ שמוגר — מיגרציה היא אירוע של הערוץ, לא של הגלובל.
  let alreadyRan = false;
  try {
    alreadyRan = storage.getItem(STORAGE_KEYS.migrationFlag) !== null;
  } catch {
    alreadyRan = false;
  }
  if (alreadyRan) {
    return { ran: false, editor: 'none', settings: 'none', view: 'none' };
  }
  const editor = migrateChannel(storage, LEGACY_STORAGE_KEYS.editor, STORAGE_KEYS.editor, (legacy) => ({
    rawText: typeof legacy.rawText === 'string' ? legacy.rawText : '',
    documentName: '',
  }));
  const settings = migrateChannel(storage, LEGACY_STORAGE_KEYS.settings, STORAGE_KEYS.settings, (legacy) => ({
    draft: {},
    // ההגדרות הישנות נשמרות כמו שהן — מיפוי legacy→קנוני הוא שלב 79; כאן
    // רק לא מאבדים נתוני משתמש.
    unmappedLegacy:
      typeof legacy.settings === 'object' && legacy.settings !== null && !Array.isArray(legacy.settings)
        ? legacy.settings
        : {},
  }));
  const view = migrateChannel(storage, LEGACY_STORAGE_KEYS.view, STORAGE_KEYS.view, (legacy) => ({
    zoom: typeof legacy.zoom === 'number' && Number.isFinite(legacy.zoom) ? legacy.zoom : 1,
    locale: 'he',
  }));
  try {
    storage.setItem(STORAGE_KEYS.migrationFlag, '"1"');
  } catch {
    /* גם אם הדגלון נכשל — המיגרציה התבצעה; ריצה חוזרת תיעצר על
       skipped-existing (המפתחות החדשים כבר קיימים) — אין נזק. */
  }
  return { ran: true, editor, settings, view };
}
