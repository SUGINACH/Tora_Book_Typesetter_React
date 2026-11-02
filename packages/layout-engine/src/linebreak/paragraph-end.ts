/**
 * paragraph-end.ts — כללי שורה אחרונה, runt ו־widow/orphan ברמת הפסקה (שלב 45;
 * אפיון §7, §8.2; ADR-004 רכיבים 4–5; הגדרות מנספח ג).
 *
 * הכללים נכנסים לחישוב העלות של ה־DP ומשפיעים על בחירת מועמדים **בלבד**
 * (שער המעבר של השלב): אין post-pass שמזיז מילים אחרי השבירה. בתוכנה
 * הישנה avoid-runt-word מומש כ־applyAvoidRuntWord — מיזוג שתי המילים
 * האחרונות אחרי מדידה (Orange typesetter.js:566, "כך שתי המילים האחרונות
 * נשארות יחד") — כאן היא עדות בלבד: ה־DP מעדיף מסלול שבו לשורה האחרונה
 * יש ≥2 מילים כשההגדרה פעילה, בלי להזיז מילה אחרי הבחירה (§23.7).
 *
 * מיפוי הגדרות (registry.json; נספח ג):
 *   - `avoid-runt-word` (boolean, ברירת מחדל true) → `runtDebt` (רכיב 5):
 *     שורה אחרונה חד־מילולית בפסקה רב־שורתית.
 *   - `avoid-orphans` (boolean, true) → `widowOrphanDebt` (רכיב 4): קו פתיחה
 *     חד־מילולי — יתום ברמת הפסקה (ההיטל של "בקרת ראש הטור" מהישן).
 *   - `body-last-line-align` (enum center|right, 'center') → יישור קו הסיום.
 *     נאכף ב־policy בכך שקו הסיום אינו ממתח רווחים לעולם (justification
 *     'last'; §8.2: "שורה אחרונה אינה מוארכת כמו שורת justify רגילה"),
 *     והערך מועבר הלאה להצבה ול־IR (חיבור מלא בשלב 47).
 *   - `avoid-widows` (boolean, true) — בקרת **תחתית טור** ברמת העמוד בישן
 *     (Orange typesetter.js:854–857, כולל היפוך השמות המתועד שם: avoid-widows
 *     הוא הבקרה התחתונה) — אין לו היקף פסקה; מצטרף ב־M6 (שלבים 49+) לאותו
 *     רכיב 4 עם הקשר העמוד. כאן הוא אינו נקרא.
 *
 * טהור ודטרמיניסטי: אותן הגדרות ואותו הקשר ⇒ אותם חובות.
 */
import { LayoutEngineError } from '../errors.js';
import type { LineContext } from './dp.js';

/** כללי סיום פסקה — נקראים מ־EffectiveSettings.values (מפתחות registry). */
export interface ParagraphEndRules {
  /** avoid-runt-word: מנע מילה בודדת בשורה האחרונה של פסקה רב־שורתית. */
  readonly avoidRuntWord: boolean;
  /** avoid-orphans: מנע קו פתיחה חד־מילולי (יתום ברמת הפסקה). */
  readonly avoidOrphans: boolean;
  /** body-last-line-align: יישור קו סיום הפסקה (center|right). */
  readonly lastLineAlign: 'center' | 'right';
}

/** ברירות המחדל הנעולות של המרשם (registry.json; מקור Orange default_settings.json). */
export const DEFAULT_PARAGRAPH_END_RULES: ParagraphEndRules = Object.freeze({
  avoidRuntWord: true,
  avoidOrphans: true,
  lastLineAlign: 'center',
});

function readBooleanSetting(values: Readonly<Record<string, unknown>>, key: string): boolean | undefined {
  const raw = values[key];
  if (raw === undefined) return undefined;
  if (typeof raw === 'boolean') return raw;
  throw new LayoutEngineError(
    'errors.engine.SETTING_INVALID',
    { key, reason: `expected boolean, got ${typeof raw}` },
    `הגדרה שגויה: ${key}`,
  );
}

function readLastLineAlign(values: Readonly<Record<string, unknown>>): 'center' | 'right' | undefined {
  const raw = values['body-last-line-align'];
  if (raw === undefined) return undefined;
  if (raw === 'center' || raw === 'right') return raw;
  throw new LayoutEngineError(
    'errors.engine.SETTING_INVALID',
    { key: 'body-last-line-align', reason: `expected center|right, got ${String(raw)}` },
    'הגדרה שגויה: body-last-line-align',
  );
}

/**
 * קריאת כללי סיום פסקה מערכי הגדרות אפקטיביים. ערך חסר ← ברירת המחדל
 * הנעולה; ערך שגוי ← שגיאה מקוטלגת (אין החלפה שקטה — §23.9).
 */
export function readParagraphEndRules(values: Readonly<Record<string, unknown>>): ParagraphEndRules {
  return Object.freeze({
    avoidRuntWord: readBooleanSetting(values, 'avoid-runt-word') ?? DEFAULT_PARAGRAPH_END_RULES.avoidRuntWord,
    avoidOrphans: readBooleanSetting(values, 'avoid-orphans') ?? DEFAULT_PARAGRAPH_END_RULES.avoidOrphans,
    lastLineAlign: readLastLineAlign(values) ?? DEFAULT_PARAGRAPH_END_RULES.lastLineAlign,
  });
}

/** חובות קו לפי כללי סיום הפסקה — 0 או 1 לכל רכיב (ADR-004 #4–5). */
export interface ParagraphEndDebts {
  /** רכיב 4 — קו פתיחה חד־מילולי (יתום ברמת הפסקה). */
  readonly widowOrphanDebt: 0 | 1;
  /** רכיב 5 — שורה אחרונה חד־מילולית בפסקה רב־שורתית (runt). */
  readonly runtDebt: 0 | 1;
}

/**
 * חישוב החובות של קו בהקשרו. פסקה חד־שורתית (isFirst וגם isLast) אינה
 * נחשבת לאף אחד מהם — כמו בישן ("ויש יותר משורה אחת", applyAvoidRuntWord).
 */
export function paragraphEndDebts(ctx: LineContext, rules: ParagraphEndRules): ParagraphEndDebts {
  const singleWord = ctx.candidate.metrics.wordCount === 1;
  const runtDebt = rules.avoidRuntWord && ctx.isLast && ctx.lineIndex > 0 && singleWord ? 1 : 0;
  const widowOrphanDebt = rules.avoidOrphans && ctx.isFirst && !ctx.isLast && singleWord ? 1 : 0;
  return Object.freeze({ widowOrphanDebt, runtDebt });
}
