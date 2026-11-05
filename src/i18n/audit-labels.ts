/**
 * audit-labels.ts — קטלוג תוויות עברי לממצאי ה-Audit (שלב 82; אפיון §13–14, §16).
 *
 * אותו דפוס שנקבע בשלב 78 (settings-labels) ושלב 80 (import-labels):
 * קטלוג סטטי, קפוא ודטרמיניסטי; המקור העברי בלבד — תרגום שתי שפות
 * מלא הוא שלב 93. אין הצגת message גולמי (§16) — מוצג קוד קטלוגי
 * מתורגם + פרמטרים סדירים + מיקום (מקור/עמוד).
 *
 * הכיסוי סגור ונאכף (verify-audit-findings): שלושת הרשימות הקפואות
 * ב־audit-core — TEXT_AUDIT_FINDING_CODES, LAYOUT_AUDIT_FINDING_CODES,
 * LINK_AUDIT_FINDING_CODES (31 קודים) — חייבות להיות מכוסות כאן בדיוק,
 * ואין תווית יתומה. הסבר לכל fallback ולכל MEDIUM/HIGH (שלב 82): לכל
 * קוד תווית מסבירה עם הפרמטרים הרלוונטיים, וגם actual/expected מוצגים
 * כשהממצא נושא אותם.
 */

/** תווית אחת — נוסח מסביר לתצוגה בפאנל. */
export interface AuditLabel {
  readonly label: string;
}

/** קטלוג התוויות — קפוא; מפתח = קוד קטלוגי (messageKey = code בחוזה §14.1). */
export const AUDIT_LABELS: Readonly<Record<string, AuditLabel>> = Object.freeze({
  // ── ביקורת טקסט (audit-core/text-audit) ──
  'audit.text.MISSING_ATOM': { label: 'טווח במקור שאינו מכוסה על ידי אטום — {excerpt} ({length} תווים)' },
  'audit.text.DUPLICATE_ATOM': { label: 'טווח במקור מכוסה {times} פעמים — {length} תווים' },
  'audit.text.OVERLAP_ATOM_SYNTAX': { label: 'טווחי syntax חופפים במקור' },
  'audit.text.DUPLICATE_ATOM_ID': { label: 'מזהה אטום כפול — {atomId}' },
  'audit.text.UNRESOLVED_NOTE_REFERENCE': { label: 'הפניית הערה שלא נפתרה — {noteId}' },
  'audit.text.ORPHAN_NOTE': { label: 'הערת {kind} יתומה — אין הפניה בגוף ({noteId})' },
  'audit.text.LEDGER_ISSUE': { label: 'בעיית פנקס החלטות — {code} (רשומה {recordIndex})' },
  'audit.text.RAW_CONTROL_PLACEHOLDER': { label: 'תו בקרה גולמי בפריסה — {atomId}' },
  'audit.text.HTML_IN_ATOMS': { label: 'HTML מילולי בטקסט — {excerpt}' },
  'audit.text.COVERAGE_DISAGREEMENT': { label: 'חוסר הסכמה בכיסוי בין הביקורת לפרסר' },
  'audit.text.ATOM_TEXT_MISMATCH': { label: 'טקסט האטום בפריסה אינו זהה למקור — {reason} ({atomId})' },
  // ── ביקורת גאומטרית (audit-core/layout-audit) ──
  'audit.layout.ATOM_MISSING': { label: 'אטום מהמסמך לא הוצב בפריסה — {atomId}' },
  'audit.layout.ATOM_DUPLICATED': { label: 'אטום הוצב יותר מפעם אחת — {atomId}' },
  'audit.layout.NOTE_MARKER_WITHOUT_BODY': { label: 'סמן הערה בגוף ללא תוכן באזור ההערות — {noteId}' },
  'audit.layout.NOTE_BODY_WITHOUT_MARKER': { label: 'תוכן הערה באזור ההערות ללא סמן בגוף — {noteId}' },
  'audit.layout.REGION_OUT_OF_PAGE': { label: 'אזור חורג מגבולות העמוד — {regionId}' },
  'audit.layout.REGION_REF_UNKNOWN': { label: 'הפניה לאזור שאינו קיים — {regionId}' },
  'audit.layout.ITEM_OUT_OF_REGION': { label: 'פריט חורג מגבולות האזור שלו — {itemId}' },
  'audit.layout.BASELINE_OUT_OF_LINE': { label: 'קו בסיס מחוץ לגבולות השורה — {itemId}' },
  'audit.layout.LINE_RUN_OVERFLOW': { label: 'רצף טקסט חורג מרוחב השורה' },
  'audit.layout.LINE_OVERLAP': { label: 'שתי שורות חופפות — {itemIdA} ו־{itemIdB}' },
  'audit.layout.LINE_HEIGHT_NONUNIFORM': { label: 'מרווח שורות אינו אחיד בתוך הטור' },
  'audit.layout.COLUMN_ORDER_RTL': { label: 'סדר טורים הפוך בעמוד RTL' },
  'audit.layout.ORNAMENT_OVERLAP': { label: 'עיטור חופף תוכן — {lineId} מול {overlapsRegion}' },
  // ── ביקורת קישורים (audit-core/link-audit) ──
  'audit.links.LINK_ID_FOREIGN': { label: 'מזהה קישור שאינו הנגזרת הקנונית שלו — {linkId}' },
  'audit.links.LINK_TARGET_MISSING': { label: 'יעד קישור אינו קיים — {target} ({targetKind})' },
  'audit.links.LINK_DUPLICATE': { label: 'קישור כפול — {linkId}' },
  'audit.links.LINK_NOTE_ONE_WAY': { label: 'קישור הערה חד־צדדי — חסר {direction} ({noteId})' },
  'audit.links.LINK_TOC_ONE_WAY': { label: 'קישור תוכן עניינים חד־צדדי — חסר {direction} ({headingId})' },
  'audit.links.LINK_PAGE_MISMATCH': { label: 'קישור מצביע לעמוד לא תואם' },
  'audit.links.LINK_EXTERNAL_POLICY': { label: 'קישור לכתובת חיצונית ({scheme}) בניגוד למדיניות — {linkId}' },
});

