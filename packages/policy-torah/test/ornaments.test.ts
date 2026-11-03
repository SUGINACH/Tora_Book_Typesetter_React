/**
 * ornaments.test.ts — בדיקות שלב 69: השפעת עיטורים על המקום הזמין —
 * המדיניות (§11.2, §14; פרק ט/M8).
 *
 * מה מוכח כאן:
 *   1. מדידת קו-המפריד מההגדרות (chapterEndDividerLuOf): none ⇒ 0;
 *      px של CSS ← מ"מ פיזיים ← LU (דרך mmToLu — ADR-001); פרופורציונליות;
 *      ערך פסול ⇒ ברירת המחדל הנעולה (28px).
 *   2. המרת ה-px חיה במדיניות בלבד (לא בליבה — ADR-001 §5 "אין CSS
 *      pixels"): CSS_PX_MM = 127/480 — הגדרת CSS, מתועדת ונעולה.
 *   3. safeAreaOf מומרז מ-content-model דרך layout-api — אותה תוצאה
 *      כמו הבעלים (מקור אמת אחד).
 *   4. דטרמיניזם: אותן הגדרות ⇒ אותו גובה, תמיד.
 */
import { describe, expect, it } from 'vitest';
import { mmToLu, type EffectiveSettings } from '@tora/layout-api';
import {
  CSS_PX_MM,
  chapterEndDividerLuOf,
  DEFAULT_SECDIV_H_PX,
  parsePxDimension,
  safeAreaOf,
} from '../src/ornaments.js';

const mk = (values: Record<string, unknown>): EffectiveSettings =>
  ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'test' });

describe('שלב 69: ornaments — מדידת מחיצות ואזורים בטוחים במדיניות', () => {
  it('chapterEndDividerLuOf: section-divider-style=none ⇒ 0 — כיבוי שקוף ומתועד', () => {
    expect(chapterEndDividerLuOf(mk({ 'section-divider-style': 'none', 'dim-secdiv-h': '28px' }))).toBe(0);
  });

  it('chapterEndDividerLuOf: 28px ⇒ מ"מ פיזיים ← LU דרך mmToLu; פרופורציונלי; ברירת מחדל נעולה לערך פסול', () => {
    expect(chapterEndDividerLuOf(mk({ 'section-divider-style': 'spear', 'dim-secdiv-h': '28px' })))
      .toBe(mmToLu(28 * CSS_PX_MM));
    expect(chapterEndDividerLuOf(mk({ 'section-divider-style': 'spear', 'dim-secdiv-h': '56px' })))
      .toBe(mmToLu(56 * CSS_PX_MM));
    expect(chapterEndDividerLuOf(mk({ 'section-divider-style': 'spear', 'dim-secdiv-h': 'lorem' })))
      .toBe(mmToLu(DEFAULT_SECDIV_H_PX * CSS_PX_MM));
    expect(chapterEndDividerLuOf(mk({ 'section-divider-style': 'spear' })))
      .toBe(mmToLu(DEFAULT_SECDIV_H_PX * CSS_PX_MM));
  });

  it('CSS_PX_MM = 127/480 (25.4/96 — הגדרת CSS הפיזית); parsePxDimension דוחה ערכים שאינם px', () => {
    expect(CSS_PX_MM).toBe(25.4 / 96);
    expect(CSS_PX_MM).toBe(127 / 480);
    expect(parsePxDimension('28px', 5)).toBe(28);
    expect(parsePxDimension('12.5px', 5)).toBe(12.5);
    expect(parsePxDimension('1.25em', 5)).toBe(5);
    expect(parsePxDimension('65%', 5)).toBe(5);
    expect(parsePxDimension(undefined, 5)).toBe(5);
  });

  it('safeAreaOf מומרז מהבעלים (content-model דרך layout-api) — מקור אמת אחד; דטרמיניזם', () => {
    expect(safeAreaOf({ left: 0.25, top: 0.2, right: 0.15, bottom: 0.1 })).toEqual({ left: 0.25, top: 0.2, width: 0.6, height: 0.7 });
    expect(safeAreaOf(null)).toBeNull();
    expect(safeAreaOf({ left: 1.235, top: 0.206, right: 0.29, bottom: 0.206 })).toBeNull();
    const s = mk({ 'section-divider-style': 'spear', 'dim-secdiv-h': '28px' });
    expect(chapterEndDividerLuOf(s)).toBe(chapterEndDividerLuOf(s));
  });
});
