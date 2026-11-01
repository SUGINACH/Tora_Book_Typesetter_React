/**
 * text-audit.ts — Text Audit v1: הוכחה שהקלט לא אבד ולא שוכפל בפרסור (שלב 21).
 *
 * אסמכתא: אפיון §14.1 (AuditFinding — ממצא אחיד), §14.2 (שכבת Text Audit:
 * "רצף כל source atoms מופיע בדיוק פעם אחת בגוף/notes, למעט transformations
 * מורשים"; "אין השוואה גסה של join('') בלבד; הבדיקה מבוססת IDs
 * ופרוסות"), §14.3 (חומרות), §17.1 (Property/fuzz — אין crash/איבוד atoms),
 * §17.2#6 (פיצול runs אינו משנה AST סמנטי), §18-M2 (שער: round-trip מוכיח
 * 100% כיסוי אטומים) · תכנית שלב 21.
 *
 * עקרונות:
 *   1. **בלתי תלוי** (§14): הביקורת מחשבת מחדש את הכיסוי מהמסמך עצמו —
 *      היא אינה סומכת על הוכחת הכיסוי שהפרסר מחזיר; אם שתי החשיבות חלוקות
 *      — ממצא HIGH מדווח (ביקורת הביקורת).
 *   2. **מבוססת פרוסות ומזהים**, לא join(''): כל עמדת מקור נספרת לפי
 *      האטומים המכסים אותה; כפילות מזהה אטום = שכפול נוסח (HIGH).
 *   3. **חשבונאות מלאה**: כל עמדה חייבת להיות מכוסה בדיוק פעם אחת על ידי
 *      אטום תוכן, ערך metadata, תחביר (syntax span) או explicit-break.
 *      חסר = HIGH; חפיפה = HIGH; רווחית שולית מותרת כתחביר בלבד.
 *   4. **טרנספורמציות מוצהרות**: הסרות (suppress) והחדרות (insert) נספרות
 *      ונבדקות מול ספר הטרנספורמציות — כל רשומה חייבת לקשר מקור ליעד
 *      (שלמות הספר מוכח�ת; ledgerIntegrityIssues משלב 15 מדווח כממצאים).
 *   5. **קישוריות הערות**: כל הפניה → גוף הערה אחד; הערת דפוס יתומה =
 *      ממצא (MEDIUM, §14.2 "אין sidenote יתום"); הערות עורך פטורות —
 *      ההסרה שלהן מוצהרת בספר.
 *   6. אין sentinel/placeholders גולמיים בתוצאה (HIGH); HTML מילולי
 *      באטומים — ממצא LOW (איכות קלט, לא איבוד).
 *   7. טהור ודטרמיניסטי — מתאים ל־fuzz ול־CI.
 */

import { allBlocks, ledgerIntegrityIssues } from '@tora/content-model';
import type {
  AtomId,
  CoverageProof,
  NoteKind,
  SourceSpan,
  SyntaxSpan,
  TorahDocument,
  TransformRecord,
} from '@tora/content-model';
import type { LedgerIssue } from '@tora/content-model';

// ─────────────────────────── קטלוג שגיאות מקומי (תבנית שלב 12) ───────────────────────────

export interface AuditErrorEntry {
  readonly i18nKey: string;
  readonly params: readonly string[];
  readonly severity: 'fatal' | 'error';
}

export const AUDIT_CORE_ERROR_CATALOG: Readonly<Record<string, AuditErrorEntry>> = Object.freeze({
  'errors.audit.INVALID_INPUT': { i18nKey: 'errors.audit.INVALID_INPUT', params: ['reason'], severity: 'error' },
  'errors.audit.UNREGISTERED_FINDING_CODE': { i18nKey: 'errors.audit.UNREGISTERED_FINDING_CODE', params: ['code'], severity: 'fatal' },
});

/** שגיאת audit-core — עוברת דרך הקטלוג בזמן יצירה. */
export class AuditCoreError extends Error {
  readonly catalogKey: string;
  constructor(catalogKey: string, params: Record<string, string>, internalMessage: string) {
    const entry = AUDIT_CORE_ERROR_CATALOG[catalogKey];
    if (entry === undefined) {
      throw new Error(`unregistered audit-core error key: ${catalogKey}`);
    }
    super(`${catalogKey}: ${internalMessage}`);
    this.name = 'AuditCoreError';
    this.catalogKey = catalogKey;
    void params;
  }
}

export function isRegisteredAuditErrorKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(AUDIT_CORE_ERROR_CATALOG, key);
}

export function auditErrorCatalogSize(): number {
  return Object.keys(AUDIT_CORE_ERROR_CATALOG).length;
}

// ─────────────────────────── ממצאים (§14.1) ───────────────────────────

/** חומרה לפי §14.3. */
export type AuditSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

/** ממצא אחיד — בדיוק כמו §14.1 AuditFinding, ברמת הטקסט (בלי pageId/regionId — עדיין אין עימוד). */
export interface TextAuditFinding {
  readonly code: string;
  readonly severity: AuditSeverity;
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly sourceSpans: readonly SourceSpan[];
  readonly actual?: string | number;
  readonly expected?: string | number;
}

/** כל קודי הממצא שהשכבה מפיקה — סגור ורשום. */
export const TEXT_AUDIT_FINDING_CODES: readonly string[] = Object.freeze([
  'audit.text.MISSING_ATOM',
  'audit.text.DUPLICATE_ATOM',
  'audit.text.OVERLAP_ATOM_SYNTAX',
  'audit.text.DUPLICATE_ATOM_ID',
  'audit.text.UNRESOLVED_NOTE_REFERENCE',
  'audit.text.ORPHAN_NOTE',
  'audit.text.LEDGER_ISSUE',
  'audit.text.RAW_CONTROL_PLACEHOLDER',
  'audit.text.HTML_IN_ATOMS',
  'audit.text.COVERAGE_DISAGREEMENT',
  'audit.text.ATOM_TEXT_MISMATCH',
]);

// ─────────────────────────── הקלט לביקורת ───────────────────────────

/** מה שהביקורת צריכה — מפורק מ־ParseResult כדי שאפשר יהיה לבקר גם מסמך שעבר טרנספורמציות. */
export interface TextAuditInput {
  readonly doc: TorahDocument;
  readonly syntax: readonly SyntaxSpan[];
  readonly transforms: readonly TransformRecord[];
  /** הוכחת הכיסוי של הפרסר — לבדיקה צולבת בלבד; הביקורת מחשבת לבד. */
  readonly coverage?: CoverageProof;
  /** האטומים שהוגשו לצינור לפני הטרנספורמציות — לבדיקת שלמות הספר
   *  (ברירת מחדל: אטומי המסמך; אחרי split/merge יש להעביר את אטומי המקור). */
  readonly presentedAtomIds?: readonly AtomId[];
}

// ─────────────────────────── הדוח ───────────────────────────

export interface TextAuditReport {
  /** אמת ⟺ אפס ממצאי HIGH. */
  readonly ok: boolean;
  readonly sourceLength: number;
  readonly atomCount: number;
  readonly atomChars: number;
  readonly syntaxChars: number;
  readonly metadataChars: number;
  readonly breakChars: number;
  readonly whitespaceGaps: number;
  readonly suppressedRecords: number;
  readonly insertedAtomCount: number;
  readonly splitRecords: number;
  readonly mergeRecords: number;
  readonly reorderRecords: number;
  readonly bidiRecords: number;
  readonly findings: readonly TextAuditFinding[];
  readonly highCount: number;
  readonly mediumCount: number;
  readonly lowCount: number;
  /** הכיסוי העצמאי שהביקורת חישבה — בלי לסמוך על הפרסר. */
  readonly independentCoverage: {
    readonly sourceLength: number;
    readonly covered: number;
    readonly missing: number;
    readonly duplicated: number;
  };
}

// ─────────────────────────── הביקורת ───────────────────────────

const SENTINEL_RE = /[\u0001\u0002]/;
const HTML_TAG_RE = /<[A-Za-z/!][^>\n]*>/;

/**
 * Text Audit v1 — ביקורת טקסט עצמאית על מסמך מפורסר (או מטרנספרם).
 * טהורה; אותו קלט ← אותו דוח, תמיד. שעד השלב: ‎ok === true‎ מוכיח
 * "round-trip מוכיח 100% כיסוי אטומים" (§18-M2).
 */
