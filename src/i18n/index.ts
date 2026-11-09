/**
 * index.ts — תשתית ה-i18n (שלב 93; אפיון §16).
 *
 * מבנה לפי האפיון: locales/he-IL/{common,settings,errors,audit}.json וכן
 * en-US (locale בדיקה למניעת hard-coded). ה-he-IL הוא שפת המקור וברירת
 * המחדל; ה-en-US נבנה כלocale בדיקה — תרגום המעטפת (common/מדורים/
 * חומרות) מלא; תוויות ההגדרות מציגות בו את המפתח הקנוני היציב (תפקידו
 * לתפוס מחרוזות קשיחות — לא תרגום תוכן; תיעוד ב-ADR/WORKLOG).
 *
 * מפתחות יציבים; אין הצגת message גולם (§16); המספרים/תאריכים דרך Intl
 * (formatters.ts); גימטריה — domain formatter נפרד (policy-torah/folio).
 */
import commonHe from './locales/he-IL/common.json';
import settingsHe from './locales/he-IL/settings.json';
import errorsHe from './locales/he-IL/errors.json';
import auditHe from './locales/he-IL/audit.json';
import commonEn from './locales/en-US/common.json';
import settingsEn from './locales/en-US/settings.json';
import errorsEn from './locales/en-US/errors.json';
import auditEn from './locales/en-US/audit.json';

export type Locale = 'he' | 'en';
export const DEFAULT_LOCALE: Locale = 'he';

export interface Messages {
  readonly common: typeof commonHe;
  readonly settings: typeof settingsHe;
  readonly errors: typeof errorsHe;
  readonly audit: typeof auditHe;
}

const BY_LOCALE: Readonly<Record<Locale, Messages>> = Object.freeze({
  he: Object.freeze({ common: commonHe, settings: settingsHe, errors: errorsHe, audit: auditHe }),
  en: Object.freeze({ common: commonEn, settings: settingsEn, errors: errorsEn, audit: auditEn }),
});

/** חבילת ההודעות לפי locale (קפואה). */
export function messagesOf(locale: Locale): Messages {
  return BY_LOCALE[locale] ?? BY_LOCALE.he;
}

/** תרגום מפתח common עם פרמטרים ({count} וכו'). */
export function t(m: Messages, key: string, params?: Readonly<Record<string, string | number>>): string {
  const raw = (m.common as Readonly<Record<string, string>>)[key];
  if (raw === undefined) return key;
  if (params === undefined) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (params[name] !== undefined ? String(params[name]) : whole));
}

export const dirOf = (locale: Locale): 'rtl' | 'ltr' => (locale === 'he' ? 'rtl' : 'ltr');
export { commonHe, settingsHe, errorsHe, auditHe, commonEn, settingsEn, errorsEn, auditEn };