/** תוויות חומרה — סדר התצוגה נגזר ממקש זה (HIGH ראשון). */
export const AUDIT_SEVERITY_LABELS: Readonly<Record<'HIGH' | 'MEDIUM' | 'LOW', string>> = Object.freeze({
  HIGH: 'חמור',
  MEDIUM: 'בינוני',
  LOW: 'קל',
});

/** תוויות הפאנל — כותרות, סינון, מיקום וטריות. */
export const AUDIT_PANEL_LABELS = Object.freeze({
  title: 'ממצאי ביקורת',
  stale: '⚠ הממצאים אינם עדכניים — המקור נערך מאז הריצה; הריצו מחדש לניווט מדויק',
  severityFilterAll: 'הכול',
  codeFilterPlaceholder: 'סינון לפי קוד (למשל audit.layout)',
  emptyFiltered: 'אין ממצאים העונים לסינון',
  sourceLocation: 'מקור — שורה {line}',
  pageLocation: 'עמוד {pageId}',
  actual: 'התקבל: {actual}',
  expected: 'הצפוי: {expected}',
  countsTotal: '{n} ממצאים',
  countsBySeverity: 'חמור {high} · בינוני {medium} · קל {low}',
});

/**
 * החלפת ‎{param}‎ בערכים — פרמטר חסר נשאר מילולי, לא נזרק (תצוגה בלבד).
 * קוד שאינו בקטלוג מוצג כהוא (הכיסוי הסגור נאכף במאמת — זו הגנת עומק בלבד).
 */
export function formatAuditLabel(code: string, params: Readonly<Record<string, string | number>>): string {
  const entry = AUDIT_LABELS[code];
  if (entry === undefined) return code;
  return entry.label.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}
