/**
 * schema.ts — חוזה ההגדרות האפקטיביות (שלב 30; אפיון §6.3).
 *
 * SettingDefinition/SettingRegistry/EffectiveSettings/configHash קנוני.
 * סדר קדימות: built-in defaults < named preset < document settings < run
 * overrides (אין localStorage בליבה). שדות UI חולפים אינם נכנסים ל-
 * EffectiveSettings ולא ל-configHash (§6.3).
 */
import { SettingsError } from './errors.js';

// ─────────────────────────── קנוניזציה מקומית (העתק מקומי — גרף §5; תקדים ADR-002) ───────────────────────────

import { sha256Bytes } from './hash.js';
import { canonicalJson as canonicalJsonImpl } from './canonical.js';

export const canonicalJson: (value: unknown) => string = canonicalJsonImpl;
export const sha256Hex = (text: string): string => sha256Bytes(new TextEncoder().encode(text));

// ─────────────────────────── חוזי הציבור (§6.3) ───────────────────────────

export interface SettingDefinition {
  readonly key: string;
  readonly legacyKey: string;
  readonly schemaVersion: number;
  readonly defaultValue: unknown;
  readonly type: 'boolean' | 'number' | 'dimension' | 'color' | 'font-stack' | 'enum' | 'string';
  readonly enumValues: readonly string[] | null;
  readonly unit: string | null;
  readonly affectsLayout: boolean;
  readonly consumerId: string;
  readonly ui: { readonly section: string; readonly control: string; readonly labelKey: string };
}

export interface SettingRegistry {
  readonly schemaVersion: number;
  readonly byKey: ReadonlyMap<string, SettingDefinition>;
  readonly layoutKeys: readonly string[];
  readonly uiOnlyKeys: readonly string[];
}

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly params: Record<string, string | number | boolean | null>;
}

export interface EffectiveSettings {
  readonly schemaVersion: number;
  readonly enginePolicyId: 'torah-v1';
  readonly values: Readonly<Record<string, unknown>>;
  readonly configHash: string;
}

const DIM_RE = /^(-?)(?:\d+(?:\.\d+)?|\.\d+)(px|em|%|pt|rem)$/;

/** מפתחות legacy שבהם ערך שלילי חוקי (מצב יחסי) — קפוא ומתועד. */
const RELATIVE_NEGATIVE_KEYS: ReadonlySet<string> = new Set(['s-paren']);
const NUM_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

/** בניית מרשם מ-registry.json (מיוצר; נבדק מבנית בזמן טעינה). */
export function buildSettingRegistry(registryJson: {
  schemaVersion: number;
  settings: readonly {
    legacyKey: string; canonicalKey: string; schemaVersion: number; defaultValue: unknown;
    type: SettingDefinition['type']; enum: readonly string[] | null; unit: string | null;
    affectsLayout: boolean; consumerId: string; ui: { section: string; control: string; labelKey: string };
  }[];
}) {
  if (typeof registryJson !== 'object' || registryJson === null || !Array.isArray(registryJson.settings)) {
    throw new SettingsError('errors.settings.REGISTRY_INVALID', { reason: 'missing settings array' }, '/registry');
  }
  const byKey = new Map();
  const layoutKeys: string[] = [];
  const uiOnlyKeys: string[] = [];
  for (const e of registryJson.settings) {
    if (typeof e.legacyKey !== 'string' || typeof e.canonicalKey !== 'string') {
      throw new SettingsError('errors.settings.REGISTRY_INVALID', { reason: 'bad entry' }, '/registry/settings');
    }
    const def = Object.freeze({
      key: e.canonicalKey,
      legacyKey: e.legacyKey,
      schemaVersion: e.schemaVersion,
      defaultValue: e.defaultValue,
      type: e.type,
      enumValues: e.enum ? Object.freeze([...e.enum]) : null,
      unit: e.unit ?? null,
      affectsLayout: e.affectsLayout === true,
      consumerId: e.consumerId,
      ui: Object.freeze({ ...e.ui }),
    });
    if (byKey.has(def.key)) {
      throw new SettingsError('errors.settings.REGISTRY_INVALID', { reason: `duplicate key ${def.key}` }, '/registry/settings');
    }
    byKey.set(def.key, def);
    (def.affectsLayout ? layoutKeys : uiOnlyKeys).push(def.key);
  }
  return Object.freeze({ schemaVersion: registryJson.schemaVersion, byKey, layoutKeys: Object.freeze(layoutKeys), uiOnlyKeys: Object.freeze(uiOnlyKeys) });
}

