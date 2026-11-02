/**
 * @tora/policy-torah — H0–H7, הערות, drop-word, סוגריים, שערים
 *
 * שלב 58 (פרק ח; אפיון §10): המדיניות התורנית המוזרקת — הליבה הגנרית
 * אינה "יודעת" מהו H2; ההתנהגויות מגיעות מהמרשם דרך hooks.
 * ה־API הציבורי של החבילה נחשף דרך קובץ זה בלבד.
 */
export const PACKAGE_NAME = '@tora/policy-torah' as const;

export * from './headings.js';
export * from './registry.js';
export * from './policy.js';
