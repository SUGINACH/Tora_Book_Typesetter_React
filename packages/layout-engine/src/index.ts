/**
 * @tora/layout-engine — מנוע העימוד הדטרמיניסטי.
 *
 * שלב 33 (פרק ה): מנוע v0 — שלד מהלך מסומן (greedy מילוי מקסימלי, שני
 * טורים, הערות בעמודי notes; §18-M4). החוזה הציבורי: typeset() (§12).
 * האלגוריתם הגלובלי מגיע בפרק ו (שלבים 41–48).
 */
export const PACKAGE_NAME = '@tora/layout-engine' as const;

export * from './errors.js';
export * from './v0/v0-settings.js';
export * from './v0/typeset-v0.js';