/** אימות ערך בודד מול הגדרה — החזר בעיות (ריק = תקין). NaN/שלילי/enum לא ידוע נדחים. */
export function validateSettingValue(def: SettingDefinition, rawValue: unknown, path: string): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (code: string, params: Record<string, string | number | boolean | null>): void => { issues.push(Object.freeze({ code, path, params })); };
  if (rawValue === undefined) {
    push('errors.settings.MISSING_VALUE', { key: def.key });
    return issues;
  }
  switch (def.type) {
    case 'boolean': {
      let v = rawValue;
      if (typeof v === 'string' && (v === 'true' || v === 'false')) v = v === 'true';
      if (typeof v !== 'boolean') {
        push('errors.settings.INVALID_TYPE', { key: def.key, value: JSON.stringify(rawValue), type: 'boolean' });
      }
      break;
    }
    case 'number': {
      let v = rawValue;
      if (typeof v === 'string' && NUM_RE.test(v.trim()) && v.trim() !== '') {
        v = Number(v);
        push('errors.settings.COERCED_LEGACY_STRING', { key: def.key, raw: JSON.stringify(rawValue), value: String(v) });
      }
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        push('errors.settings.NON_FINITE_NUMBER', { key: def.key, value: JSON.stringify(rawValue) });
        break;
      }
      // מקורות legacy עם מצב "יחסי" מרשים שלילה: s-paren=-2 עם s-paren-mode:'relative'
      // (גודל סוגריים ביחס לגוף; עדות: default_settings.json + LAYOUT_DEPENDENCY_MAP).
      // כל number אחר — אי-שלילי.
      if (v < 0 && !RELATIVE_NEGATIVE_KEYS.has(def.key)) {
        push('errors.settings.INVALID_VALUE', { key: def.key, value: String(v), expected: 'non-negative' });
      }
      break;
    }
    case 'dimension': {
      const v = String(rawValue).trim();
      const m = DIM_RE.exec(v);
      if (m === null) {
        push('errors.settings.INVALID_VALUE', { key: def.key, value: JSON.stringify(rawValue), expected: '<number>(px|em|%|pt|rem)' });
      } else if (m[1] === '-') {
        push('errors.settings.NEGATIVE_DIMENSION', { key: def.key, value: JSON.stringify(rawValue) });
      }
      break;
    }
    case 'color': {
      if (!HEX_COLOR_RE.test(String(rawValue).trim())) {
        push('errors.settings.INVALID_VALUE', { key: def.key, value: JSON.stringify(rawValue), expected: '#rrggbb' });
      }
      break;
    }
    case 'font-stack': {
      // ריק = לא הוגדר (מורשת legacy; למשל f-paren): חוקי, אינו נפסל
      if (typeof rawValue !== 'string' || (rawValue.trim() === '' && rawValue !== '')) {
        push('errors.settings.INVALID_VALUE', { key: def.key, value: JSON.stringify(rawValue), expected: 'css font stack' });
      }
      break;
    }
    case 'enum': {
      if (!def.enumValues?.includes(String(rawValue))) {
        push('errors.settings.UNKNOWN_ENUM_VALUE', { key: def.key, value: JSON.stringify(rawValue), allowed: (def.enumValues ?? []).join('|') });
      }
      break;
    }
    default: {
      if (typeof rawValue !== 'string') {
        push('errors.settings.INVALID_TYPE', { key: def.key, value: JSON.stringify(rawValue), type: 'string' });
      }
      break;
    }
  }
  return Object.freeze(issues);
}

