/**
 * settings-store.ts — draft, presets ו־validation (שלב 76; אפיון §13.1, §13.3)
 * + מסלול קובצי הגדרות: מיגרציה, ייבוא וייצוא (שלב 79; אפיון §6.3, §18-M9).
 *
 * "settingsStore — draft, presets, migrations ו־validation."
 *
 *   1. **כל** הלוגיקה הסמנטית מגיעה מ־`@tora/settings-schema` — ה־store
 *      אינו מממש בדיקת תקינות משלו (אין מימוש מקביל; שיעור כלל 8):
 *      ייבוא ערך/אובייקט ⇐ importSettings; אפקטיבי+hash ⇐
 *      buildEffectiveSettings; המרות גרסאות ⇐ migrateSettings (השרשרת
 *      הנעולה של שלב 30 — גם במסלול הקובץ אין מימוש מקביל של המרות).
 *   2. מפתח לא מוכר ⇐ issue מתועד **ואינו נכנס ל־draft**; ערך לא חוקי
 *      ⇐ issue וה־draft אינו משתנה. אין תיקון שקט. מפתחות לא מוכרים
 *      מקובץ נשמרים ב־unmappedLegacy — נדחים עם הסבר מדויק, לא נזרקים.
 *   3. קובץ הגדרות (שלב 79): פריקת מעטפת ייצוא ← שרשרת migrateSettings ←
 *      ייבוא פריט־פריט. הקובץ **מחליף** את ה־draft (תמונת מצב מלאה,
 *      כמו קובצי התוכנה הישנה וכמו טעינת תבנית) — לא ממזג.
 *   4. שכבות ההפעלה (§6.3): ברירות מחדל < draft; effective נבנה רק
 *      ב־applyDraft — ה־configHash הוא של המצב האפקטיבי, לא של ה־draft.
 *      כשל בנייה ⇐ effective=null (אין ערך מלוכלך מהריצה הקודמת — הריצה
 *      נחסמת לפני תחילת עימוד).
 *   5. אין effective מהעולם הישן (שלב 84; אפיון §13, §18-M9): כל שינוי
 *      **ממשי** של ה־draft — עריכת ערך, ייבוא אובייקט/קובץ או טעינת
 *      תבנית — מאפס את ה־effective עד applyDraft הבא. תבנית A ← תבנית
 *      B לעולם אינה משאירה hash של A כביכול "עדכני"; צרכן ששכח
 *      לרענן נחסם בריצה, לא רץ עם הגדרות ישנות. עריכה שנדחתה (issue)
 *      אינה מאפסת — ה־draft לא זז.
 *   6. rehydrate מאמת את ה־draft השמור מול המרשם (שלב 84): מפתח
 *      שירד מהמרשם מאז השמירה (או אחסון זר) אינו נכנס ל־draft כיתום —
 *      אותו צינור ייבוא כמו כל מקור אחר: הוא נשמר ב־unmappedLegacy עם
 *      issue מתועד. אין שני מסלולים להכנסת ערכים ל־draft.
 */
import { create } from 'zustand';
import {
  buildEffectiveSettings,
  buildSettingRegistry,
  importSettings,
  migrateSettings,
  SCHEMA_VERSION,
  SettingsError,
  type EffectiveSettings,
  type ValidationIssue,
} from '@tora/settings-schema';
import registryJson from '@tora/settings-schema/registry.json';
// החוזה של המרשם מוצא מחדש דרך התפר הזה (שלב 78): הקומפוננטות צורכות
// אותו מה-store ולא ישירות מהחבילה — קוד המעטפת הישן (components/) אינו
// מייבא @tora/* (נאכף ב-verify-fixtures-schema; חריגי הייבוא: stores/
// worker-host/renderers בלבד).
export type { SettingDefinition } from '@tora/settings-schema';
import { readJson, STORAGE_KEYS, writeJson } from './storage.js';

