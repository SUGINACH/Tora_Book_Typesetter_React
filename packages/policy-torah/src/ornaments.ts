/**
 * ornaments.ts — השפעת העיטורים והמחיצות על המקום הזמין (שלב 69; אפיון §11.2, §14; M8).
 *
 * מה נמדד כאן:
 *   1. **גובה קו-המפריד/עיטור סוף-פרק** (chapterEndDividerLuOf): המפריד נמדד
 *      בתוך המועמד מאז שלב 66 — אבל גובהו הוזרק כ-0 ברירת מחדל עד שהנכסים
 *      נמדדים. כאן המדידה מההגדרות: section-divider-style=none ⇒ 0; אחרת
 *      dim-secdiv-h (px של CSS) ← מ"מ פיזיים ← LU דרך הפרימיטיבים של units
 *      (ADR-001 — אין עיגול מקומי).
 *   2. האזורים הבטוחים של השערים (safeAreaOf) — מומרזים מ-content-model דרך
 *      layout-api; התבנית צורכת אותם (templates.ts, שלב 69) עם נפילה מתועדת
 *      לתיבת השוליים כשאין אזור מהעיצוב.
 *
 * הערת יחידות: הליבה אינה מכירה פיקסלים כלל (ADR-001 §5 — "אין CSS
 * pixels"); המרת ה-px של ההגדרות הישנות חיה כאן, בשכבת המדיניות שמשקפת
 * את ההתנהגות ההיסטורית של הדפדפן: פיקסל CSS פיזי = 25.4/96 מ"מ = 127/480
 * (הגדרת CSS הסטנדרטית; לא המצאה) — מתועד וננעל במאמת השלב.
 */
import {
  mmToLu,
  safeAreaOf,
  type EffectiveSettings,
  type LayoutUnit,
  type SafeAreaFractions,
} from '@tora/layout-api';

/** פיקסל CSS פיזי במ"מ — 25.4/96 (הגדרת CSS; ההתנהגות ההיסטורית של הרינדור). */
export const CSS_PX_MM = 127 / 480;

/** ברירת המחדל הנעולה של גובה המפריד (dim-secdiv-h; settings-matrix.md). */
export const DEFAULT_SECDIV_H_PX = 28;

/** פרוס ממד px של legacy ('28px' ⇒ 28); ערך פסול ⇒ ברירת המחדל הנעולה. */
export function parsePxDimension(raw: unknown, fallback: number): number {
  if (typeof raw === 'string') {
    const m = /^(\d+(?:\.\d+)?)px$/.exec(raw.trim());
    if (m !== null) {
      const v = Number(m[1]!);
      if (Number.isFinite(v) && v >= 0 && v <= 10000) return v;
    }
  }
  return fallback;
}

/**
 * גובה קו-המפריד/עיטור סוף-פרק ב-LU (§10.5; שלב 66 מימש את הצריכה בתוך
 * המועמד — כאן המדידה): section-divider-style='none' ⇒ 0 (אין מפריד —
 * שקוף ומתועד); אחרת dim-secdiv-h ב-px ← מ"מ ← LU (mmToLu מקוונטז
 * למיקרומטר — ADR-001). דטרמיניסטי: אותן הגדרות ⇒ אותו גובה, תמיד.
 */
export function chapterEndDividerLuOf(settings: EffectiveSettings): LayoutUnit {
  const values = settings.values as Record<string, unknown>;
  const style = String(values['section-divider-style'] ?? 'spear');
  if (style === 'none') return mmToLu(0);
  const px = parsePxDimension(values['dim-secdiv-h'], DEFAULT_SECDIV_H_PX);
  return mmToLu(px * CSS_PX_MM);
}

/** האזור הבטוח של עיצוב שער — מומרז מ-content-model (מקור אמת אחד). */
export { safeAreaOf };
export type { SafeAreaFractions };
