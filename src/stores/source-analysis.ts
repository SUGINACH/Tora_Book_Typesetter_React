/**
 * source-analysis.ts — ניתוח קלט המקור לצורך מפת שגיאות הקלט (שלב 80; אפיון §3.3, §13–14).
 *
 * מה שיש כאן:
 *   1. מיפוי היסטים ← שורה:עמודה. מרחב הקואורדינטות הוא UTF-16 של המקור
 *      הגולמי — אותו מרחב של הפרסר ושל SourceSpan (שלב 14). העמודה נספרת
 *      ביחידות UTF-16 (לא בנקודות קוד) — עקבי עם החוזה, ומתועד כאן.
 *      שורות נספרות כמו בפרסר: פיצול על ‎\n‎ בלבד (‎\r‎ חוקי בקצוות שורה).
 *   2. ‎`analyzeSource`‎ — הפרסר הנעול (content-model, שלב 17) רץ על המקור
 *      פעם אחת; הדיאגנוסטיקה שלו ממופה לבעיות ממוקדות (קוד קטלוגי +
 *      שורה/עמודה + שורת המקור), וסקירת המסמך (metadata, זרמי הערות,
 *      סימנים) נבנית מאותה תוצאה — אין פרסור שני (מסמך קנוני 3.4MB
 *      לוקח ~3 שניות; זהות הריצה מחייבת פרסור יחיד).
 *   3. קטלוג שגיאות ייבוא ברמת המעטפת — אותו דפוס מחייב של שלב 12
 *      (אפיון §6.3, §16): אין שגיאה ללא קוד קטלוגי; אין הצגת message
 *      גולמי; הקטלוג סטטי וקפוא. התרגום עצמו ב־i18n/import-labels.
 *
 * "אין תיקון שקט של מזהה לא מוכר" (שעת השלב): כל דחייה של הפרסר —
 * נזרקת או מדווחת — מגיעה למפה עם מיקום כשיש לה אחד; שום דבר לא
 * נזרק, לא מתוקן ולא מושתק בדרך.
 *
 * טהור ודטרמיניסטי: אותו מקור ‎⇐‎ אותה תוצאה; אין זמן, רשת או DOM.
 */
import {
  ContentModelError,
  parseSourceText,
  type ParseResult,
  type ParserDiagnostic,
} from '@tora/content-model';

// ─────────────────────────── קטלוג שגיאות ייבוא (מעטפת) ───────────────────────────

export type ImportIssueSeverity = 'error' | 'warning';

/** רשומת קטלוג ייבוא — סטטית וקפואה (דפוס שלב 12). */
export interface ImportErrorEntry {
  readonly params: readonly string[];
  readonly severity: ImportIssueSeverity;
}

/** קטלוג שגיאות הייבוא של המעטפת — סגור וקפוא; התרגום ב־i18n/import-labels. */
export const IMPORT_ERROR_CATALOG: Readonly<Record<string, ImportErrorEntry>> = Object.freeze({
  'errors.import.UNSUPPORTED_FORMAT': { params: ['extension'], severity: 'error' },
  'errors.import.FILE_UNREADABLE': { params: ['reason'], severity: 'error' },
  'errors.import.WORD_CONVERT_FAILED': { params: [], severity: 'error' },
  'errors.import.SAMPLE_UNAVAILABLE': { params: ['path'], severity: 'error' },
  'errors.import.EMPTY_DOCUMENT': { params: [], severity: 'warning' },
  'errors.import.BINARY_CONTENT': { params: [], severity: 'warning' },
  'errors.import.LARGE_DOCUMENT': { params: ['sizeBytes'], severity: 'warning' },
});

/** סף אזהרת מסמך גדול — אזהרת תצוגה בלבד, לא דחייה (הקובץ הקנוני 3.4MB חייב להיטען). */
export const LARGE_DOCUMENT_BYTES = 4 * 1024 * 1024;