/** המרשם היחיד — נבנה פעם אחת מה־registry המיוצר (source of truth). */
export const settingsRegistry = buildSettingRegistry(
  registryJson as unknown as Parameters<typeof buildSettingRegistry>[0],
);

type Draft = Readonly<Record<string, unknown>>;
type Presets = Readonly<Record<string, Draft>>;

/** מסמן ייצוא הגדרות של המערכת החדשה — מפתח שאינו יכול להתנגש עם
 * מפתחות legacy (כולם מקוטלגים במרשם; אף אחד אינו מתחיל ב-$). */
export const SETTINGS_FILE_FORMAT = 'tora-settings' as const;

/** פורמט קובץ הייצוא (שלב 79): מעטפת מזוהה + גרסת סכמה + ערכים קנוניים.
 * קובץ מורשת שטוח (התוכנה הישנה) נחשב v1 — אין לו מעטפת. */
export interface SettingsFileExport {
  readonly $format: typeof SETTINGS_FILE_FORMAT;
  readonly schemaVersion: number;
  readonly values: Readonly<Record<string, unknown>>;
}

/** תוצאת ייבוא קובץ — לתצוגת המשתמש ולבדיקות: כמה נטען ואילו בעיות
 * (אזהרות COERCED לצד דחיות — הפרדה לפי קוד בצרכן). */
export interface SettingsFileImportSummary {
  readonly loaded: number;
  readonly issues: readonly ValidationIssue[];
}

interface SettingsStoreState {
  readonly draft: Draft;
  readonly presets: Presets;
  readonly issues: readonly ValidationIssue[];
  readonly unmappedLegacy: Draft;
  readonly effective: Readonly<EffectiveSettings> | null;
  /** עריכת ערך בודד — לא חוקי ⇐ issue, ה־draft לא זז. */
  setDraftValue(key: string, value: unknown): void;
  /**
   * ייבוא אובייקט (קובץ הגדרות/preset ישן): מפתחות מוכרים ותקינים
   * מתמזגים ל־draft; לא מוכרים ⇐ issue + unmappedLegacy; לא חוקיים ⇐
   * issue. מחזיר את מספר הבעיות (לבדיקות).
   */
  importObject(obj: unknown): number;
  /**
   * ייבוא **קובץ** הגדרות (שלב 79): פריקת מעטפת ייצוא ← שרשרת
   * migrateSettings הנעולה ← ייבוא פריט־פריט. הקובץ מחליף את ה־draft
   * ואת unmappedLegacy (תמונת מצב מלאה). קובץ מורשת שטוח נחשב v1.
   * גרסה עתידית ללא צעד מיגרציה ⇐ MIGRATION_FAILED מדויק, כלום לא נטען.
   */
  importSettingsFile(obj: unknown): SettingsFileImportSummary;
  /**
   * ייצוא מצב ההגדרות הנוכחי: מעטפת {$format, schemaVersion, values}
   * מה־effective (ערכים קנוניים, מפתחות ממוינים — דטרמיניסטי).
   * null כאשר אין effective (הצרכן מריץ applyDraft קודם).
   */
  exportSettingsFile(): SettingsFileExport | null;
  /** בניית effective + configHash מה־draft הנוכחי. */
  applyDraft(): void;
  savePreset(name: string): void;
  loadPreset(name: string): void;
  deletePreset(name: string): void;
  /** איפוס draft/issues/effective — ה־presets (נתוני משתמש) נשמרים. */
  reset(): void;
  rehydrate(): void;
}

interface PersistedSettings {
  readonly draft?: unknown;
  readonly presets?: unknown;
  readonly unmappedLegacy?: unknown;
}

const asDraft = (v: unknown): Draft =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.freeze({ ...(v as Record<string, unknown>) }) : Object.freeze({});

