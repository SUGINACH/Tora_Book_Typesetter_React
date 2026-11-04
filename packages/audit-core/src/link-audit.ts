/**
 * link-audit.ts — הביקורת הסמנטית על כל target של מערכת הקישורים (שלב 72;
 * אפיון §14.2 "בדיקות semantic"; M8).
 *
 * "semantic audit על כל target; אין ids תלויי סדר ריצה אקראי" (תכנית 72):
 * כל קישור נבדק מול שלושה מלאים — ה-AnchorTable (עוגני כותרות/הערות),
 * מלאי ההערות (noteIds) ומלאי הכותרות (headingIds). קישור שבור הוא ממצא
 * HIGH — לא שקט, לא ניחוש; הכיווניות ההדדית נבדקת (הערה בלי חזרה, TOC
 * בלי כיוון); המזהים נבדקים כנגזרת התוכן (אכיפת דטרמיניזם — מזהה זר
 * הוא ממצא LINK_ID_FOREIGN, כולל מזהה שנגזר מסדר ריצה).
 *
 * ממצאי HIGH פוסלים את הדוח (ok=false) — שער השלב: "כל הקישורים תקינים
 * ב-IR ובהיטלים"; דוח עם ok=true הוא ההוכחה שאפס קישור שבור.
 */
import type { AnchorTable, LinkTable } from '@tora/layout-api';
import { makeLinkId } from '@tora/layout-api';
import type { AuditSeverity, TextAuditFinding } from './text-audit.js';
import { AuditCoreError } from './text-audit.js';
import type { SourceSpan } from '@tora/content-model';

/** כל קודי הממצא שהביקורת מפיקה — סגור ורשום (אין קוד צד; §14.1). */
export const LINK_AUDIT_FINDING_CODES: readonly string[] = Object.freeze([
  /** קישור שבור — היעד אינו קיים בשום מלאי (§14.2 semantic). */
  'audit.links.LINK_TARGET_MISSING',
  /** מזהה קישור שאינו הנגזרת הקנונית — תלות בסדר ריצה/מזהה זר. */
  'audit.links.LINK_ID_FOREIGN',
  /** כפילות — שני קישורים עם אותו מזהה. */
  'audit.links.LINK_DUPLICATE',
  /** הערה עם הפניה קדימה אך בלי קישור חזרה (או להפך) — הכיווניות ההדדית. */
  'audit.links.LINK_NOTE_ONE_WAY',
  /** ערך TOC שאין לו קישור כיוון חזרה. */
  'audit.links.LINK_TOC_ONE_WAY',
  /** קישור חיצוני שאינו לפי מדיניות הסכמות. */
  'audit.links.LINK_EXTERNAL_POLICY',
  /** יעד עם עמוד פיזי שאינו עולה בקנה אחד עם ה-AnchorTable. */
  'audit.links.LINK_PAGE_MISMATCH',
]);

export interface LinkAuditReport {
  /** אמת ⟺ אפס ממצאי HIGH. */
  readonly ok: boolean;
  readonly findingCount: number;
  readonly counts: Readonly<Record<AuditSeverity, number>>;
  readonly findings: readonly TextAuditFinding[];
  readonly stats: {
    readonly links: number;
    readonly byKind: Readonly<Record<string, number>>;
  };
}

/** המלאים שהיעדים נבדקים מולם. */
export interface LinkAuditInventories {
  /** עוגני המסמך (כותרות+הערות) — מנקודת השבת. */
  readonly anchors: AnchorTable;
  /** כל רשומות ההערות שהוצבו — המקורות וההמשכים (רשומות מוצבות ממש; פיצול ADR-005). */
  readonly noteIds: readonly string[];
  /** כל מזהי הכותרות שהוצבו (blockId). */
  readonly headingIds: readonly string[];
  /** מזהי הבלוקים של הגוף — עוגני ההפניות (מקורות קישורי note). */
  readonly bodyBlockIds: readonly string[];
  /** מזהי נקודות קצה מסוג anchor — עוגני inline ושורות TOC (toc:{targetId}). */
  readonly anchorIds: readonly string[];
}

const EMPTY_SPANS: readonly SourceSpan[] = Object.freeze([]);

