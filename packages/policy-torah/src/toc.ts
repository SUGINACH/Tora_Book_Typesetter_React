/**
 * toc.ts — ערכי תוכן העניינים מהעוגנים בלבד (שלב 70; אפיון §11.1; M8).
 *
 * "אין pageEstimate. מספר המודפס נגזר מ-AnchorTable בלבד" (§11.1): כל ערך
 * TOC נבנה מהמסמך (חלקים ל-TOC הכללי, סימנים למפורט) ומקבל את עמודו
 * מהעוגן האמיתי של הכותרת. כותרת שאין לה עוגן (לא הוצבה במסלול) אינה
 * מקבלת מספר מנוחש — היא מדווחת בבעיות ומושמטת מהערכים במפורש.
 *
 * פוליו (§11.1): המודל הפיזי/לוגי של שלב 67 — logical = initial + פיזי − 1;
 * עמודי שער אינם ממוספרים (printed=null) אך יש להם מספר לוגי, והוא זה
 * שערך ה-TOC מציג כשאין מספר מודפס (השער נספר במודל, רק אינו מדפיס).
 *
 * הגדרות legacy: enable-general-toc / enable-detailed-toc (שני התוכנים);
 * general-toc-count-numbering / detailed-toc-count-numbering (מספור הערכים);
 * הכללי = חלקים (H1), המפורט = סימנים (H2).
 */
import {
  type AnchorTable,
  type TorahDocument,
} from '@tora/layout-api';
import { folioLabelOf, type FolioLabel, type FolioPolicy } from './folio.js';
import { gematriaOf } from './folio.js';

/** מדיניות תוכן העניינים מההגדרות. */
export interface TocPolicy {
  /** TOC כללי (חלקים) — enable-general-toc. */
  readonly general: boolean;
  /** TOC מפורט (סימנים) — enable-detailed-toc. */
  readonly detailed: boolean;
  /** מספור ערכי ה-TOC הכללי — general-toc-count-numbering. */
  readonly generalNumbering: boolean;
  /** מספור ערכי ה-TOC המפורט — detailed-toc-count-numbering. */
  readonly detailedNumbering: boolean;
}

export function tocPolicyOf(settings: { readonly values: Readonly<Record<string, unknown>> }): TocPolicy {
  const v = settings.values;
  const bool = (key: string, fallback: boolean): boolean => {
    const raw = v[key];
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') return raw === 'true';
    return fallback;
  };
  return Object.freeze({
    general: bool('enable-general-toc', true),
    detailed: bool('enable-detailed-toc', true),
    generalNumbering: bool('general-toc-count-numbering', true),
    detailedNumbering: bool('detailed-toc-count-numbering', true),
  });
}

/** ערך TOC אחד — כותרת + פוליו מהעוגן בלבד. */
export interface TocEntry {
  /** מזהה העוגן (blockId של הכותרת) — המפתח ב-AnchorTable ובזרימת ה-TOC. */
  readonly targetId: string;
  /** רמת הערך: 1 = חלק (הכללי), 2 = סימן (המפורט). */
  readonly level: 1 | 2;
  /** כותרת הערך (עם מספור לפי המדיניות). */
  readonly title: string;
  /** הפוליו של עמוד העוגן — printed=null בעמודי שער; ה-TOC מציג את הלוגי. */
  readonly folio: FolioLabel;
}

export interface TocEntriesResult {
  readonly entries: readonly TocEntry[];
  /** בעיות: כותרות שאין להן עוגן (אין מספר מנוחש — הערך מושמט במפורש). */
  readonly issues: readonly string[];
}

/** טקסט הכותרת מהבלוק — רצף פריטי הטקסט שלה. */
function headingTextOf(block: { readonly inline?: readonly { readonly kind: string; readonly text?: unknown }[] }): string {
  const parts: string[] = [];
  for (const item of block.inline ?? []) {
    if (item.kind === 'text' && typeof item.text === 'string') parts.push(item.text);
  }
  return parts.join('').trim();
}

/**
 * בניית ערכי ה-TOC מהמסמך ומהעוגנים: הכללי — חלקים (H1, לפי סדר); המפורט —
 * סימנים (H2, לפי סדר). מספור הערכים לפי המדיניות (סימן {גימטריה}); הפוליו
 * מהעוגן בלבד (folioLabelOf — מודל פיזי/לוגי). כותרת ללא עוגן ⇒ בעיה
 * מדווחת + השמטה מפורשת — לעולם לא מספר מנוחש.
 */
export function tocEntriesOf(
  doc: TorahDocument,
  policy: TocPolicy,
  anchors: AnchorTable,
  folio: FolioPolicy,
): TocEntriesResult {
  const entries: TocEntry[] = [];
  const issues: string[] = [];
  const folioOf = (targetId: string): FolioLabel | null => {
    const rec = anchors.byId.get(targetId);
    if (rec === undefined) return null;
    return folioLabelOf(rec.physicalPage, rec.pageKind, folio);
  };
  if (policy.general) {
    let partOrdinal = 0;
    for (const part of doc.parts) {
      partOrdinal += 1;
      const heading = findHeadingBlock(part, 1);
      if (heading === null) {
        issues.push(`general:לחלק ${part.id} אין בלוק כותרת H1 — הושמט מהערכים`);
        continue;
      }
      const f = folioOf(heading.id);
      if (f === null) {
        issues.push(`general:${heading.id} אין עוגן — הושמט (אין מספר מנוחש)`);
        continue;
      }
      const title = part.title !== undefined && part.title.length > 0 ? part.title : headingTextOf(heading);
      entries.push({
        targetId: heading.id,
        level: 1,
        title: policy.generalNumbering ? `${gematriaOf(partOrdinal)} — ${title}` : title,
        folio: f,
      });
    }
  }
  if (policy.detailed) {
    for (const part of doc.parts) {
      for (const siman of part.simanim) {
        const heading = siman.blocks.find((b) => b.role === 'heading' && b.headingLevel === 2);
        if (heading === undefined) {
          issues.push(`detailed:לסימן ${siman.id} אין בלוק כותרת H2 — הושמט מהערכים`);
          continue;
        }
        const f = folioOf(heading.id);
        if (f === null) {
          issues.push(`detailed:${heading.id} אין עוגן — הושמט (אין מספר מנוחש)`);
          continue;
        }
        const text = headingTextOf(heading);
        entries.push({
          targetId: heading.id,
          level: 2,
          title: policy.detailedNumbering ? `סימן ${gematriaOf(siman.simanNumber)} — ${text}` : text,
          folio: f,
        });
      }
    }
  }
  return Object.freeze({ entries: Object.freeze(entries), issues: Object.freeze(issues) });
}

/** בלוק הכותרת הראשון ברמה הנתונה בחלק (מחפש בסימניו, בסדר). */
function findHeadingBlock(
  part: { readonly simanim: readonly { readonly blocks: readonly { readonly id: string; readonly role: string; readonly headingLevel?: number; readonly inline?: readonly { readonly kind: string; readonly text?: unknown }[] }[] }[] },
  level: number,
): { readonly id: string; readonly inline?: readonly { readonly kind: string; readonly text?: unknown }[] } | null {
  for (const siman of part.simanim) {
    for (const b of siman.blocks) {
      if (b.role === 'heading' && b.headingLevel === level) return b;
    }
  }
  return null;
}