const asPresets = (v: unknown): Presets => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return Object.freeze({});
  const out: Record<string, Draft> = {};
  for (const [name, preset] of Object.entries(v as Record<string, unknown>)) {
    out[name] = asDraft(preset);
  }
  return Object.freeze(out);
};

const persist = (state: SettingsStoreState): void => {
  writeJson(STORAGE_KEYS.settings, {
    draft: state.draft,
    presets: state.presets,
    unmappedLegacy: state.unmappedLegacy,
  });
};

/** ייבוא פריט־פריט: תקין נכנס, לא־תקין נדחה — חלקי ומתועד. */
const importEntries = (
  entries: readonly [string, unknown][],
): { merged: Draft; issues: ValidationIssue[]; unmapped: Record<string, unknown> } => {
  const merged: Record<string, unknown> = {};
  const issues: ValidationIssue[] = [];
  const unmapped: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    const out = importSettings({ [key]: value }, settingsRegistry, '/draft');
    const blocking = out.issues.filter((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING');
    issues.push(...out.issues);
    if (blocking.length > 0 || out.values === null) {
      if (blocking.some((i) => i.code === 'errors.settings.UNKNOWN_KEY')) unmapped[key] = value;
      continue;
    }
    // המפתח הקנוני — ייבוא דרך legacyKey ממופה לשם הקנוני (importSettings
    // מחזיר ערכים לפי המפתח הקנוני שבמרשם).
    const canonicalKey = Object.keys(out.values)[0];
    if (canonicalKey !== undefined) merged[canonicalKey] = out.values[canonicalKey];
  }
  return { merged: Object.freeze(merged), issues, unmapped };
};

export const useSettingsStore = create<SettingsStoreState>()((set, get) => ({
  draft: Object.freeze({}),
  presets: Object.freeze({}),
  issues: Object.freeze([]),
  unmappedLegacy: Object.freeze({}),
  effective: null,

  setDraftValue: (key, value) =>
    set((state) => {
      const { merged, issues } = importEntries([[key, value]]);
      if (issues.some((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING')) {
        return { ...state, issues: Object.freeze(issues) };
      }
      // ה־draft השתנה באמת — ה־effective של ה-draft הקודם אינו עדכני
      // עוד (שלב 84): נבנה מחדש רק ב-applyDraft. עריכה שנדחתה (לעיל)
      // אינה מגיעה לכאן — ה-draft לא זז וה-effective נשאר תקף לו.
      const next = { ...state, draft: Object.freeze({ ...state.draft, ...merged }), issues: Object.freeze(issues), effective: null };
      persist(next);
      return next;
    }),

  importObject: (obj) => {
    let issueCount = 0;
    set((state) => {
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        const issues = importSettings(obj, settingsRegistry, '/import').issues;
        issueCount = issues.length;
        return { ...state, issues: Object.freeze([...issues]) };
      }
      const { merged, issues, unmapped } = importEntries(Object.entries(obj as Record<string, unknown>));
      issueCount = issues.length;
      const next = {
        ...state,
        draft: Object.freeze({ ...state.draft, ...merged }),
        issues: Object.freeze(issues),
        unmappedLegacy: Object.freeze({ ...state.unmappedLegacy, ...unmapped }),
        // שלב 84: מה שנכנס ל-draft מאפס את ה-effective; מה שנדחה
        // בשלמותו (merged ריק) אינו מאפס — ה-draft לא זז.
        ...(Object.keys(merged).length > 0 ? { effective: null } : {}),
      };
      persist(next);
      return next;
    });
    return issueCount;
  },

  importSettingsFile: (obj) => {
    let summary: SettingsFileImportSummary = { loaded: 0, issues: Object.freeze([]) };
    set((state) => {
      // (א) צורה: קובץ הגדרות הוא אובייקט בלבד — מחרוזת/מספר/מערך נדחים
      // מיד עם קוד+path, בלי להגיע כלל למיגרציה או לייבוא.
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        const issues: readonly ValidationIssue[] = Object.freeze([{
          code: 'errors.settings.INVALID_TYPE',
          path: '/import/file',
          params: { value: JSON.stringify(obj).slice(0, 80), type: 'object' },
        }]);
        summary = { loaded: 0, issues };
        return { ...state, issues };
      }
      // (ב) פריקת מעטפת — ייצוא חדש (מזוהה ב-$format) או קובץ מורשת שטוח (v1)
      let raw: unknown = obj;
      let fromVersion = 1; // Orange אינו מספר גרסאות — כל קובץ מורשת הוא v1
      if ((obj as Record<string, unknown>)['$format'] === SETTINGS_FILE_FORMAT) {
        const wrapped = obj as Record<string, unknown>;
        const version = wrapped.schemaVersion;
        const inner = wrapped.values;
        if (typeof version !== 'number' || !Number.isInteger(version) || version < 1
          || typeof inner !== 'object' || inner === null || Array.isArray(inner)) {
          const issues: readonly ValidationIssue[] = Object.freeze([{
            code: 'errors.settings.INVALID_TYPE',
            path: '/import/file',
            params: { value: JSON.stringify(obj).slice(0, 80), type: 'object' },
          }]);
          summary = { loaded: 0, issues };
          return { ...state, issues };
        }
        fromVersion = version;
        raw = inner;
      }
      // (ג) שרשרת המיגרציות הנעולה (שלב 30) — אין מימוש מקביל; גרסה ללא
      // צעד ⇐ MIGRATION_FAILED מדויק (קוד+path+פרמטרים), כלום לא נטען.
      let migrated: Record<string, unknown>;
      try {
        migrated = { ...migrateSettings(raw as Readonly<Record<string, unknown>>, fromVersion, SCHEMA_VERSION).settings };
      } catch (error) {
        const issue: ValidationIssue = error instanceof SettingsError
          ? Object.freeze({ code: error.code, path: error.path, params: { ...error.params } })
          : Object.freeze({
            code: 'errors.settings.MIGRATION_FAILED',
            path: '/settings/migration',
            params: { reason: error instanceof Error ? error.message : String(error) },
          });
        summary = { loaded: 0, issues: Object.freeze([issue]) };
        return { ...state, issues: Object.freeze([issue]) };
      }
      // (ד) ייבוא פריט־פריט — אותו צינור כמו importObject; הקובץ מחליף
      // (תמונת מצב מלאה): ערכי הקובץ בלבד, לא מיזוג עם draft קודם.
      const { merged, issues, unmapped } = importEntries(Object.entries(migrated));
      summary = { loaded: Object.keys(merged).length, issues: Object.freeze(issues) };
      const next = {
        ...state,
        draft: Object.freeze({ ...merged }),
        issues: Object.freeze(issues),
        unmappedLegacy: Object.freeze({ ...unmapped }),
        // הקובץ מחליף את ה-draft — ה-effective של הקודם מאופס תמיד
        // (שלב 84), גם אם הקובץ ריק/נדחה במלואו: תמונת המצב החדשה
        // היא ה-draft, והיא טרם הוחלה.
        effective: null,
      };
      persist(next);
      return next;
    });
    return summary;
  },

  exportSettingsFile: () => {
    const { effective } = get();
    if (effective === null) return null;
    // דטרמיניזם: מפתחות ממוינים; הערכים קנוניים כבר ב-effective (§6.3).
    const values: Record<string, unknown> = {};
    for (const key of Object.keys(effective.values).sort()) values[key] = effective.values[key];
    return Object.freeze({
      $format: SETTINGS_FILE_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      values: Object.freeze(values),
    });
  },

  applyDraft: () =>
    set((state) => {
      try {
        // ה־draft כבר קנוני ומאומת; השכבות: ברירות מחדל < draft (§6.3).
        const effective = buildEffectiveSettings(settingsRegistry, [state.draft]);
        return { ...state, effective: Object.freeze(effective) };
      } catch (error) {
        // לא אמור לקרות (draft מאומת) — אבל כשל מרשם הוא כשל מפורש,
        // לא מצב "כמעט תקין". effective מתאפס: אין ערך מלוכלך מהריצה
        // הקודמת — הריצה נחסמת לפני תחילת עימוד (שלב 79; §18-M9).
        const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'errors.settings.INVALID_TYPE';
        const issue: ValidationIssue = Object.freeze({
          code,
          path: '/effective',
          params: { reason: error instanceof Error ? error.message : String(error) },
        });
        return { ...state, effective: null, issues: Object.freeze([issue]) };
      }
    }),

  savePreset: (name) =>
    set((state) => {
      const trimmed = name.trim();
      if (trimmed === '' || trimmed in state.presets) return state;
      const next = { ...state, presets: Object.freeze({ ...state.presets, [trimmed]: Object.freeze({ ...state.draft }) }) };
      persist(next);
      return next;
    }),

  loadPreset: (name) =>
    set((state) => {
      const preset = state.presets[name];
      if (preset === undefined) return state;
      // preset עבר ייבוא בשעת שמירה — עדיין מיובא שוב: ייתכן שהמרשם השתנה.
      const { merged, issues } = importEntries(Object.entries(preset));
      const next = {
        ...state,
        draft: Object.freeze({ ...merged }),
        issues: Object.freeze(issues),
        // התבנית מחליפה את ה-draft — ה-effective מאופס עד applyDraft
        // (שלב 84): אין hash של התבנית הקודמת שנראה עדכני בכפוף לה.
        effective: null,
      };
      persist(next);
      return next;
    }),

  deletePreset: (name) =>
    set((state) => {
      if (!(name in state.presets)) return state;
      const presets = { ...state.presets };
      delete presets[name];
      const next = { ...state, presets: Object.freeze(presets) };
      persist(next);
      return next;
    }),

  reset: () =>
    set((state) => {
      const next = {
        ...state,
        draft: Object.freeze({}),
        issues: Object.freeze([]),
        unmappedLegacy: Object.freeze({}),
        effective: null,
      };
      persist(next);
      return next;
    }),

  rehydrate: () => {
    const saved = readJson<PersistedSettings>(STORAGE_KEYS.settings, {});
    set((state) => {
      // ה־presets/unmappedLegacy השמורים נטענים כפי שהם — הם נתוני
      // משתמש גולמיים; הפרסום (presets) עובר ייבוא בכל loadPreset, והמורשת
      // הבלתי־ממופה מוצגת כמות שהיא (דחייה עם הסבר — שלב 79).
      const base = {
        ...state,
        presets: 'presets' in saved ? asPresets(saved.presets) : state.presets,
        unmappedLegacy: 'unmappedLegacy' in saved ? asDraft(saved.unmappedLegacy) : state.unmappedLegacy,
      };
      // ה־draft השמור עובר את צינור הייבוא (שלב 84): מפתח שירד מהמרשם
      // מאז השמירה אינו נכנס כיתום — הוא נשמר ב־unmappedLegacy עם issue,
      // כמו בכל ייבוא אחר (אין שני מסלולים ל-draft). ערך שאינו חוקי
      // עוד נדחה בקול רם. draft שלם ותקין נטען כמו שהוא.
      if (typeof saved.draft === 'object' && saved.draft !== null && !Array.isArray(saved.draft)) {
        const { merged, issues, unmapped } = importEntries(Object.entries(saved.draft as Record<string, unknown>));
        return {
          ...base,
          draft: merged,
          issues: Object.freeze(issues),
          unmappedLegacy: Object.freeze({ ...base.unmappedLegacy, ...unmapped }),
          effective: null, // draft נטען — ייבנה רק ב-applyDraft
        };
      }
      return base;
    });
  },
}));