/** האם הקוד רשום בקטלוג הייבוא (חשוף למאמתים). */
export function isRegisteredImportErrorKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(IMPORT_ERROR_CATALOG, key);
}

// ─────────────────────────── מיקום: היסט ← שורה:עמודה ───────────────────────────

/** נקודה במקור — שורה ועמודה על בסיס 1; עמודה ביחידות UTF-16. */
export interface SourcePoint {
  readonly line: number;
  readonly column: number;
}

/** נקודות פתיחת השורות (פיצול על ‎\n‎ בלבד — כמו האינדקס של הפרסר). */
export function computeLineStarts(source: string): readonly number[] {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i = i + 1) {
    if (source.charCodeAt(i) === 0x0a) starts.push(i + 1);
  }
  return Object.freeze(starts);
}

/** היסט ← שורה:עמודה (בינארי). היסט שאינו בגבולות נופל בשורה האחרונה שפתיחתה ≤ ההיסט; הקלאמפ לאורך המקור נעשה בשכבת ה־locate (לה יש את האורך). */
export function offsetToLineCol(lineStarts: readonly number[], offset: number): SourcePoint {
  const clamped = offset < 0 ? 0 : offset;
  // השורה הגדולה ביותר שפתיחתה ≤ ההיסט (ההיסט שווה לאורך המקור ⇐ השורה האחרונה).
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= clamped) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: clamped - lineStarts[lo] + 1 };
}

/** תוכן השורה של ההיסט (בלי סוף-שורה) — לתצוגת מקור במפת השגיאות. */
function lineTextOf(source: string, lineStarts: readonly number[], startLine: number): string {
  const lineStart = lineStarts[startLine - 1] ?? 0;
  let lineEnd = source.length;
  if (startLine < lineStarts.length) lineEnd = lineStarts[startLine] - 1; // לפני ה־\n
  return source.slice(lineStart, lineEnd);
}

// ─────────────────────────── בעיה ממוקדת ───────────────────────────

export type IssueParams = Readonly<Record<string, string | number | boolean | null>>;

/**
 * בעיית קלט אחת במפת השגיאות: קוד קטלוגי (מפתח i18n), חומרה, פרמטרים
 * סדירים, מיקום אופציונלי (היסטים + שורה:עמודה + שורת המקור) ומקור
 * הדיווח — הפרסר או שכבת הייבוא.
 */
export interface LocatedIssue {
  readonly code: string;
  readonly severity: ImportIssueSeverity;
  readonly params: IssueParams;
  readonly origin: 'parse' | 'import';
  readonly startUtf16: number | null;
  readonly endUtf16: number | null;
  readonly start: SourcePoint | null;
  readonly end: SourcePoint | null;
  readonly lineText: string | null;
}

/** בעיית ייבוא ללא מקור נטען (כשל מתאם: פורמט/קריאה/המרה) — ללא מיקום. */
export function makeImportIssue(code: string, params: IssueParams): LocatedIssue {
  const entry = IMPORT_ERROR_CATALOG[code];
  if (entry === undefined) {
    // אכיפה בזמן יצירה — קוד לא רשום אינו עובר (שלב 12, כלל 1).
    throw new Error(`unregistered import error key: ${code}`);
  }
  return Object.freeze({
    code,
    severity: entry.severity,
    params: Object.freeze({ ...params }),
    origin: 'import' as const,
    startUtf16: null,
    endUtf16: null,
    start: null,
    end: null,
    lineText: null,
  });
}

/** המרת ערך פרמטר מחרוזתי-מספרי להיסט (הפרסר מעביר היסטים כמחרוזות). */
function offsetParam(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && value !== '' && /^-?\d+$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  return null;
}

