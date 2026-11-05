/**
 * linked-navigation.ts — הליבה הטהורה של העורך המקושר מקור ↔ פריסה (שלב 81; אפיון §13.2, §13.3, §14.2).
 *
 * "קליק על קו מדגיש את ה־SourceSpan בעורך; קליק בעורך מוצא את כל
 *  ה־fragments דרך provenance." (§13.2)
 *
 * יסודות:
 *   1. מרחב הקואורדינטות אחד: כל ה־SourceSpans — גם של זרמי ההערות
 *      (footnote/endnote/sidenote) — נושאים היסטים UTF-16 **במקור הגולמי**
 *      (content-model, שלב 14; נבדק מול הפרסר). לכן חפיפת היסטים היא
 *      המיפוי, והיא תקפה לכל הזרמים גם יחד.
 *   2. AtomId מקודד את הפרוסה שממנה נגזר (‎atom:v1|doc|stream|start+end|origin|ordinal‎,
 *      atoms.ts של content-model) — הפענוח כאן הפוך ודטרמיניסטי, בלי
 *      ה-content-model. זו ההוכחה שהמיפוי נכון **גם לאחר shaping
 *      ו־reorder**: הזהות הלוגית חיה במזהה, לא בסדר הוויזואלי של הריצות.
 *   3. טהור לחלוטין: אין DOM, אין stores, אין זמן. אותו IR + אותו טווח
 *      ⇐ אותה תוצאה. המצב (focus) חי ב־viewStore — ה־UI בלבד (§13.1).
 *   4. טריות: המיפוי תקף רק כשה־IR חתום למהדורת המקור הנוכחית
 *      (resultStore.sourceRevision === editorStore.revision); שער הקבלה
 *      במנצח מבטיח זאת בכניסה, והצרכן מגונן בניווט (הגנה בעומק).
 *
 * פטורים מתועדים: rule ו־ornament אינם נושאים מקור (אינם טקסט) —
 * אינם ניווטים ואינם מדווחים כבעיית provenance.
 */
import type { LayoutDocument } from '@tora/layout-api';

/** טווח במקור הגולמי — חצי־פתוח ‎[startUtf16, endUtf16)‎, כמו SourceSpan. */
export interface SourceRange {
  readonly startUtf16: number;
  readonly endUtf16: number;
}

/** סוגי פריטים ניווטים — כל סוגי ה-PlacedItem שנושאים מקור. */
export type LinkedItemKind = 'line' | 'note-marker' | 'anchor';

/** פריט מקושר אחד: איפה הוא בפריסה ומאין הגיע במקור. */
export interface LinkedItemRef {
  readonly kind: LinkedItemKind;
  readonly itemId: string;
  readonly pageId: string;
  readonly sourceRange: SourceRange;
}

// ─────────────────────────── פענוח AtomId ← פרוסת מקור ───────────────────────────

/** תבנית המזהה הקנונית: ‎atom:v1|doc|stream|start+end|origin|ordinal‎ (atoms.ts). */
const SEGMENT_RE = /^atom:v1\|([^|]*)\|([^|]*)\|(\d+)\+(\d+)\|([^|]*)\|(\d+)$/;

/** פענוח ‎%XX‎ הפוך לקידוד של atoms.ts (‎%25‎ ⇐ ‎%‎, ‎%7C‎ ⇐ ‎|‎). */
function decodeIdSegment(value: string): string {
  return value.replace(/%(25|7C)/g, (_all, hex: string) => (hex === '25' ? '%' : '|'));
}

/**
 * AtomId ← טווח המקור שהוא מקודד (stream + start + end). ההיסטים בלבד —
 * הזרם אינו נחוץ לחפיפה (מרחב אחד; יסוד 1). מזהה שאינו בתבנית ⇐ null
 * (לא זריקה: ערך זר הוא נתון, לא באג בניווט).
 */
