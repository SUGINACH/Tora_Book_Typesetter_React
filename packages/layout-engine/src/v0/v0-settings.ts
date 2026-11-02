/**
 * v0-settings.ts — קריאת הגדרות אפקטיביות עבור מנוע v0 (שלב 33).
 *
 * v0 הוא שלד מהלך מסומן (§18-M4: "מותר אלגוריתם פשוט כל עום הוא דטרמיניסטי
 * ומסומן"): הוא קורא מפתחות מעטים ומאמת אותם בקפידה. מפתחות נוספים
 * (כותרות, עיטורים, שורות אחרונות וכו') נצרכים בפרקים הבאים; הרישום
 * (consumerId) נקבע כולו כ-'engine' כבר בשלב 30.
 *
 * מקור הגאומטריה: A4 נעול ב-units.ts (§6.1); שוליים 25mm — ברירת המחדל
 * הנעולה של התוכנה הישנה (src/lib/default-settings.ts:184, pageMargins) —
 * העוגן ההיסטורי המתועד היחיד לגאומטריית דף; תבניות העמוד האמיתיות — שלב 50.
 * רוחב הטורים לפי נוסחת הישן (src/worker/engine/typeset-document.ts:33–40)
 * בחשבון LU שלם: textMainWidth = textArea − 2·(prop-margin% · textArea);
 * רווח טורים 5% מ-textMainWidth.
 */
import {
  A4,
  type EffectiveSettings,
  type LayoutUnit,
  mmToLu,
  ptToLu,
  quantizeSetting,
  roundDiv,
  asLu,
} from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';

export interface V0Settings {
  readonly bodyFontSizeLu: LayoutUnit;
  readonly lineHeightFactorPercent: number; // line-height-body × 100, שלם
  readonly markerFontSizeLu: LayoutUnit;
  readonly markerSuperscript: boolean;
  readonly noteScope: 'siman' | 'part' | 'continuous';
  readonly pageScopeRequested: boolean; // fn-reset-mode === 'page' (v0: נדחה בהסבר — NOTES_V0_DEFERRED)
  readonly folioFormat: 'gematria' | 'numeric';
  readonly folioInitial: number;
  readonly geometry: V0Geometry;
}

export interface V0Geometry {
  readonly pageWidth: LayoutUnit;
  readonly pageHeight: LayoutUnit;
  readonly margin: LayoutUnit;
  readonly mainX: LayoutUnit; // הקצה השמאלי של אזור הטורים
  readonly mainWidth: LayoutUnit; // textMainWidth
  readonly columnWidth: LayoutUnit;
  readonly columnGap: LayoutUnit;
  readonly contentTop: LayoutUnit;
  readonly contentBottom: LayoutUnit;
}

function readNumber(settings: EffectiveSettings, key: string, opts: { min: number; max: number }): number {
  const raw = (settings.values as Record<string, unknown>)[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < opts.min || raw > opts.max) {
    throw new LayoutEngineError('errors.engine.SETTING_INVALID', { key, reason: `expected number in [${opts.min},${opts.max}], got ${String(raw)}` }, `הגדרה שגויה: ${key}`);
  }
  return raw;
}

function readEnum<T extends string>(settings: EffectiveSettings, key: string, allowed: readonly T[], fallback: T): T {
  const raw = (settings.values as Record<string, unknown>)[key];
  if (typeof raw === 'string' && (allowed as readonly string[]).includes(raw)) return raw as T;
  if (raw === undefined) return fallback;
  throw new LayoutEngineError('errors.engine.SETTING_INVALID', { key, reason: `expected one of ${allowed.join('|')}, got ${String(raw)}` }, `הגדרה שגויה: ${key}`);
}

const MARGIN_MM = 25; // ברירת מחדל נעולה של הישן (מתועד לעיל)
const GAP_PERCENT = 5; // רווח טורים באחוזים מ-textMainWidth (נוסחת הישן)

export function readV0Settings(settings: EffectiveSettings): V0Settings {
  const sizeBody = readNumber(settings, 'size-body', { min: 4, max: 72 });
  const lineHeight = readNumber(settings, 'line-height-body', { min: 0.5, max: 4 });
  const markerSize = readNumber(settings, 'note-marker-size', { min: 4, max: 24 });
  const propMargin = readNumber(settings, 'prop-margin', { min: 0, max: 25 });
  const fnReset = readEnum<'page' | 'siman' | 'part' | 'continuous'>(settings, 'fn-reset-mode', ['page', 'siman', 'part', 'continuous'], 'page');
  const folioFormat = readEnum<'gematria' | 'numeric'>(settings, 'page-num-format', ['gematria', 'numeric'], 'gematria');
  const folioInitial = readNumber(settings, 'page-num-initial-value', { min: 0, max: 9999 });

  const pageWidth = A4.width;
  const pageHeight = A4.height;
  const margin = mmToLu(MARGIN_MM);
  const textAreaWidth = pageWidth - 2 * margin;
  // חשבון שלם: prop-margin (אחוזים, עשרוני) מוכפל ב-100 ⇐ שלם; רק אז roundDiv
  // (הקוונטיזציה מרוכזת ב-units.ts לפי ADR-001 §4 — quantizeSetting)
  const propMarginCentipercent = quantizeSetting(propMargin, 100, 'prop-margin');
  const marginWidth = roundDiv(propMarginCentipercent * textAreaWidth, 100 * 100);
  const mainWidth = textAreaWidth - 2 * marginWidth;
  const columnGap = asLu(roundDiv(mainWidth * GAP_PERCENT, 100));
  const columnWidth = asLu(roundDiv(mainWidth - columnGap, 2));

  return {
    bodyFontSizeLu: ptToLu(sizeBody),
    lineHeightFactorPercent: quantizeSetting(lineHeight, 100, 'line-height-body'),
    markerFontSizeLu: ptToLu(markerSize),
    markerSuperscript: readEnum<'super' | 'normal'>(settings, 'note-marker-type', ['super', 'normal'], 'super') === 'super',
    noteScope: fnReset === 'page' ? 'siman' : fnReset,
    pageScopeRequested: fnReset === 'page',
    folioFormat,
    folioInitial: quantizeSetting(folioInitial, 1, 'page-num-initial-value'),
    geometry: {
      pageWidth,
      pageHeight,
      margin,
      mainX: asLu(margin + marginWidth),
      mainWidth: asLu(mainWidth),
      columnWidth,
      columnGap,
      contentTop: margin,
      contentBottom: asLu(pageHeight - margin),
    },
  };
}

/** גובה שורה: fontSize · factor — חשבון שלם (roundDiv על אחוזים שלמים). */
export function v0LineHeight(v0: V0Settings): LayoutUnit {
  return asLu(roundDiv(v0.bodyFontSizeLu * v0.lineHeightFactorPercent, 100));
}