function locate(
  source: string,
  lineStarts: readonly number[],
  startUtf16: number | null,
  endUtf16: number | null,
): { start: SourcePoint | null; end: SourcePoint | null; lineText: string | null } {
  if (startUtf16 === null) return { start: null, end: null, lineText: null };
  const start = offsetToLineCol(lineStarts, Math.min(startUtf16, source.length));
  const end = endUtf16 !== null && endUtf16 >= startUtf16
    ? offsetToLineCol(lineStarts, Math.min(endUtf16, source.length))
    : null;
  return { start, end, lineText: lineTextOf(source, lineStarts, start.line) };
}

/**
 * דיאגנוסטיקת פרסר ← בעיה ממוקדת. המיקום מהשדות start/end (כל עשרת
 * קודי הדיאגנוסטיקה נושאים אותם — נבדק מול המקור); לדיאגנוסטיקה אין
 * שדה params — ההקשר הממוקם (שורה:עמודה + שורת המקור) הוא התצוגה,
 * והתווית בקטלוג ה-i18n נטולת פרמטרים. הודעת ה-message הגולמת של
 * הדיאגנוסטיקה אינה מוצגת לעולם (§16).
 */
function diagnosticToIssue(
  source: string,
  lineStarts: readonly number[],
  d: ParserDiagnostic,
): LocatedIssue {
  return finishIssue(source, lineStarts, {
    code: d.code,
    severity: d.severity === 'error' ? 'error' : 'warning',
    params: {},
    origin: 'parse',
    startUtf16: d.start ?? null,
    endUtf16: d.end ?? null,
  });
}

/** השלמת מיקום מפרמטרים כשהדיאגנוסטיקה עצמה לא נשאה היסט (למשל סוגריים לא-תואמים). */
function finishIssue(
  source: string,
  lineStarts: readonly number[],
  base: {
    code: string;
    severity: ImportIssueSeverity;
    params: IssueParams;
    origin: 'parse' | 'import';
    startUtf16: number | null;
    endUtf16: number | null;
  },
): LocatedIssue {
  const fromParams = base.startUtf16 === null
    ? offsetParam(base.params.offset) ?? offsetParam(base.params.startUtf16)
    : null;
  const startUtf16 = base.startUtf16 ?? fromParams;
  const loc = locate(source, lineStarts, startUtf16, base.endUtf16);
  return Object.freeze({
    ...base,
    startUtf16: startUtf16,
    start: loc.start,
    end: loc.end,
    lineText: loc.lineText,
  });
}

// ─────────────────────────── סקירת מסמך ───────────────────────────

/** סקירת המסמך כפי שהפרסר ראה אותו — metadata, זרמי הערות ומבנה. */
export interface DocumentOverview {
  readonly metadata: readonly { readonly key: string; readonly value: string }[];
  readonly notes: Readonly<{
    readonly footnotes: number;
    readonly endnotes: number;
    readonly sidenotes: number;
    readonly editorial: number;
  }>;
  readonly parts: number;
  readonly simanim: number;
  readonly customStyleIds: readonly string[];
}

function overviewOf(parsed: ParseResult): DocumentOverview {
  const doc = parsed.doc;
  let simanim = 0;
  for (const part of doc.parts) simanim += part.simanim.length;
  return Object.freeze({
    metadata: Object.freeze(doc.metadata.map((m) => Object.freeze({ key: m.key, value: m.value }))),
    notes: Object.freeze({
      footnotes: doc.notes.footnotes.length,
      endnotes: doc.notes.endnotes.length,
      sidenotes: doc.notes.sidenotes.length,
      editorial: doc.notes.editorial.length,
    }),
    parts: doc.parts.length,
    simanim,
    customStyleIds: Object.freeze([...doc.customStyleIds]),
  });
}

// ─────────────────────────── הניתוח ───────────────────────────

/**
 * תוצאת ניתוח המקור: מה מוצג במפת השגיאות ובסקירת המסמך.
 * ‎`parseError`‎ ‎≠‎ null ⇐ הפרסר זרק — אין סקירה והריצה נחסמת לפני
 * שליחת job (בדיוק כמו הגדרות לא חוקיות בשלב 79).
 */
