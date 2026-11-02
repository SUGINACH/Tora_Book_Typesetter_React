/**
 * endnotes.ts — הערות סיום כזרם מדוד ומשוב לנקודת השבת (שלב 55; פרק ז/M6).
 *
 * אסמכתא: אפיון §10.3 Endnotes ("זרם נפרד עם anchors הדדיים, מיקום בסוף
 * חלק/ספר לפי הגדרה; שינוי מספר עמודי הגוף כתוצאה מה־endnotes נכנס ל־outer
 * fixed-point כאשר יש הפניות"), §11.1 (fixed-point — ההרצה עצמה בשלב 71;
 * כאן הממשק), §10.3 מדיניות פיצול (כמו ADR-005: אטומי כברירת מחדל;
 * ארוכה מעמוד — פיצול בגבולות קווים עם LONG_NOTE_SPLIT או כשל מפורש).
 *
 * עקרונות (שער השלב: "אין endnote יתום או קישור לא מדויק"):
 *   1. ה-endnotes זרם **מדוד** — גופי ההערות נשברו לקווים (שלב 47) ומוצבים
 *      על עמודי notes (tpl:notes; שלב 50) במילוי טור בודד, רציף ודטרמיניסטי.
 *   2. **קישורים הדדיים**: כל הערה נושאת את עוגן הגוף (בלוק+קו) ואת מספר
 *      העמוד הפיזי שלה; הדוח ממפה noteId ↔ (עמוד, טווח קווים, עוגן) —
 *      ה־AnchorTable (שלב 70/71) צורך את המיפוי כמות שהוא.
 *   3. **משוב לנקודת השבת** (§11.1): עמודי ה-endnotes מתחילים אחרי עמודי
 *      הגוף — offset = bodyPageCount; שינוי במספר עמודי הגוף מזיז את כל
 *      המיפוי ומשנה את mappingHash — וזה בדיוק האות שה־outer fixed-point
 *      (שלב 71) מאזין לו; אין ניחוש מקומי.
 *   4. **מספור**: הסודר (1..N) נקבע לפי סדר הזרימה ונישא כ-resolved ordinal
 *      — התווית המודפסת לפי formatNoteLabel של content-model (נספח הגדרות).
 *   5. **מדיניות פיצול** (ADR-005 בהטלה): אטומי כברירת מחדל; ארוכה מעמוד
 *      ריק — פיצול בגבולות קווים עם המשך בעמוד הבא ורישום LONG_NOTE_SPLIT
 *      (allowLongNoteSplit=true) או כשל מפורש.
 */
import { canonicalJson, sha256Hex } from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';
import type { NoteBodySpec } from './notes.js';
import { reserveNote, resolveNotePolicy, splitNoteBodySpec, type NoteReservationPolicy } from './notes.js';
import type { PageTemplateSet } from './templates.js';

// ─────────────────────────── הזרם ───────────────────────────

/** הערת סיום אחת — גוף מדוד + עוגן הגוף (קישור הדדי). */
export interface EndnoteEntry {
  readonly noteId: string;
  /** גוף ההערה המדוד (קווים גמורים משלב 47). */
  readonly body: NoteBodySpec;
  /** עוגן הגוף — הבלוק והקו שבהם מופיעה ההפניה (קישור הדדי; §10.3). */
  readonly anchor: {
    readonly blockId: string;
    readonly lineId: string;
  };
}

/** הגדרות זרם ה-endnotes — מדיניות פיצול כמו ADR-005 + היכן נפתח. */
export interface EndnoteFlowOptions {
  /** מספר עמודי הגוף שלפני הזרם — ה-offset של עמודי ה-endnotes (§11.1). */
  readonly bodyPageCount: number;
  /** מדיניות פיצול (ADR-005 בהטלה): ברירת מחדל — אטום, כשל מפורש לארוכה מעמוד. */
  readonly notePolicy?: NoteReservationPolicy;
}

// ─────────────────────────── התוצאה ───────────────────────────

