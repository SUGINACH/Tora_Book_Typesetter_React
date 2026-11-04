/**
 * settings-store.ts — draft, presets ו־validation (שלב 76; אפיון §13.1, §13.3).
 *
 * "settingsStore — draft, presets, migrations ו־validation."
 *
 *   1. **כל** הלוגיקה הסמנטית מגיעה מ־`@tora/settings-schema` — ה־store
 *      אינו מממש בדיקת תקינות משלו (אין מימוש מקביל; שיעור כלל 8):
 *      ייבוא ערך/אובייקט ⇐ importSettings; אפקטיבי+hash ⇐
 *      buildEffectiveSettings; המרשם ⇐ buildSettingRegistry מה־registry
 *      המיוצר.
 *   2. מפתח לא מוכר ⇐ issue מתועד **ואינו נכנס ל־draft**; ערך לא חוקי
 *      ⇐ issue וה־draft אינו משתנה. אין תיקון שקט.
 *   3. מפתחות legacy שאינם ממופים במרשם נשמרים ב־unmappedLegacy —
 *      לא נזרקים ולא נמחקים; המיפוי שלהם הוא עבודת שלב 79 (מיגרציית
 *      קובצי הגדרות ישנים), לא החלטה שקטה כאן.
 *   4. שכבות ההפעלה (§6.3): ברירות מחדל < draft; effective נבנה רק
 *      ב־applyDraft — ה־configHash הוא של המצב האפקטיבי, לא של ה־draft.
 */
import { create } from 'zustand';
import {
  buildEffectiveSettings,
  buildSettingRegistry,
  importSettings,
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

export const useSettingsStore = create<SettingsStoreState>()((set) => ({
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
      const next = { ...state, draft: Object.freeze({ ...state.draft, ...merged }), issues: Object.freeze(issues) };
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
      };
      persist(next);
      return next;
    });
    return issueCount;
  },

  applyDraft: () =>
    set((state) => {
      try {
        // ה־draft כבר קנוני ומאומת; השכבות: ברירות מחדל < draft (§6.3).
        const effective = buildEffectiveSettings(settingsRegistry, [state.draft]);
        return { ...state, effective: Object.freeze(effective) };
      } catch (error) {
        // לא אמור לקרות (draft מאומת) — אבל כשל מרשם הוא כשל מפורש,
        // לא מצב "כמעט תקין".
        const code = error instanceof Error && 'code' in error ? String((error as { code: string }).code) : 'errors.settings.INVALID_TYPE';
        const issue: ValidationIssue = Object.freeze({
          code,
          path: '/effective',
          params: { reason: error instanceof Error ? error.message : String(error) },
        });
        return { ...state, issues: Object.freeze([issue]) };
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
    set((state) => ({
      draft: 'draft' in saved ? asDraft(saved.draft) : state.draft,
      presets: 'presets' in saved ? asPresets(saved.presets) : state.presets,
      unmappedLegacy: 'unmappedLegacy' in saved ? asDraft(saved.unmappedLegacy) : state.unmappedLegacy,
    }));
  },
}));
