/**
 * anchors.ts — AnchorTable: עוגני המסמך ⇐ עמודים פיזיים בפועל (שלב 70; אפיון §11.1; M8).
 *
 * "אין pageEstimate" — מספר העמוד של כל עוגן נקרא מהתוצאה בפועל: הטבלה נבנית
 * ממסלול העימוד שעבר (כותרות — העמוד שבו הוצבו) וממיפוי ההערות (זרם
 * ה-endnotes/ההערות מדווח על עמודו הפיזי של כל הערה). הצרכנים: תוכן העניינים
 * (שלב 70 — ערכי העמוד של הכותרות), קישורים הדדיים (שלב 72) ונקודת השבת
 * החוץ (שלב 71 — השוואת המיפוי בין איטרציות דרך anchorMappingHash).
 *
 * הטבלה חיה ב-layout-api — החוזה המשותף של המנוע (המייצר אותה מהמסלול)
 * והמדיניות (שבונה ממנה את ערכי ה-TOC) — גרף §5: שניהם תלויים ב-layout-api.
 */
import { canonicalJson } from './canonical-hash.js';
import { sha256Hex } from './hash.js';
import type { PageKind } from './ir.js';

/** סוג העוגן — כותרת (TOC) או הערה (קישורים הדדיים; §10.3). */
export type AnchorKind = 'heading' | 'note';

/** רשומת עוגן אחת — מזהה העוגן ⇐ עמוד פיזי אמיתי (1-based). */
export interface AnchorRecord {
  /** המזהה הקנוני — blockId של הכותרת או noteId של ההערה. */
  readonly targetId: string;
  readonly kind: AnchorKind;
  /** סוג העמוד שבו העוגן הוצב (לפוליו — עמודי שער אינם ממוספרים; §11.1). */
  readonly pageKind: PageKind;
  /** העמוד הפיזי האמיתי (1-based; מהמסלול בפועל — לא הערכה). */
  readonly physicalPage: number;
}

/** AnchorTable — מיפוי קפוא של כל עוגני המסמך. */
export interface AnchorTable {
  readonly records: readonly AnchorRecord[];
  /** מיפוי targetId ⇒ רשומה (המזהים ייחודיים — כפילות היא בעיה מדווחת). */
  readonly byId: ReadonlyMap<string, AnchorRecord>;
  /** בעיות שנמצאו בבנייה (ריק = תקין): כפילויות, עמודים שליליים. */
  readonly issues: readonly string[];
}

/** בעיות של טבלת עוגנים — ריקה = תקינה. */
export function anchorTableIssues(t: AnchorTable): readonly string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const r of t.records) {
    if (typeof r.targetId !== 'string' || r.targetId.length === 0) issues.push(`targetId:${String(r.targetId)}`);
    if (r.kind !== 'heading' && r.kind !== 'note') issues.push(`kind:${String(r.kind)}`);
    if (!Number.isSafeInteger(r.physicalPage) || r.physicalPage < 1) issues.push(`physicalPage:${r.targetId}=${String(r.physicalPage)}`);
    if (seen.has(r.targetId)) issues.push(`duplicate:${r.targetId}`);
    seen.add(r.targetId);
  }
  return issues;
}

/** בניית טבלה מרשומות — מאמתת ייחודיות ותקינות (בעיות ב-issues, לא זריקה). */
export function buildAnchorTable(records: readonly AnchorRecord[]): AnchorTable {
  const list = Object.freeze([...records]);
  const byId = new Map<string, AnchorRecord>();
  for (const r of list) byId.set(r.targetId, r);
  const table: AnchorTable = Object.freeze({ records: list, byId, issues: [] });
  const issues = anchorTableIssues(table);
  return Object.freeze({ records: list, byId, issues: Object.freeze([...issues]) });
}

/**
 * חתימה קנונית של המיפוי (targetId, kind, pageKind, physicalPage) — אות
 * המשוב של נקודת השבת החוץ (§11.1; שלב 71): שינוי בעמוד של עוגן יחיד,
 * בסוגו או בסדרו משנה את החתימה. דטרמיניסטית לחלוטין.
 */
export function anchorMappingHash(t: AnchorTable): string {
  return sha256Hex(canonicalJson({
    v: 1,
    kind: 'anchor-mapping',
    anchors: t.records.map((r) => ({ id: r.targetId, kind: r.kind, pageKind: r.pageKind, page: r.physicalPage })),
  } as unknown as Record<string, unknown>));
}
