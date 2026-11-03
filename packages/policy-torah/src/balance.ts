/**
 * balance.ts — איזון סוף פרק בשלוש רמות כמדיניות (שלב 66; אפיון §10.5):
 * שלוש רמות האיזון ההיסטוריות הופכות לחלופות בעלות סדר עדיפויות מפורש —
 * המדד גובה regions בפועל (לא מספר תווים ולא מחצית שורות), וההכרעה בחיפוש.
 */

/** רמת האיזון (§10.5): 1 — פיצול חופשי בלי שינוי מספר עמודים; 2 — עם
 * חלופות שורה (drop-word/letter-spacing) מותרות; 3 — גם קיצור/העברה
 * בין עמודים כשהמדיניות מאפשרת (וכל ההערות/הכותרות נשארות חוקיות). */
export type ChapterBalanceLevel = 1 | 2 | 3;

/** מדיניות איזון סוף-פרק. */
export interface ChapterBalancePolicy {
  /** הרמה האפקטיבית לפי ההגדרות (ראה levelOf). */
  readonly level: ChapterBalanceLevel;
  /** רמה 1 — תמיד זמינה: עלות אי-האיזון ברכיב 8 (legacy balanceColumns). */
  readonly freeSplit: true;
  /** רמה 2 — חלופות שורה מותרות: drop-word (מילה ראשונה) משפיע על מדידת הקווים. */
  readonly allowDropWord: boolean;
  /** רמה 2 — letter-spacing מוגבל: מועמד-קו נפרד עם fingerprint שונה (§8; עתידי ב-M5). */
  readonly allowLetterSpacing: boolean;
  /** רמה 3 — העברה בין עמודים (החיפוש חוקר גבולות בכל עמוד ממילא; הדגל במדיניות). */
  readonly allowCrossPageMove: boolean;
  /** סגנון קו-המפריד/עיטור סוף-פרק (section-divider-style; הנכס — M8). */
  readonly dividerStyle: string;
  /** האם קו-המפריד פעיל (סגנון ≠ none). */
  readonly dividerEnabled: boolean;
}

/**
 * הרמה מההגדרות: בסיס 1 (פיצול חופשי — תמיד); drop-word פעיל (mode ≠ none)
 * ⇒ 2; העברות-עמודים מותרות כברירת מחדל במנוע החיפוש שלנו (כל גבול נחקר)
 * ⇒ 3 מוזרק במפורש על-ידי המארח כשהוא מעוניין להגביל/להרחיב.
 */
export function chapterBalancePolicyOf(settings: { readonly values: Readonly<Record<string, unknown>> }): ChapterBalancePolicy {
  const dropMode = String(settings.values['drop-word-mode'] ?? 'window');
  const allowDropWord = dropMode !== 'none';
  const dividerStyle = String(settings.values['section-divider-style'] ?? 'spear');
  const level: ChapterBalanceLevel = allowDropWord ? 2 : 1;
  return Object.freeze({
    level,
    freeSplit: true as const,
    allowDropWord,
    allowLetterSpacing: false, // §8: מועמד-קו נפרד — עתידי; נעול כבוי
    allowCrossPageMove: true, // החיפוש חוקר גבולות בכל עמוד — רמה 3 זמינה
    dividerStyle,
    dividerEnabled: dividerStyle !== 'none',
  });
}