export function auditLinks(links: LinkTable, inv: LinkAuditInventories): LinkAuditReport {
  if (links === null || typeof links !== 'object' || !Array.isArray(links.records)) {
    throw new AuditCoreError('errors.audit.INVALID_INPUT', { reason: 'links' }, 'נדרשת LinkTable (records)');
  }
  if (inv.anchors === null || typeof inv.anchors !== 'object' || !(inv.anchors.byId instanceof Map)) {
    throw new AuditCoreError('errors.audit.INVALID_INPUT', { reason: 'anchors' }, 'נדרש AnchorTable');
  }
  const findings: TextAuditFinding[] = [];
  const counts: Record<AuditSeverity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const byKind: Record<string, number> = {};
  const finding = (code: string, severity: AuditSeverity, params: Record<string, string | number>): void => {
    if (!(LINK_AUDIT_FINDING_CODES as readonly string[]).includes(code)) {
      throw new AuditCoreError('errors.audit.UNREGISTERED_FINDING_CODE', { code }, `קוד ממצא לא רשום: ${code}`);
    }
    counts[severity] += 1;
    findings.push(Object.freeze({
      code, severity, messageKey: code, params: Object.freeze({ ...params }), sourceSpans: EMPTY_SPANS,
    }));
  };

  const noteIdSet = new Set(inv.noteIds);
  const headingIdSet = new Set(inv.headingIds);
  const bodyBlockIdSet = new Set(inv.bodyBlockIds);
  const anchorIdSet = new Set(inv.anchorIds);

  for (const r of links.records) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    // 1) המזהה — הנגזרת הקנונית מהתוכן (אין ids תלויי סדר ריצה)
    if (r.linkId !== makeLinkId(r.kind, r.source, r.target)) {
      finding('audit.links.LINK_ID_FOREIGN', 'HIGH', { linkId: r.linkId, kind: r.kind });
    }
    // 2) היעד קיים — מול המלאי המתאים לסוג הנקודה
    const targetExists = (kind: string, id: string): boolean => {
      if (kind === 'note') return noteIdSet.has(id);
      if (kind === 'heading') return headingIdSet.has(id);
      if (kind === 'block') return bodyBlockIdSet.has(id);
      if (kind === 'anchor') return anchorIdSet.has(id);
      return true; // url — נבדק במדיניות הסכמות למטה
    };
    if (!targetExists(r.target.kind, r.target.id)) {
      finding('audit.links.LINK_TARGET_MISSING', 'HIGH', { linkId: r.linkId, target: r.target.id, targetKind: r.target.kind });
    }
    if (!targetExists(r.source.kind, r.source.id)) {
      finding('audit.links.LINK_TARGET_MISSING', 'HIGH', { linkId: r.linkId, target: r.source.id, targetKind: r.source.kind });
    }
    // 3) עמוד פיזי עולה עם ה-AnchorTable (כשלשניהם יש עוגן)
    const anchorRec = inv.anchors.byId.get(r.target.id);
    if (anchorRec !== undefined && r.target.physicalPage !== undefined && anchorRec.physicalPage !== r.target.physicalPage) {
      finding('audit.links.LINK_PAGE_MISMATCH', 'MEDIUM', { linkId: r.linkId, target: r.target.id, expected: anchorRec.physicalPage, actual: r.target.physicalPage });
    }
    // 4) קישור חיצוני לפי מדיניות
    if (r.target.kind === 'url') {
      const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(r.target.id)?.[1]?.toLowerCase();
      if (scheme !== 'http' && scheme !== 'https') {
        finding('audit.links.LINK_EXTERNAL_POLICY', 'HIGH', { linkId: r.linkId, scheme: scheme ?? 'none' });
      }
    }
  }

  // 5) כפילויות
  const seen = new Set<string>();
  for (const r of links.records) {
    if (seen.has(r.linkId)) finding('audit.links.LINK_DUPLICATE', 'HIGH', { linkId: r.linkId });
    seen.add(r.linkId);
  }

  // 6) הכיווניות ההדדית: לכל note קדימה יש חזרה, ולהפך
  const forwardNotes = new Set<string>();
  const backNotes = new Set<string>();
  const forwardToc = new Set<string>();
  const backToc = new Set<string>();
  for (const r of links.records) {
    if (r.kind === 'note') forwardNotes.add(r.target.id);
    if (r.kind === 'note-back') backNotes.add(r.source.id);
    if (r.kind === 'toc') forwardToc.add(r.target.id);
    if (r.kind === 'toc-back') backToc.add(r.source.id);
  }
  for (const id of forwardNotes) {
    if (!backNotes.has(id)) finding('audit.links.LINK_NOTE_ONE_WAY', 'HIGH', { noteId: id, direction: 'forward-without-back' });
  }
  for (const id of backNotes) {
    if (!forwardNotes.has(id)) finding('audit.links.LINK_NOTE_ONE_WAY', 'HIGH', { noteId: id, direction: 'back-without-forward' });
  }
  for (const id of forwardToc) {
    if (!backToc.has(id)) finding('audit.links.LINK_TOC_ONE_WAY', 'HIGH', { headingId: id, direction: 'forward-without-back' });
  }
  for (const id of backToc) {
    if (!forwardToc.has(id)) finding('audit.links.LINK_TOC_ONE_WAY', 'HIGH', { headingId: id, direction: 'back-without-forward' });
  }

  return Object.freeze({
    ok: counts.HIGH === 0,
    findingCount: findings.length,
    counts: Object.freeze(counts),
    findings: Object.freeze(findings),
    stats: Object.freeze({ links: links.records.length, byKind: Object.freeze(byKind) }),
  });
}
