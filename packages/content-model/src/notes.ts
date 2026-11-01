/**
 * notes.ts — זרמי הערות ומספורן טרם העימוד (שלב 20).
 *
 * אסמכתא: אפיון §10.3 ("numbering/reset (page, siman, part, continuous)
 * נקבע לפני הרינדור ונשמר כ־resolved label"; "כל H7 מקושר ל־SourceSpan
 * ולעוגן שורה, לא ל־doc.sidenotes[pageNumber-1]"; "זרם נפרד עם anchors
 * הדדיים") · §9.1 (pendingFootnotes/pendingSidenotes — המספור נפרד ממצב
 * העימוד) · §14.2 (אין sidenote יתום) · תכנית שלב 20.
 *
 * עקרונות:
 *   1. המספור נקבע כאן — במודל התוכן, לפני העימוד ובוודאי לפני הרינדור.
 *      הרינדור מקבל תוויות מוצלות (resolved labels) בלבד; אין לו לוגיקת
 *      מספור. זה היפוך הישן, שמספר בתוך renderFootnotes לפי אינדקס
 *      העמוד (‎toGematria(i+1)‎) — מספור סמוי ברינדור.
 *   2. סדר המספור = סדר הופעת ההפניה בזרימת המסמך (לא סדר המערך).
 *      לכל סוג הערה יש הפניה מפורשת בגוף: הערות שוליים — הפניה בתוך
 *      הפסקה; הערות סיום — הפניה בשורת ההערה שנשארה בזרימה; H7 — בלוק
 *      סמן עם הפניה. המיקום ההתחלתי של ההפניה הוא העוגן.
 *   3. היקפים (§10.3): ‎page | siman | part | continuous‎ כמדיניות מפורשת.
 *      ‎page‎ תלוי בהחלטות עימוד — הוא נפתר רק עם הקשר עמודים מפורש
 *      (מסופק על ידי המנוע, שלב 49+); בלי הקשר — שגיאה מקוטלגת,
 *      לא ניחוש.
 *   4. אף הערה אינה נבלעת בשקט: יתומות (בלי הפניה) מדווחות ואינן
 *      ממוספרות; הערות עורך אינן מודפסות ממילא (ההסרה נרשמת בספר
 *      הטרנספורמציות משלב 17) ואינן נספרות כיתומות מספור.
 *   5. טהור ודטרמיניסטי: אותו מסמך + אותה מדיניות (+ אותו הקשר עמודים)
 *      ← אותו פתרון, תמיד.
 */

import { ContentModelError } from './errors.js';
import { allBlocks } from './document.js';
import type { NoteKind, TorahDocument } from './document.js';

// ─────────────────────────── סוגי יסוד ───────────────────────────

/** היקף מספור — §10.3. */
export type NoteNumberingScope = 'page' | 'siman' | 'part' | 'continuous';

/** ההיקפים החוקיים — סדר קבוע. */
export const NOTE_NUMBERING_SCOPES: readonly NoteNumberingScope[] = Object.freeze([
  'page', 'siman', 'part', 'continuous',
] as const);

/** פורמט התווית המוצגת. */
export type NoteLabelFormat = 'numeric' | 'gematria';

/** הפורמטים החוקיים. */
export const NOTE_LABEL_FORMATS: readonly NoteLabelFormat[] = Object.freeze([
  'numeric', 'gematria',
] as const);

/** מדיניות מספור — מפורשת, מההגדרות (שלב 30 יזריק). */
export interface NoteNumberingPolicy {
  readonly scope: NoteNumberingScope;
  readonly labelFormat: NoteLabelFormat;
  /** הזרמים הממוספרים — ברירת מחדל: הערות שוליים וסיום. */
  readonly streams: readonly NoteKind[];
}

/**
 * ברירת המחדל — משוחזרת מהישן: המספור היה לפי סדר בעמוד (אינדקס
 * ברשימת הערות של העמוד) בגימטריא; כאן זה היקף ‎page‎ מפורש עם הקשר
 * עמודים, שנפתר לפני הרינדור.
 */