export function atomSourceRangeOf(atomId: string): SourceRange | null {
  if (typeof atomId !== 'string') return null;
  const m = SEGMENT_RE.exec(atomId);
  if (m === null) return null;
  const start = Number(m[3]);
  const end = Number(m[4]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) return null;
  // documentId/origin מפוענחים לצורך תקינות בלבד — היסטים הם התוצר
  decodeIdSegment(m[1]);
  decodeIdSegment(m[5]);
  return { startUtf16: start, endUtf16: end };
}

// ─────────────────────────── טווחים וחפיפה ───────────────────────────

/** טווח מכסה של פרוסות (מינימום/מקסימום); ריק ⇐ null. */
export function sourceRangeOfSpans(
  spans: readonly { readonly startUtf16: number; readonly endUtf16: number }[],
): SourceRange | null {
  if (!Array.isArray(spans) || spans.length === 0) return null;
  let start = Number.MAX_SAFE_INTEGER;
  let end = -1;
  for (const s of spans) {
    if (typeof s?.startUtf16 !== 'number' || typeof s?.endUtf16 !== 'number') continue;
    if (s.startUtf16 < start) start = s.startUtf16;
    if (s.endUtf16 > end) end = s.endUtf16;
  }
  return end < 0 ? null : { startUtf16: start, endUtf16: end };
}

/**
 * חפיפת טווח חצי־פתוח בפרוסה חצי־פתוחה:
 *   - טווח לא-מרוכז (start < end): חפיפה ⇐ ‎s.start < range.end && range.start < s.end‎.
 *   טווחים סמוכים ‎[0,5)‎ ו־‎[5,10)‎ אינם חופפים (גבול משותף אינו כלול).
 *   - סמן מרוכז (start === end — קליק/קרסור בעורך): נוגע ⇐ הסמן בתוך
 *   הפרוסה ‎s.start <= c < s.end‎ או פרוסה ריקה בדיוק בסמן.
 */
export function rangeOverlapsSpan(
  range: SourceRange,
  span: { readonly startUtf16: number; readonly endUtf16: number },
): boolean {
  if (range.startUtf16 === range.endUtf16) {
    const c = range.startUtf16;
    if (span.startUtf16 === span.endUtf16) return span.startUtf16 === c;
    return span.startUtf16 <= c && c < span.endUtf16;
  }
  return span.startUtf16 < range.endUtf16 && range.startUtf16 < span.endUtf16;
}

// ─────────────────────────── הליכה על ה־IR ───────────────────────────

/** צמצום פריט לנושא-מקור + הטווח שלו; null ⇐ אינו נושא מקור (או פטור). */
function carrierOf(
  item: unknown,
): { kind: LinkedItemKind; id: string; range: SourceRange } | null {
  if (item === null || typeof item !== 'object') return null;
  const it = item as Record<string, unknown>;
  if (typeof it.id !== 'string' || it.id.length === 0) return null;
  if (it.kind === 'line') {
    const range = sourceRangeOfSpans(
      Array.isArray(it.sourceSpans) ? (it.sourceSpans as { startUtf16: number; endUtf16: number }[]) : [],
    );
    return range === null ? null : { kind: 'line', id: it.id, range };
  }
  if (it.kind === 'note-marker' || it.kind === 'anchor') {
    const src = it.source as { startUtf16?: unknown; endUtf16?: unknown } | undefined;
    if (src === null || typeof src !== 'object') return null;
    if (typeof src.startUtf16 !== 'number' || typeof src.endUtf16 !== 'number') return null;
    return { kind: it.kind, id: it.id, range: { startUtf16: src.startUtf16, endUtf16: src.endUtf16 } };
  }
  return null; // rule / ornament / לא מוכר — פטור מתועד
}

/**
 * כל הפריטים נושאי-המקור שחופפים לטווח — בסדר ה־IR (עמודים ואז פריטים,
 * דטרמיניסטי). זו התשובה ל"קליק בעורך מוצא את כל ה־fragments דרך
 * provenance" — כולל קווי ההערות בזרמי הצד וסמני ההערות בגוף.
 */