/** הצבת הערה אחת על עמוד ה-endnotes. */
export interface EndnotePlacement {
  readonly noteId: string;
  /** הסודר בזרם (1..N לפי סדר המקור) — resolved; התווית לפי formatNoteLabel. */
  readonly ordinal: number;
  /** מזהה ההמשך כשההערה נפרשה (‎{noteId}#cont‎; רשומה נפרדת). */
  readonly continuationOf?: string;
  /** העמוד הפיזי של ההערה (bodyPageCount + עמוד הזרם; 1-based). */
  readonly physicalPage: number;
  /** הקווים שהוצבו בהערה זו על עמוד זה (פיצול ⇒ טווח חלקי). */
  readonly linesPlaced: number;
  /** גובה שהוצב (0 כשההערה נדחקה לעמוד הבא בשלמותה — אטומיות). */
  readonly heightLu: number;
  /** הפיצול נרשם — הצרכן מעביר לפנקס כ-LONG_NOTE_SPLIT. */
  readonly split: boolean;
  /** העוגן בגוף — קישור הדדי (§10.3). */
  readonly anchor: EndnoteEntry['anchor'];
}

export interface EndnoteFlowResult {
  /** סך עמודי ה-endnotes (הזרם מתחיל ב-bodyPageCount+1). */
  readonly pages: number;
  readonly placements: readonly EndnotePlacement[];
  /** מיפוי העוגנים לצריכת ה־AnchorTable: noteId → עמוד פיזי ראשון. */
  readonly anchorReport: Readonly<Record<string, number>>;
  /**
   * hash קנוני של המיפוי (noteId → עמוד) — **אות המשוב לנקודת השבת**
   * (§11.1): שינוי במספר עמודי הגוף או בפריסת הזרם משנה את החתימה;
   * ה־outer fixed-point (שלב 71) משווה בין איטרציות. אין pageEstimate.
   */
  readonly mappingHash: string;
  readonly splits: number;
  /** עמוד הזרימה הראשון (פיזי). */
  readonly firstPhysicalPage: number;
}

// ─────────────────────────── אימות ───────────────────────────

/** אימות ערך endnote — רשימת בעיות (ריקה = תקין). */
export function endnoteEntryIssues(entry: unknown): string[] {
  const issues: string[] = [];
  const v = entry as Record<string, unknown> | null;
  if (typeof v !== 'object' || v === null) return ['not-an-object'];
  if (typeof v.noteId !== 'string' || v.noteId.length === 0) issues.push('noteId');
  if (typeof v.body !== 'object' || v.body === null || typeof (v.body as Record<string, unknown>).noteId !== 'string') issues.push('body');
  const a = v.anchor as Record<string, unknown> | null | undefined;
  if (typeof a !== 'object' || a === null || typeof a.blockId !== 'string' || a.blockId.length === 0
    || typeof a.lineId !== 'string' || a.lineId.length === 0) issues.push('anchor');
  return issues;
}

// ─────────────────────────── פריסת הזרם ───────────────────────────

/**
 * פריסת זרם ה-endnotes על עמודי notes — מילוי טור בודד, רציף, דטרמיניסטי.
 *
 * כל הערה אטומה כברירת מחדל: נכנסת בשלמותה לעמוד או עוברת כולה לעמוד הבא
 * (אין יתומות); ארוכה מעמוד ריק — פיצול בגבולות קווים עם המשך (הרשומה
 * הבאה בזרם) או כשל מפורש (ADR-005 בהטלה). תקציב העמוד = גובה אזור
 * הטור של tpl:notes (מלוא התוכן; §9.3).
 */