/**
 * ייבוא אובייקט הגדרות (legacy/פריסט/מסמך/override) מול מרשם.
 * מפתח לא מוכר ← בעיה עם path (אינו נמחק בשקט); ערכי מחרוזת-מספר legacy
 * מומרים עם אזהרה מתועדת; הפלט: ערכים קנוניים (ערכי מספר = number).
 */
export function importSettings(obj: unknown, registry: SettingRegistry, path = '/settings'): { issues: readonly ValidationIssue[]; values: Readonly<Record<string, unknown>> | null } {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { issues: [Object.freeze({ code: 'errors.settings.INVALID_TYPE', path, params: { value: JSON.stringify(obj), type: 'object' } })], values: null };
  }
  const issues: ValidationIssue[] = [];
  const values: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(obj)) {
    const def = registry.byKey.get(rawKey);
    if (def === undefined) {
      issues.push(Object.freeze({ code: 'errors.settings.UNKNOWN_KEY', path: `${path}/${rawKey}`, params: { key: rawKey } }));
      continue;
    }
    for (const issue of validateSettingValue(def, rawValue, `${path}/${rawKey}`)) {
      if (issue.code === 'errors.settings.COERCED_LEGACY_STRING') {
        issues.push(issue); // אזהרה בלבד — המרה מתועדת
      } else {
        issues.push(issue);
      }
    }
    if (issues.some((i) => i.path === `${path}/${rawKey}` && i.code !== 'errors.settings.COERCED_LEGACY_STRING')) continue;
    // קנוניזציה: מחרוזת-מספר ← number; מחרוזת-בוליאן ← boolean
    let canonical = rawValue;
    if (def.type === 'number' && typeof rawValue === 'string') canonical = Number(rawValue);
    if (def.type === 'boolean' && typeof rawValue === 'string') canonical = rawValue === 'true';
    values[def.key] = canonical;
  }
  return { issues: Object.freeze(issues), values: issues.some((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING') ? null : Object.freeze(values) };
}

/** configHash קנוני — רק מפתחות פריסה, מפתחות ממוינית (סדר keys אינו משנה). */
export function computeConfigHash(effectiveValues: Readonly<Record<string, unknown>>, registry: SettingRegistry): string {
  const layout: Record<string, unknown> = {};
  for (const key of registry.layoutKeys) {
    if (key in effectiveValues) layout[key] = effectiveValues[key];
  }
  return sha256Hex(canonicalJson(layout));
}

/** בניית EffectiveSettings: ברירות מחדל < פריסט < מסמך < override (§6.3). */
export function buildEffectiveSettings(registry: SettingRegistry, layers: readonly Readonly<Record<string, unknown>>[]): EffectiveSettings {
  const values: Record<string, unknown> = {};
  const apply = (obj: Readonly<Record<string, unknown>>): void => {
    for (const [k, v] of Object.entries(obj)) {
      if (registry.byKey.has(k) && v !== undefined) values[k] = v;
    }
  };
  // ברירות מחדל: ערכי המקור בצורתן הקנונית (המרת מחרוזות legacy מתועדת בייבוא)
  for (const def of registry.byKey.values()) {
    const { issues: defIssues, values: defValues } = importSettings({ [def.legacyKey]: def.defaultValue }, registry, '/defaults');
    void defIssues;
    if (defValues !== null && def.key in defValues) values[def.key] = defValues[def.key];
  }
  for (const layer of layers) {
    // כל שכבה (פריסט/מסמך/override) עוברת את אותו צינור ייבוא — ערכים
    // לא-חוקיים בשכבה נדחים (אין עקיפת האימות); קנוניזציה אחידה לפני ה-hash.
    const out = importSettings(layer, registry, '/layer');
    if (out.issues.some((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING')) {
      const first = out.issues.find((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING')!;
      throw new SettingsError(first.code as never, first.params as Record<string, string | number | boolean | null>, first.path);
    }
    apply(out.values ?? {});
  }
  const configHash = computeConfigHash(values, registry);
  return Object.freeze({
    schemaVersion: registry.schemaVersion,
    enginePolicyId: 'torah-v1',
    values: Object.freeze(values),
    configHash,
  });
}