export function linkedItemsForRange(ir: LayoutDocument, range: SourceRange): readonly LinkedItemRef[] {
  const out: LinkedItemRef[] = [];
  for (const page of ir.pages as readonly unknown[]) {
    if (page === null || typeof page !== 'object') continue;
    const p = page as Record<string, unknown>;
    if (typeof p.id !== 'string') continue;
    const items = Array.isArray(p.items) ? (p.items as readonly unknown[]) : [];
    for (const item of items) {
      const c = carrierOf(item);
      if (c === null) continue;
      if (rangeOverlapsSpan(range, c.range)) {
        out.push({ kind: c.kind, itemId: c.id, pageId: p.id, sourceRange: c.range });
      }
    }
  }
  return Object.freeze(out);
}

/** פריט לפי מזהה (בעמוד או בכל המסמך) ← טווח המקור שלו; לא נמצא ⇐ null. */
export function itemSourceRange(ir: LayoutDocument, pageId: string | undefined, itemId: string): SourceRange | null {
  for (const page of ir.pages as readonly unknown[]) {
    if (page === null || typeof page !== 'object') continue;
    const p = page as Record<string, unknown>;
    if (typeof p.id !== 'string') continue;
    if (pageId !== undefined && p.id !== pageId) continue;
    const items = Array.isArray(p.items) ? (p.items as readonly unknown[]) : [];
    for (const item of items) {
      const c = carrierOf(item);
      if (c !== null && c.id === itemId) return c.range;
    }
  }
  return null;
}

/**
 * ה-AtomId הראשון של קו (הריצה הראשונה, האטום הראשון) — לנשיאה במוקד
 * לצורך דיוק עתידי ברמת האטום. פריט ללא אטומים ⇐ null.
 */
export function firstAtomIdOfItem(ir: LayoutDocument, itemId: string): string | null {
  for (const page of ir.pages as readonly unknown[]) {
    if (page === null || typeof page !== 'object') continue;
    const p = page as Record<string, unknown>;
    const items = Array.isArray(p.items) ? (p.items as readonly unknown[]) : [];
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      if (it.kind !== 'line' || it.id !== itemId) continue;
      const runs = Array.isArray(it.runs) ? (it.runs as readonly Record<string, unknown>[]) : [];
      for (const run of runs) {
        const atoms = Array.isArray(run.atomIds) ? (run.atomIds as unknown[]) : [];
        if (atoms.length > 0 && typeof atoms[0] === 'string') return atoms[0];
      }
      return null;
    }
  }
  return null;
}

/**
 * שלמות ה-provenance: כל קו / סמן הערה / עוגן חייב לשאת מקור — אחרת
 * העורך המקושר אינו מלא. רשימת בעיות (ריק = תקין); rule/ornament פטורים
 * (אינם טקסט). מנוע תקין ⇐ רשימה ריקה תמיד — נעול בבדיקות על IR אמיתי.
 */
export function provenanceIssues(ir: LayoutDocument): readonly string[] {
  const issues: string[] = [];
  for (const page of ir.pages as readonly unknown[]) {
    if (page === null || typeof page !== 'object') continue;
    const p = page as Record<string, unknown>;
    const pageId = typeof p.id === 'string' ? p.id : '?';
    const items = Array.isArray(p.items) ? (p.items as readonly unknown[]) : [];
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      if (it.kind === 'rule' || it.kind === 'ornament') continue; // פטור מתועד
      const c = carrierOf(item);
      if (c === null) issues.push(`${pageId}/${String(it.id ?? '?')}:${String(it.kind)}`);
    }
  }
  return Object.freeze(issues);
}

/** כל סוגי הפריטים הניווטים — סגור וקפוא; rule/ornament פטורים (אינם טקסט). */
export const LINKED_ITEM_KINDS: readonly LinkedItemKind[] = Object.freeze(['line', 'note-marker', 'anchor']);
