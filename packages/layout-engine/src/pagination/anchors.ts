/**
 * anchors.ts — בניית AnchorTable מתוצאת העימוד בפועל (שלב 70; אפיון §11.1; M8).
 *
 * כותרות — מהמסלול (headingAnchorsOf של שלב 60: העמוד שבו ההרחבה הציבה
 * את הכותרת); הערות — ממיפוי הזרימה (endnotes מדווח anchorReport:
 * noteId ⇒ עמוד פיזי). אין pageEstimate — עמוד אמיתי בלבד, מהתוצאה.
 * הצרכן הראשי: תוכן העניינים (שלב 70) ונקודת השבת החוץ (שלב 71) —
 * דרך anchorMappingHash של layout-api.
 */
import { buildAnchorTable, type AnchorRecord } from '@tora/layout-api';
import { headingAnchorsOf, type PaginatedBlock } from './candidates.js';
import type { PageExpansion } from './search.js';
import type { PaginationState } from './state.js';

/**
 * בניית טבלת העוגנים ממסלול שעבר: כל הכותרות שהוצבו (לפי רמה) + מיפוי
 * הערות אופציונלי (noteId ⇒ עמוד פיזי 1-based, מ-anchorReport של הזרימה).
 * טהורה ודטרמיניסטית; כפילויות/ערכים שליליים נאספים ל-issues (לא זריקה).
 */
export function anchorTableOfPath(
  initial: PaginationState,
  path: readonly PageExpansion[],
  blocks: readonly PaginatedBlock[],
  noteAnchors?: Readonly<Record<string, number>>,
): ReturnType<typeof buildAnchorTable> {
  const records: AnchorRecord[] = [];
  for (const h of headingAnchorsOf(initial, path, blocks)) {
    records.push({
      targetId: h.blockId,
      kind: 'heading',
      pageKind: h.pageKind,
      physicalPage: h.physicalPageIndex,
    });
  }
  if (noteAnchors !== undefined) {
    for (const [noteId, page] of Object.entries(noteAnchors)) {
      records.push({
        targetId: noteId,
        kind: 'note',
        pageKind: 'notes',
        physicalPage: page,
      });
    }
  }
  return buildAnchorTable(records);
}