export function runTextAudit(raw: string, input: TextAuditInput): TextAuditReport {
  if (typeof raw !== 'string') {
    throw new AuditCoreError('errors.audit.INVALID_INPUT', { reason: 'raw:not-a-string' }, 'המקור הגולמי חייב מחרוזת');
  }
  if (input === null || typeof input !== 'object' || input.doc === undefined) {
    throw new AuditCoreError('errors.audit.INVALID_INPUT', { reason: 'doc' }, 'נדרשים doc/syntax/transforms');
  }
  const { doc, syntax, transforms } = input;
  const findings: TextAuditFinding[] = [];
  const finding = (code: string, severity: AuditSeverity, params: Record<string, string | number>, spans: readonly SourceSpan[], actual?: string | number, expected?: string | number): void => {
    if (!(TEXT_AUDIT_FINDING_CODES as readonly string[]).includes(code)) {
      throw new AuditCoreError('errors.audit.UNREGISTERED_FINDING_CODE', { code }, `קוד ממצא לא רשום: ${code}`);
    }
    findings.push(Object.freeze({
      code, severity, messageKey: code, params: Object.freeze({ ...params }),
      sourceSpans: Object.freeze([...spans]), ...(actual !== undefined ? { actual } : {}), ...(expected !== undefined ? { expected } : {}),
    }));
  };
  const spanAt = (start: number, end: number): SourceSpan => ({ documentId: doc.documentId, stream: 'body', startUtf16: start, endUtf16: end });
  const N = raw.length;

  // ── 1. איסוף עצמאי של כל האטומים (גוף + הערות) — מעבר יחיד, בלי אובייקטי
  // ביניים (זיכרון: הקורפוס מכיל מיליוני אטומים). באותו מעבר: נאמנות
  // פרוסה (ADR-007), sentinel/placeholders גולמיים ו־HTML מילולי. ──
  const seenIds = new Map<string, number>(); // atomId → מופעים
  const starts: number[] = [];
  const ends: number[] = [];
  let atomCount = 0;
  let atomChars = 0;
  let insertedAtomCount = 0;
  for (const block of allBlocks(doc)) {
    for (const item of block.inline) {
      if (item.kind !== 'text') continue;
      for (const atom of item.atoms) {
        atomCount += 1;
        seenIds.set(atom.id, (seenIds.get(atom.id) ?? 0) + 1);
        if (atom.origin !== undefined) {
          insertedAtomCount += 1;
          continue; // אטום החדרה — אינו מכסה מקור
        }
        atomChars += atom.text.length;
        const start = atom.source.startUtf16;
        const end = atom.source.endUtf16;
        starts.push(start);
        ends.push(end);
        // נאמנות: כל אטום מקור שווה לפרוסת המקור שלו מילולית
        if (start < 0 || end > N || end < start) {
          finding('audit.text.ATOM_TEXT_MISMATCH', 'HIGH', { atomId: atom.id.slice(0, 80), reason: 'span-out-of-range' }, [spanAt(Math.max(0, Math.min(start, N)), Math.max(0, Math.min(end, N)))], end - start, atom.text.length);
          continue;
        }
        if (raw.slice(start, end) !== atom.text) {
          finding('audit.text.ATOM_TEXT_MISMATCH', 'HIGH', { atomId: atom.id.slice(0, 80), reason: 'text-not-verbatim' }, [spanAt(start, end)], atom.text.length, end - start);
        }
        // אין sentinel/placeholders גולמיים (HIGH); HTML מילולי — LOW (איכות קלט)
        if (SENTINEL_RE.test(atom.text)) {
          finding('audit.text.RAW_CONTROL_PLACEHOLDER', 'HIGH', { atomId: atom.id.slice(0, 80) }, [spanAt(start, end)]);
        }
        if (HTML_TAG_RE.test(atom.text)) {
          finding('audit.text.HTML_IN_ATOMS', 'LOW', { atomId: atom.id.slice(0, 80), excerpt: atom.text.slice(0, 24) }, [spanAt(start, end)]);
        }
      }
    }
  }

  // ── 2. כפילות מזהה אטום = שכפול נוסח (HIGH) ──
  for (const [id, count] of seenIds) {
    if (count > 1) {
      finding('audit.text.DUPLICATE_ATOM_ID', 'HIGH', { atomId: id.slice(0, 80), count }, [spanAt(0, 0)], count, 1);
    }
  }

  // ── 3. כיסוי עמדות עצמאי — ספירה לפי פרוסות ──
  const counts = new Uint32Array(N);
  for (let a = 0; a < starts.length; a = a + 1) {
    const from = Math.max(0, starts[a] as number);
    const to = Math.min(N, ends[a] as number);
    for (let i = from; i < to; i = i + 1) counts[i] = (counts[i] as number) + 1;
  }
  const kind = new Uint8Array(N); // 1=syntax 2=metadata 3=break
  let syntaxChars = 0;
  for (const s of syntax) {
    for (let i = Math.max(0, s.start); i < Math.min(N, s.end); i = i + 1) {
      if (kind[i] === 0) { kind[i] = 1; syntaxChars += 1; }
    }
  }
  let metadataChars = 0;
  for (const m of doc.metadata) {
    for (let i = Math.max(0, m.source.startUtf16); i < Math.min(N, m.source.endUtf16); i = i + 1) {
      if (kind[i] === 0) { kind[i] = 2; metadataChars += 1; }
    }
  }
  let breakChars = 0;
  for (const block of allBlocks(doc)) {
    for (const item of block.inline) {
      if (item.kind !== 'explicit-break') continue;
      for (let i = Math.max(0, item.source.startUtf16); i < Math.min(N, item.source.endUtf16); i = i + 1) {
        if (kind[i] === 0) { kind[i] = 3; breakChars += 1; }
      }
    }
  }

  // חסר / כפול / חפיפה — מדווח בגושים רציפים (מיקום מדויק, לא רשימת עמדות).
  // פער אמיתי = אף אטום לא מכסה (counts=0) ואינו תחביר/מטא/שבירה (kind=0).
  // פער רווחית בלבד — מותר (קיצוץ שולי הקווים, שלב 17); נספר ואינו מדווח כ־HIGH.
  let missing = 0;
  let duplicated = 0;
  let covered = 0;
  let whitespaceGaps = 0;
  {
    let i = 0;
    while (i < N) {
      if ((counts[i] as number) === 1) { covered += 1; i = i + 1; continue; }
      if ((counts[i] as number) === 0 && kind[i] === 0) {
        let j = i;
        while (j < N && (counts[j] as number) === 0 && kind[j] === 0) j = j + 1;
        const gapText = raw.slice(i, j);
        if (gapText.trim().length === 0) {
          whitespaceGaps += 1;
        } else {
          missing += j - i;
          finding('audit.text.MISSING_ATOM', 'HIGH', { startUtf16: i, endUtf16: j, length: j - i, excerpt: raw.slice(i, Math.min(j, i + 24)) }, [spanAt(i, j)], 'missing', 'covered');
        }
        i = j;
        continue;
      }
      if ((counts[i] as number) > 1) {
        let j = i;
        while (j < N && (counts[j] as number) > 1) j = j + 1;
        duplicated += j - i;
        finding('audit.text.DUPLICATE_ATOM', 'HIGH', { startUtf16: i, endUtf16: j, length: j - i, times: counts[i] as number }, [spanAt(i, j)], counts[i] as number, 1);
        i = j;
        continue;
      }
      i = i + 1; // מכוסה על ידי תחביר/מטא/שבירה
    }
  }
  // חפיפה אטום∩תחביר
  let k = 0;
  while (k < N) {
    if ((counts[k] as number) > 0 && kind[k] !== 0) {
      let j = k;
      while (j < N && (counts[j] as number) > 0 && kind[j] !== 0) j = j + 1;
      finding('audit.text.OVERLAP_ATOM_SYNTAX', 'HIGH', { startUtf16: k, endUtf16: j }, [spanAt(k, j)]);
      k = j;
    } else k = k + 1;
  }

  // ── 4. נאמנות הפרוסות נבדקה במעבר היחיד של סעיף 1 ──

  // ── 5. קישוריות הערות (§14.2) ──
  const noteIds = new Set<string>();
  const printedKinds: readonly { kind: NoteKind; list: readonly import('@tora/content-model').NoteEntry[] }[] = [
    { kind: 'footnote', list: doc.notes.footnotes },
    { kind: 'endnote', list: doc.notes.endnotes },
    { kind: 'sidenote', list: doc.notes.sidenotes },
    { kind: 'editorial', list: doc.notes.editorial },
  ];
  for (const { list } of printedKinds) for (const note of list) noteIds.add(note.noteId);
  const referenced = new Set<string>();
  for (const block of allBlocks(doc)) {
    for (const item of block.inline) {
      if (item.kind !== 'note-reference') continue;
      referenced.add(item.noteId);
      if (!noteIds.has(item.noteId)) {
        finding('audit.text.UNRESOLVED_NOTE_REFERENCE', 'HIGH', { noteId: item.noteId }, [item.source]);
      }
    }
  }
  // יתומות: הערות דפוס בלי הפניה (MEDIUM); הערות עורך פטורות — ההסרה מוצהרת בספר
  const suppressedFrom = new Set<string>();
  for (const t of transforms) {
    if (t.kind === 'suppress') for (const id of t.from) suppressedFrom.add(id);
  }
  for (const { kind, list } of printedKinds) {
    if (kind === 'editorial') continue;
    for (const note of list) {
      if (!referenced.has(note.noteId)) {
        finding('audit.text.ORPHAN_NOTE', 'MEDIUM', { noteId: note.noteId, kind }, [note.block.source]);
      }
    }
  }

  // ── 6. שלמות ספר הטרנספורמציות (שלב 15) ──
  const sourceAtomIds: AtomId[] = [];
  if (input.presentedAtomIds !== undefined) {
    for (const id of input.presentedAtomIds) sourceAtomIds.push(id);
  } else {
    for (const block of allBlocks(doc)) {
      for (const item of block.inline) {
        if (item.kind !== 'text') continue;
        for (const atom of item.atoms) sourceAtomIds.push(atom.id);
      }
    }
  }
  const ledgerIssues: readonly LedgerIssue[] = ledgerIntegrityIssues(transforms, sourceAtomIds);
  for (const issue of ledgerIssues) {
    finding('audit.text.LEDGER_ISSUE', 'HIGH', { code: issue.code, atomId: issue.atomId.slice(0, 80), recordIndex: issue.recordIndex }, []);
  }
  let suppressedRecords = 0;
  let splitRecords = 0;
  let mergeRecords = 0;
  let reorderRecords = 0;
  let bidiRecords = 0;
  for (const t of transforms) {
    if (t.kind === 'suppress') suppressedRecords += 1;
    else if (t.kind === 'split') splitRecords += 1;
    else if (t.kind === 'merge') mergeRecords += 1;
    else if (t.kind === 'reorder') reorderRecords += 1;
    else if (t.kind === 'bidi') bidiRecords += 1;
  }

  // ── 7. sentinel/HTML נבדקו במעבר היחיד של סעיף 1 ──

  // ── 8. בדיקה צולבת מול הוכחת הפרסר (ביקורת הביקורת) ──
  if (input.coverage !== undefined) {
    const parserOk = input.coverage.ok;
    const auditOk = missing === 0 && duplicated === 0;
    if (parserOk !== auditOk) {
      finding('audit.text.COVERAGE_DISAGREEMENT', 'HIGH', { parserOk: String(parserOk), auditOk: String(auditOk) }, [], String(parserOk), String(auditOk));
    }
  }

  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;
  const lowCount = findings.filter((f) => f.severity === 'LOW').length;
  return Object.freeze({
    ok: highCount === 0,
    sourceLength: N,
    atomCount,
    atomChars,
    syntaxChars,
    metadataChars,
    breakChars,
    whitespaceGaps,
    suppressedRecords,
    insertedAtomCount,
    splitRecords,
    mergeRecords,
    reorderRecords,
    bidiRecords,
    findings: Object.freeze(findings),
    highCount,
    mediumCount,
    lowCount,
    independentCoverage: Object.freeze({
      sourceLength: N,
      covered,
      missing,
      duplicated,
    }),
  });
}
