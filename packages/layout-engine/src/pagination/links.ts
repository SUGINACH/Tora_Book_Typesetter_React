/**
 * links.ts — בניית מערכת הקישורים מהתוצאות המיוצבות (שלב 72; אפיון §11, §14–15; M8).
 *
 * "לוודא שכל קישורי ההערות והמסמך נכונים לאחר נקודת השבת" (תכנית 72):
 * הבונים כאן פועלים על התוצאות שהלולאה החיצונית (שלב 71) ייצבה — זרם
 * ה-endnotes הסופי, ערכי ה-TOC וה-AnchorTable. כל קישור נבנה בשני הכיוונים
 * (הערה ⇄ גוף; TOC ⇄ כותרת) עם העמוד הפיזי **מהתוצאה בפועל** — אין pageEstimate.
 *
 * המשכי הערות (פיצול ADR-005): לכל הצבה של המשך נבנית רשומת הכיוון
 * note-back אל עוגן הגוף המקורי — אותה נשיאת-עוגן של שלב 55; ההפניה
 * הקדמית (note) נבנית פעם אחת לכל הערה (מההצבה הראשונה).
 *
 * כל המזהים דטרמיניסטיים — makeLinkId מהתוכן; סדר הבנייה אינו משנה
 * (linkMappingHash ממוין לפי linkId).
 */
import {
  type AnchorTable,
  type LinkRecord,
  buildLinkTable,
  type LinkTable,
  makeLinkId,
} from '@tora/layout-api';
import type { EndnoteFlowResult, EndnoteEntry } from './endnotes.js';

// ─────────────────────────── endnotes ⇄ גוף ───────────────────────────

/**
 * קישורי עוגן↔הערה מזרם ה-endnotes המיוצב: לכל הערה — הפניה קדימה
 * (בלוק הגוף ⇒ ההערה בעמודה הפיזי) וקישור חזרה (ההערה ⇒ עוגן הגוף);
 * לכל המשך (continuationOf) — קישור חזרה נוסף מאותו עוגן גוף.
 */
export function endnoteLinksOf(flow: EndnoteFlowResult, entries: readonly EndnoteEntry[]): LinkTable {
  const records: LinkRecord[] = [];
  const anchorByNote = new Map<string, EndnoteEntry['anchor']>();
  for (const e of entries) anchorByNote.set(e.noteId, e.anchor);
  const forwardDone = new Set<string>();
  for (const p of flow.placements) {
    const originalId = p.continuationOf ?? p.noteId;
    const anchor = anchorByNote.get(originalId);
    if (anchor === undefined) continue; // הביקורת הסמנטית תדווח על הערה בלי עוגן ידוע
    const bodyEndpoint = { kind: 'block' as const, id: anchor.blockId };
    // הפניה קדימה — פעם אחת לכל הערה (ההצבה הראשונה שלה)
    if (p.continuationOf === undefined && !forwardDone.has(originalId)) {
      forwardDone.add(originalId);
      const noteEndpoint = { kind: 'note' as const, id: originalId, physicalPage: p.physicalPage };
      records.push({
        linkId: makeLinkId('note', bodyEndpoint, noteEndpoint),
        kind: 'note',
        source: bodyEndpoint,
        target: noteEndpoint,
      });
    }
    // קישור חזרה — לכל הצבה בפני עצמה: ההמשך רשומה מוצבת של ממש (מזהה
    // משלה מ-splitNoteBodySpec) והקורא בה רוצה לחזור לעוגן הגוף (שלב 55)
    const placedEndpoint = { kind: 'note' as const, id: p.noteId, physicalPage: p.physicalPage };
    records.push({
      linkId: makeLinkId('note-back', placedEndpoint, bodyEndpoint),
      kind: 'note-back',
      source: placedEndpoint,
      target: bodyEndpoint,
    });
  }
  return buildLinkTable(records);
}

// ─────────────────────────── TOC ⇄ כותרת ───────────────────────────

/** נקודת קצה של ערך TOC — כותרת היעד. */
export interface TocLinkEntry {
  /** מזהה העוגן של הכותרת (blockId) — כמו TocEntry.targetId. */
  readonly targetId: string;
}

/**
 * קישורי TOC⇔כותרת מערכי ה-TOC המיוצבים: לכל ערך — קדימה משורת ה-TOC
 * אל הכותרת (עם העמוד הפיזי מה-AnchorTable) וחזרה מהכותרת אל ה-TOC.
 * ערך שאין לו עוגן נדלג כאן ומדווח על ידי הביקורת הסמנטית (tocEntriesOf
 * של שלב 70 כבר דיווח עליו ב-issues).
 */
export function tocLinksOf(entries: readonly TocLinkEntry[], anchors: AnchorTable): LinkTable {
  const records: LinkRecord[] = [];
  for (const e of entries) {
    const rec = anchors.byId.get(e.targetId);
    if (rec === undefined) continue;
    const headingEndpoint = {
      kind: 'heading' as const,
      id: e.targetId,
      pageKind: rec.pageKind,
      physicalPage: rec.physicalPage,
    };
    const tocEndpoint = { kind: 'anchor' as const, id: `toc:${e.targetId}` };
    records.push({
      linkId: makeLinkId('toc', tocEndpoint, headingEndpoint),
      kind: 'toc',
      source: tocEndpoint,
      target: headingEndpoint,
    });
    records.push({
      linkId: makeLinkId('toc-back', headingEndpoint, tocEndpoint),
      kind: 'toc-back',
      source: headingEndpoint,
      target: tocEndpoint,
    });
  }
  return buildLinkTable(records);
}

/** מיזוג טבלאות (endnotes + TOC + הפניות פנימיות) — כפילויות מדווחות. */
export function mergeLinkTables(tables: readonly LinkTable[]): LinkTable {
  const records: LinkRecord[] = [];
  for (const t of tables) records.push(...t.records);
  return buildLinkTable(records);
}
