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
// פרק ו (M5) — שבירת שורות גלובלית; שלבים 41+
export * from './linebreak/tokens.js';
export * from './linebreak/shaping.js';
export * from './linebreak/candidates.js';
export * from './linebreak/dp.js';
export * from './linebreak/cost-scalar.js';
export * from './linebreak/greedy.js';
export * from './linebreak/policy.js';
export * from './linebreak/quality.js';
export * from './linebreak/ledger-adapter.js';
export * from './linebreak/emergency.js';
export * from './linebreak/paragraph-end.js';
// פרק ז (M6) — עמודים, טורים והערות; שלבים 49+
export * from './pagination/state.js';
