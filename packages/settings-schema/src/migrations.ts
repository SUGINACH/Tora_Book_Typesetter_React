/**
 * migrations.ts — שרשרת מיגרציות טהורה ודטרמיניסטית vN→vN+1 (שלב 30; §6.3).
 *
 * המרשם הנוכחי: schemaVersion 1 (Orange אינו מספר גרסאות — כל קובצי legacy
 * הם v1). שרשרת המיגרציות ריקה כרגע; הוספת מיגרציה חייבת fixture לכל פריסט
 * ולכל גרסה (נבדק במאמת). מיגרציה אינה מוחקת מפתח לא מוכר — דחייה עם קוד.
 */
import { SettingsError } from './errors.js';

export interface SettingsMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly describe: string;
  /** טהור: אותו קלט ⇐ אותו פלט; אין זמן/אקראיות; רשומות שינוי מתועדות. */
  readonly apply: (settings: Readonly<Record<string, unknown>>) => { settings: Readonly<Record<string, unknown>>; changes: readonly string[] };
}

/** השרשרת — ממוינת לפי fromVersion; אין כפילויות. */
export const SETTINGS_MIGRATIONS: readonly SettingsMigration[] = Object.freeze([]);

export function migrateSettings(settings: Readonly<Record<string, unknown>>, fromVersion: number, targetVersion = 1): { settings: Readonly<Record<string, unknown>>; fromVersion: number; toVersion: number; steps: readonly number[] } {
  let current: Readonly<Record<string, unknown>> = settings;
  let version = fromVersion;
  const applied: number[] = [];
  for (;;) {
    if (version === targetVersion) break;
    const step = SETTINGS_MIGRATIONS.find((m) => m.fromVersion === version);
    if (step === undefined || step.toVersion > targetVersion) {
      throw new SettingsError('errors.settings.MIGRATION_FAILED', { fromVersion: version, toVersion: targetVersion, reason: 'no-migration-step' }, '/settings/migration');
    }
    const out = step.apply(current);
    current = out.settings;
    applied.push(step.toVersion);
    version = step.toVersion;
    if (applied.length > 32) {
      throw new SettingsError('errors.settings.MIGRATION_FAILED', { fromVersion, toVersion: targetVersion, reason: 'migration-loop' }, '/settings/migration');
    }
  }
  return Object.freeze({ settings: current, fromVersion, toVersion: version, steps: Object.freeze(applied) });
}