export interface SourceAnalysis {
  /** המהדורה של המקור שנותחה — עוגן הטריות מול editorStore.revision. */
  readonly analyzedRevision: number;
  readonly documentName: string;
  readonly overview: DocumentOverview | null;
  readonly parseError: LocatedIssue | null;
  readonly issues: readonly LocatedIssue[];
}

/** קלט הניתוח. */
export interface AnalyzeSourceInput {
  readonly source: string;
  readonly documentId: string;
  readonly revision: number;
  readonly documentName: string;
}

/** הניתוח + תוצאת הפרסר המלאה לשימוש חוזר (הריצה אינה מפרסרת פעמיים). */
export interface AnalyzeSourceResult {
  readonly analysis: SourceAnalysis;
  /** null ⇐ הפרסר זרק; אחרת תוצאת הפרסר של אותו מקור בדיוק. */
  readonly parsed: ParseResult | null;
}

/**
 * ניתוח המקור — פרסור יחיד, דיאגנוסטיקה ממוקדת וסקירה.
 *
 * בדיקות שכבת הייבוא לפני הפרסר: מסמך ריק (אזהרה), תו חילוף פענוח
 * ‎U+FFFD‎ (אזהרה ממוקדת — הבייטים שהוחלפו אינם "שיפור שקט"), ומסמך
 * גדול מהסף (אזהרה בלבד; אין דחייה). כישלון פרסור נתפס וממוקם —
 * שגיאות שאינן ContentModelError של הפרסר אינן מוסתרות כאן (באג
 * פנימי נזרק הלאה — "אין פעולת-אין שקטה").
 */
export function analyzeSource(input: AnalyzeSourceInput): AnalyzeSourceResult {
  const { source } = input;
  const lineStarts = computeLineStarts(source);
  const issues: LocatedIssue[] = [];

  if (source === '') {
    issues.push(makeImportIssue('errors.import.EMPTY_DOCUMENT', {}));
  }
  const firstReplacement = source.indexOf('\uFFFD');
  if (firstReplacement !== -1) {
    // המיקום (שורה:עמודה) מוצג מההיסט — אין צורך בפרמטר כפול בתווית
    issues.push(finishIssue(source, lineStarts, {
      code: 'errors.import.BINARY_CONTENT',
      severity: IMPORT_ERROR_CATALOG['errors.import.BINARY_CONTENT'].severity,
      params: {},
      origin: 'import',
      startUtf16: firstReplacement,
      endUtf16: firstReplacement + 1,
    }));
  }
  if (source.length > LARGE_DOCUMENT_BYTES) {
    issues.push(makeImportIssue('errors.import.LARGE_DOCUMENT', { sizeBytes: source.length }));
  }

  let parsed: ParseResult | null = null;
  let overview: DocumentOverview | null = null;
  let parseError: LocatedIssue | null = null;
  try {
    parsed = parseSourceText(source, { documentId: input.documentId });
    overview = overviewOf(parsed);
    for (const d of parsed.diagnostics) issues.push(diagnosticToIssue(source, lineStarts, d));
  } catch (e) {
    if (e instanceof ContentModelError) {
      parseError = finishIssue(source, lineStarts, {
        code: e.catalogKey,
        // fatal/error של הקטלוג — במפת הקלט שתיהן חוסמות ריצה; מוצגות כשגיאה.
        severity: 'error',
        params: e.params as IssueParams,
        origin: 'parse',
        startUtf16: offsetParam(e.params.offset) ?? offsetParam(e.params.startUtf16),
        endUtf16: null,
      });
      parsed = null;
      overview = null;
    } else {
      throw e; // לא שגיאת פרסר מהקטלוג — באג; לא מוסתר (שקיפות מלאה)
    }
  }

  const analysis: SourceAnalysis = Object.freeze({
    analyzedRevision: input.revision,
    documentName: input.documentName,
    overview,
    parseError,
    issues: Object.freeze(issues),
  });
  return { analysis, parsed };
}