export const DEFAULT_NOTE_NUMBERING_POLICY: NoteNumberingPolicy = Object.freeze({
  scope: 'page',
  labelFormat: 'gematria',
  streams: Object.freeze(['footnote', 'endnote'] as const) as readonly NoteKind[],
} as const);

/** הצבת מספור להערה אחת — resolved label. */
export interface NoteNumberAssignment {
  readonly noteId: string;
  readonly kind: NoteKind;
  /** מספר סידורי בתוך ההיקף (1-based). */
  readonly ordinal: number;
  /** התווית המוצגת — מוצלת; הרינדור מציג ואינו מחשב. */
  readonly label: string;
  /** מפתח ההיקף (‎page:N | siman:P:S | part:P | doc‎) — לביקורת ולאיפוס. */
  readonly scopeKey: string;
  /** מיקום העוגן (פתיחת ההפניה הראשונה) במקור הגולמי — העוגן ההדדי. */
  readonly anchorStart: number;
  /** מספר ההפניות להערה זו (1 = רגיל; >1 — מדווח). */
  readonly referenceCount: number;
}

/** תוצאת מספור מלאה — state מפורש שאפשר לבקר. */
export interface NoteNumberingResult {
  readonly policy: NoteNumberingPolicy;
  /** מיפוי ‎noteId → הצבה‎ לזרמים הממוספרים בלבד. */
  readonly assignments: ReadonlyMap<string, NoteNumberAssignment>;
  /** הערות זרמי־הדפסה (שוליים/סיום/צד) בלי אף הפניה — מדווחות, לא ממוספרות. */
  readonly orphanNoteIds: readonly string[];
  /** הערות עם יותר מהפניה אחת — ממוספרות לפי ההפניה הראשונה. */
  readonly multiReferencedNoteIds: readonly string[];
  /** כל ההערות המופנות בסדר המסמך (כל הזרמים, כולל בלתי־ממוספרים). */
  readonly documentOrder: readonly string[];
  /** ההיקפים בסדר הופעתם + מספר הערות בכל אחד — האיפוסים המפורשים. */
  readonly scopeCounts: readonly { readonly scopeKey: string; readonly count: number }[];
}

/** הקשר עמודים — נדרש להיקף ‎page‎ בלבד; מסופק על ידי המנוע (שלב 49+). */
export interface NumberingPageContext {
  /** מיקום עוגן במקור ← מספר עמוד פיזי שהוחלט בעימוד. */
  readonly pageOfAnchor: (anchorStart: number) => number;
}

// ─────────────────────────── גימטריא (פורט נאמן של הישן) ───────────────────────────

const GEMATRIA_ONES = Object.freeze(['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']);
const GEMATRIA_TENS = Object.freeze(['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']);
const GEMATRIA_HUNDREDS = Object.freeze(['', 'ק', 'ר', 'ש', 'ת']);

/**
 * המרת מספר לאותיות עבריות — פורט מילולי של ‎src/lib/gematria.ts‎ הישן
 * (אותו אלגוריתם, אותן תוצאות — כולל התנהגות הישן ב־1000 = תת״ר,
 * שכן הקוד הישן נכנס למסלול ה־>1000 רק מ־1001 ומעלה; וקטורי הבדיקה
 * של הישן מועברים לבדיקות החבילה). ‎1 → א · 15 → ט״ו · 16 → ט״ז ·
 * ‎123 → קכ״ג · 400 → ת · 1001 → א׳א‎.
 * מדיניות גימטריא מלאה של פוליו — שלב 67; כאן: תוויות מספור בלבד.
 */