export function layoutEndnoteFlow(
  entries: readonly EndnoteEntry[],
  templates: PageTemplateSet,
  options: EndnoteFlowOptions,
): EndnoteFlowResult {
  if (!Number.isSafeInteger(options.bodyPageCount) || options.bodyPageCount < 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'endnotes', reason: `bodyPageCount=${String(options.bodyPageCount)}` }, 'מספר עמודי גוף שגוי');
  }
  const seen = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const issues = endnoteEntryIssues(entries[i]);
    if (issues.length > 0) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'endnotes', reason: `entries[${i}]: ${issues.join(';')}` }, `ערך endnote שגוי: ${issues.join(';')}`);
    }
    const id = (entries[i] as EndnoteEntry).noteId;
    if (seen.has(id)) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'endnotes', reason: `duplicate ${id}` }, `הערת סיום כפולה: ${id}`);
    }
    seen.add(id);
  }
  const policy = resolveNotePolicy(options.notePolicy);
  // תקציד עמוד notes ריק: גובה אזור הטור מהתבנית (tpl:notes:recto)
  const notesTemplate = templates.for('notes', 1);
  const bodyRegion = notesTemplate.regions.find((r) => r.role === 'body-column');
  if (bodyRegion === undefined) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'endnotes', reason: 'notes template lacks body-column' }, 'תבנית notes חסרה');
  }
  const pageBudget = bodyRegion.rect.height;

  const placements: EndnotePlacement[] = [];
  const anchorReport: Record<string, number> = {};
  let flowPage = 1; // עמוד הזרם (1-based); הפיזי = bodyPageCount + flowPage
  let usedOnPage = 0;
  let splits = 0;
  const firstPhysicalPage = options.bodyPageCount + 1;

  const flushPage = () => {
    flowPage += 1;
    usedOnPage = 0;
  };

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex]!;
    const ordinal = entryIndex + 1;
    let spec: NoteBodySpec = entry.body;
    let continuationOf: string | undefined;
    let anchor = entry.anchor;
    let noteId = entry.noteId;
    // הערה (או המשך) עשויה להיפרש על כמה עמודים — לולאת הצבה עד גמר
    let done = false;
    let guard = 0;
    while (!done) {
      guard += 1;
      if (guard > 10000) {
        throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'endnotes', reason: 'loop' }, 'לולאת פריסת endnotes אינה מסתיימת');
      }
      const available = pageBudget - usedOnPage;
      const outcome = reserveNote(spec, available, pageBudget, policy);
      if (outcome.kind === 'fits') {
        placements.push({ noteId, ordinal, ...(continuationOf !== undefined ? { continuationOf } : {}), physicalPage: firstPhysicalPage + flowPage - 1, linesPlaced: spec.lineHeightLu.length, heightLu: outcome.placedHeightLu, split: false, anchor });
        if (continuationOf === undefined) anchorReport[entry.noteId] = firstPhysicalPage + flowPage - 1;
        usedOnPage += outcome.placedHeightLu;
        done = true;
      } else if (outcome.kind === 'split') {
        placements.push({ noteId, ordinal, ...(continuationOf !== undefined ? { continuationOf } : {}), physicalPage: firstPhysicalPage + flowPage - 1, linesPlaced: outcome.placedLines, heightLu: outcome.placedHeightLu, split: true, anchor });
        if (continuationOf === undefined) anchorReport[entry.noteId] = firstPhysicalPage + flowPage - 1;
        usedOnPage += outcome.placedHeightLu;
        splits += 1;
        spec = splitNoteBodySpec(spec, outcome.placedLines);
        noteId = spec.noteId;
        continuationOf = entry.noteId;
        flushPage();
        anchor = entry.anchor; // ההמשך נושא את אותו עוגן — קישור הדדי נשמר
      } else if (outcome.kind === 'defer') {
        // אטומית שאינה נכנסת לשארית — עוברת בשלמותה לעמוד הבא (אין יתומות)
        flushPage();
      } else {
        // fail: ארוכה מעמוד ריק בלי פיצול — כשל מפורש (§8.2)
        throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'endnotes', reason: `endnote ${entry.noteId} taller than an empty notes page and split forbidden (ADR-005)` }, `הערת סיום גדולה מעמוד notes ריק: ${entry.noteId}`);
      }
    }
  }
  const mappingHash = sha256Hex(canonicalJson({ v: 1, kind: 'endnote-anchors', bodyPageCount: options.bodyPageCount, anchors: anchorReport }));
  return Object.freeze({
    pages: flowPage,
    placements: Object.freeze(placements),
    anchorReport: Object.freeze(anchorReport),
    mappingHash,
    splits,
    firstPhysicalPage,
  });
}