export function toGematriaLabel(num: number): string {
  if (num <= 0) return '';
  if (num > 1000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    const thousandsStr = thousands === 1 ? 'א׳' : toGematriaLabel(thousands) + '׳';
    return remainder > 0 ? `${thousandsStr}${toGematriaLabel(remainder)}` : thousandsStr;
  }
  const h = Math.floor(num / 100);
  const t = Math.floor((num % 100) / 10);
  const o = num % 10;
  if (num === 15) return 'ט״ו';
  if (num === 16) return 'ט״ז';
  let result = '';
  if (num >= 400) {
    const thousandsOf400 = Math.floor(num / 400);
    for (let i = 0; i < thousandsOf400; i = i + 1) result = result + 'ת';
    const remainder = num % 400;
    if (remainder > 0) result = result + toGematriaLabel(remainder);
    if (result.length > 1 && !result.includes('״')) {
      const last = result.slice(-1);
      const rest = result.slice(0, -1);
      return `${rest}״${last}`;
    }
    return result;
  }
  if (h > 0) result = result + GEMATRIA_HUNDREDS[Math.min(h, 4)]!;
  if (t > 0) result = result + GEMATRIA_TENS[t]!;
  if (o > 0) result = result + GEMATRIA_ONES[o]!;
  if (result.length > 1) {
    const last = result.slice(-1);
    const rest = result.slice(0, -1);
    return `${rest}״${last}`;
  }
  return result;
}

/** פורמט התווית לפי המדיניות. */
export function formatNoteLabel(ordinal: number, format: NoteLabelFormat): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new ContentModelError(
      'errors.notes.INVALID_ORDINAL',
      { ordinal: String(ordinal) },
      'מספר סידורי של הערה חייב להיות שלם חיובי',
    );
  }
  return format === 'gematria' ? toGematriaLabel(ordinal) : String(ordinal);
}

// ─────────────────────────── איסוף הפניות ───────────────────────────

interface RefInfo {
  firstStart: number;
  count: number;
}

/** איסוף כל הפניות ההערות בסדר זרימת המסמך — noteId ← מיקום ראשון + מספר. */
export function collectNoteReferences(doc: TorahDocument): ReadonlyMap<string, RefInfo> {
  const refs = new Map<string, RefInfo>();
  for (const block of allBlocks(doc)) {
    for (const item of block.inline) {
      if (item.kind !== 'note-reference') continue;
      const found = refs.get(item.noteId);
      if (found === undefined) {
        refs.set(item.noteId, { firstStart: item.source.startUtf16, count: 1 });
      } else {
        found.count = found.count + 1;
      }
    }
  }
  return refs;
}

// ─────────────────────────── המספור ───────────────────────────

/**
 * מספור הערות טרם העימוד — טהור ודטרמיניסטי. הסדר לפי מיקום ההפניה
 * הראשונה בזרימה; האיפוס לפי ההיקף במדיניות; התווית resolved. היקף
 * ‎page‎ דורש הקשר עמודים (החלטות העימוד) — בלעדיו שגיאה מקוטלגת.
 */
export function numberNotes(
  doc: TorahDocument,
  policy: NoteNumberingPolicy = DEFAULT_NOTE_NUMBERING_POLICY,
  pageContext?: NumberingPageContext,
): NoteNumberingResult {
  validatePolicy(policy);
  if (policy.scope === 'page' && pageContext === undefined) {
    throw new ContentModelError(
      'errors.notes.PAGE_SCOPE_REQUIRES_CONTEXT',
      { scope: policy.scope },
      'מספור בהיקף page דורש הקשר עמודים (החלטות העימוד) — אין לנחש עמודים לפני שהוחלטו',
    );
  }

  const refs = collectNoteReferences(doc);

  // מועמדים: הערות הזרמים הממוספרים עם לפחות הפניה אחת
  interface Candidate {
    noteId: string;
    kind: NoteKind;
    anchorStart: number;
    referenceCount: number;
    scopeKey: string;
  }
  const candidates: Candidate[] = [];
  const orphanNoteIds: string[] = [];
  const multiReferencedNoteIds: string[] = [];
  const printedKinds: readonly NoteKind[] = ['footnote', 'endnote', 'sidenote'];

  const scopeKeyOf = (anchorStart: number): string => {
    switch (policy.scope) {
      case 'continuous':
        return 'doc';
      case 'page':
        return `page:${(pageContext as NumberingPageContext).pageOfAnchor(anchorStart)}`;
      case 'part': {
        const idx = findContainingPart(doc, anchorStart);
        return idx === -1 ? 'part:pre' : `part:${idx}`;
      }
      case 'siman': {
        const found = findContainingSiman(doc, anchorStart);
        return found === undefined ? 'siman:pre' : `siman:${found.partIdx}:${found.simanIdx}`;
      }
    }
  };

  for (const kind of ['footnote', 'endnote', 'sidenote', 'editorial'] as const) {
    const list = doc.notes[streamListKey(kind)];
    for (const note of list) {
      const ref = refs.get(note.noteId);
      if (kind === 'editorial') continue; // אינה מודפסת — ההסרה נרשמת בספר (שלב 17)
      if (ref === undefined) {
        orphanNoteIds.push(note.noteId); // אף הפניה — מדווח, לא ממוספר בשקט
        continue;
      }
      if (ref.count > 1) multiReferencedNoteIds.push(note.noteId);
      if (!(policy.streams as readonly string[]).includes(kind)) continue;
      candidates.push({
        noteId: note.noteId,
        kind,
        anchorStart: ref.firstStart,
        referenceCount: ref.count,
        scopeKey: scopeKeyOf(ref.firstStart),
      });
    }
  }

  // סדר המסמך: לפי מיקום העוגן, ואז לפי מזהה — דטרמיניסטי לחלוטין
  candidates.sort((a, b) => a.anchorStart - b.anchorStart || (a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0));

  const assignments = new Map<string, NoteNumberAssignment>();
  const scopeCounts: { scopeKey: string; count: number }[] = [];
  let currentScope: string | undefined;
  let ordinal = 0;
  for (const cand of candidates) {
    if (cand.scopeKey !== currentScope) {
      currentScope = cand.scopeKey;
      ordinal = 1;
      scopeCounts.push({ scopeKey: cand.scopeKey, count: 0 });
    } else {
      ordinal = ordinal + 1;
    }
    const bucket = scopeCounts[scopeCounts.length - 1] as { scopeKey: string; count: number };
    bucket.count = bucket.count + 1;
    assignments.set(cand.noteId, Object.freeze({
      noteId: cand.noteId,
      kind: cand.kind,
      ordinal,
      label: formatNoteLabel(ordinal, policy.labelFormat),
      scopeKey: cand.scopeKey,
      anchorStart: cand.anchorStart,
      referenceCount: cand.referenceCount,
    }));
  }

  // סדר המסמך של כל ההערות המופנות (כל הזרמים) — לביקורת ול־FIFO של הערות צד (§10.3)
  const documentOrder = [...refs.entries()]
    .sort((a, b) => a[1].firstStart - b[1].firstStart || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id]) => id);
  void printedKinds;

  return Object.freeze({
    policy,
    assignments: Object.freeze(assignments),
    orphanNoteIds: Object.freeze(orphanNoteIds),
    multiReferencedNoteIds: Object.freeze(multiReferencedNoteIds),
    documentOrder: Object.freeze(documentOrder),
    scopeCounts: Object.freeze(scopeCounts),
  });
}

function streamListKey(kind: NoteKind): 'footnotes' | 'endnotes' | 'sidenotes' | 'editorial' {
  switch (kind) {
    case 'footnote': return 'footnotes';
    case 'endnote': return 'endnotes';
    case 'sidenote': return 'sidenotes';
    case 'editorial': return 'editorial';
  }
}

function validatePolicy(policy: NoteNumberingPolicy): void {
  if (policy === null || typeof policy !== 'object') {
    throw new ContentModelError('errors.notes.INVALID_POLICY', { reason: 'not-an-object' }, 'מדיניות מספור חייבת אובייקט');
  }
  if (!(NOTE_NUMBERING_SCOPES as readonly string[]).includes(policy.scope)) {
    throw new ContentModelError(
      'errors.notes.INVALID_POLICY',
      { reason: `scope:${String(policy.scope)}` },
      `היקף מספור חייב להיות אחד מ: ${NOTE_NUMBERING_SCOPES.join(', ')}`,
    );
  }
  if (!(NOTE_LABEL_FORMATS as readonly string[]).includes(policy.labelFormat)) {
    throw new ContentModelError(
      'errors.notes.INVALID_POLICY',
      { reason: `labelFormat:${String(policy.labelFormat)}` },
      `פורמט תווית חייב להיות אחד מ: ${NOTE_LABEL_FORMATS.join(', ')}`,
    );
  }
  if (!Array.isArray(policy.streams) || policy.streams.length === 0) {
    throw new ContentModelError('errors.notes.INVALID_POLICY', { reason: 'streams:empty' }, 'חייב לפחות זרם ממוספר אחד');
  }
  const valid: readonly string[] = ['footnote', 'endnote', 'sidenote', 'editorial'];
  for (const s of policy.streams) {
    if (!valid.includes(s)) {
      throw new ContentModelError('errors.notes.INVALID_POLICY', { reason: `stream:${String(s)}` }, `זרם לא חוקי: ${String(s)}`);
    }
  }
  if (new Set(policy.streams).size !== policy.streams.length) {
    throw new ContentModelError('errors.notes.INVALID_POLICY', { reason: 'streams:duplicate' }, 'אין כפילויות בזרמים הממוספרים');
  }
}

/**
 * החלק שמכיל את המיקום. פרוסת חלק במסמך היא טווח שורת הכותרת שלו —
 * עוגני גוף נופלים אחריה, ולכן הכלל הקובע הוא "החלק הקודם הקרוב"
 * (כותרת החלק האחרונה שלפני המיקום); ‎-1‎ = לפני כל חלק (תוכן קדם־כותרת).
 */
function findContainingPart(doc: TorahDocument, pos: number): number {
  let fallback = -1;
  for (let i = 0; i < doc.parts.length; i = i + 1) {
    const part = doc.parts[i] as { source?: { startUtf16: number; endUtf16: number } };
    if (part.source === undefined) continue;
    if (pos >= part.source.startUtf16 && pos < part.source.endUtf16) return i;
    if (part.source.startUtf16 <= pos) fallback = i;
  }
  return fallback;
}

/**
 * הסימן שמכיל את המיקום — { partIdx, simanIdx }. כמו בחלקים: פרוסת
 * הסימן היא טווח שורת הכותרת, והכלל הקובע הוא "הסימן הקודם הקרוב";
 * ‎undefined‎ = לפני כל סימן (תוכן קדם־כותרת).
 */
function findContainingSiman(doc: TorahDocument, pos: number): { partIdx: number; simanIdx: number } | undefined {
  let fallback: { partIdx: number; simanIdx: number } | undefined;
  for (let p = 0; p < doc.parts.length; p = p + 1) {
    const part = doc.parts[p] as {
      source?: { startUtf16: number; endUtf16: number };
      simanim: readonly { source?: { startUtf16: number; endUtf16: number } }[];
    };
    for (let s = 0; s < part.simanim.length; s = s + 1) {
      const siman = part.simanim[s] as { source?: { startUtf16: number; endUtf16: number } };
      if (siman.source === undefined) continue;
      if (pos >= siman.source.startUtf16 && pos < siman.source.endUtf16) return { partIdx: p, simanIdx: s };
      if (siman.source.startUtf16 <= pos) fallback = { partIdx: p, simanIdx: s };
    }
  }
  return fallback;
}
