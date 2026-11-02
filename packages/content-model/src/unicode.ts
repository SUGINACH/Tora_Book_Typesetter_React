/**
 * unicode.ts — נאמנות נוסח ו־Unicode (שלב 18, [ADR-007]).
 *
 * אסמכתא: אפיון §3.3 ("אין לנרמל נוסח בשקט"), §6.2 (SourceSpan/TextAtom),
 * §6.6 (כיסוי בלי רינדור) · ADR-007 · תכנית שלב 18.
 *
 * עקרונות (ADR-007):
 *   1. נרמול אסור במסלול הייצור — המקור נשמר תו-מול-תו לכל אורך הצינור.
 *      מודול זה אינו מנרמל אף מחרוזת שאינה פרויקציה מפורשת.
 *   2. `normalizeView` הוא ההיתר היחיד: פרויקציה ממופה source↔view, לא
 *      נשמרת ולא חוזרת לצינור כמקור — להשוואות וחיפוש בלבד.
 *   3. `findNormalizationSpans` הוא גילוי בלבד: איפה נרמול היה משנה —
 *      מדווח, לא מבוצע. אינווריאנט מוחלט: רשימה ריקה ⟺ text.normalize(form)===text.
 *   4. `inspectUnicode` — מאגר דיווח בלבד של כל קטגוריות התווים שלגביהן
 *      ננעלה מדיניות ב־ADR-007 (ניקוד, טעמים, מקף, גרשיים, בקרות BiDi,
 *      entities, רווחית) — שום דבר אינו "מתוקן".
 *   5. `atomFidelityIssues` — הוכחת נאמנות ברמת האטום: כל אטום מקור שווה
 *      לפרוסת המקור הגולמי שלו, מילולית.
 *
 * מדויקות (ADR-007, "מדויקות הגילוי"): קיום שינוי מדויק תמיד; מיקום עדין
 * לרמת יחידת נרמול בכתבים שבטבלת המשלימים (עברית/לטינית/יוונית/קירילית/
 * ערבית+כלליים), מיקום בגרנולריות מילה לכתבים אחרים (Hangul Jamo וכו').
 * הפיצול ברווחית בטוח: אף רכב/פירוק קנוני אינו חוצה רווחית (ccc=0).
 */

import { ContentModelError } from './errors.js';
import { isCombiningMark } from './atoms.js';
import { allBlocks } from './document.js';
import type { TorahDocument } from './document.js';
import type { TextAtom } from './atoms.js';

// ─────────────────────────── סוגי יסוד ───────────────────────────

/** צורות נרמול Unicode — לגילוי ול־view בלבד; אסורות במסלור הייצור (ADR-007). */
export type UnicodeNormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

/** הצורות החוקיות — סדר קבוע. */
export const UNICODE_NORMALIZATION_FORMS: readonly UnicodeNormalizationForm[] = Object.freeze([
  'NFC', 'NFD', 'NFKC', 'NFKD',
] as const);

/** גרסת המדיניות — מוטבעת בדוחות ליציבות בין שלבים. */
export const UNICODE_POLICY_VERSION = 'unicode-policy:v1' as const;

/** פרוסה שנרמול היה משנה — דיווח בלבד. */
export interface NormalizationSpan {
  readonly form: UnicodeNormalizationForm;
  readonly start: number;
  readonly end: number;
  /** המקור המילולי בפרוסה. */
  readonly original: string;
  /** מה היה נוצר תחת הצורה — לדיווח בלבד. */
  readonly projected: string;
}

/** מאגר Unicode של טקסט — דיווח בלבד, שום תיקון (ADR-007 סעיף 4). */
export interface UnicodeInventory {
  readonly policyVersion: typeof UNICODE_POLICY_VERSION;
  readonly form: 'inventory-v1';
  readonly lengthUtf16: number;
  readonly codePoints: number;
  /** רשימת היסטים של חצאי surrogate בודדים (הפרסר דוחה אותם ממילא). */
  readonly loneSurrogates: readonly number[];
  /** תווי בקרה C0/C1/DEL (למעט \n \t \r שהם תחביר קווי) — היסטים. */
  readonly controlCharacters: readonly number[];
  /** בקרות BiDi — שם לפי תו, וספירה. */
  readonly bidiControls: Readonly<Record<string, number>>;
  readonly nikudCount: number;
  readonly taamimCount: number;
  readonly maqafCount: number;
  readonly gershayimCount: number;
  readonly emSpaceCount: number;
  readonly nbspCount: number;
  readonly bomCount: number;
  /** פרוסות דמויות־HTML entity — דיווח; התוכן מילולי. */
  readonly htmlEntitySpans: readonly { readonly start: number; readonly end: number; readonly text: string }[];
  /** פרוסות דמויות־תגית HTML — דיווח; התוכן מילולי + אזהרת פרסר. */
  readonly htmlTagSpans: readonly { readonly start: number; readonly end: number; readonly text: string }[];
  /** פרוסות ש־NFC היה משנה (דיווח בלבד — ADR-007 סעיף 3). */
  readonly nonNfcSpans: readonly NormalizationSpan[];
  /** האם NFKC היה משנה משהו (ללא מיקום — קיום בלבד). */
  readonly nfkcWouldChange: boolean;
  /** האם NFD היה משנה משהו (קיום בלבד). */
  readonly nfdWouldChange: boolean;
}

/** view מנורמל — פרויקציה מפורשת עם מיפוי מלא (ADR-007 סעיף 2). */
export interface NormalizationView {
  readonly form: UnicodeNormalizationForm;
  /** אמת אם הפרויקציה שינתה משהו; שקר = view זהה למקור. */
  readonly changed: boolean;
  /** הטקסט המוקרן — לא מקור! אינו נשמר ואינו חוזר לצינור. */
  readonly view: string;
  /** viewToSource[j] = היסט המקור של יחידת הנרמול שיצרה את j ב־view. */
  readonly viewToSource: readonly number[];
  /** sourceToView[i] = היסט ה־view של יחידת הנרמול של i במקור. */
  readonly sourceToView: readonly number[];
  /** כל השינויים — ממוקמים במקור. */
  readonly changes: readonly { readonly start: number; readonly end: number; readonly original: string; readonly projected: string }[];
}

/** מדיניות נאמנות לקטגוריית תווים — טבלה מכונה־קריאה (ADR-007 סעיף 4). */
export type UnicodeFidelityPolicyKind =
  | 'preserve'
  | 'preserve-attached'
  | 'whitespace-edge-syntax'
  | 'literal-content-with-warning'
  | 'report-only';

export interface UnicodeFidelityRule {
  readonly category: string;
  readonly description: string;
  readonly policy: UnicodeFidelityPolicyKind;
  /** אסמכתא בתוך ADR-007. */
  readonly adrSection: string;
}

/** בעיית נאמנות ברמת האטום — כל רשימה לא-ריקה היא כשל שעד. */
export interface AtomFidelityIssue {
  readonly kind: 'atom-text-mismatch' | 'atom-out-of-range' | 'lone-surrogate-in-atom';
  readonly atomId: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly detail: string;
}

// ─────────────────────────── מדיניות (ADR-007 סעיף 4) ───────────────────────────

export const UNICODE_FIDELITY_RULES: readonly UnicodeFidelityRule[] = Object.freeze([
  {
    category: 'nikud',
    description: 'ניקוד עברי (U+05B0–U+05BC ובני משפחה) — תוכן; אטום אינו נחתך בין בסיס למשלים; לא מתקנים סדר נקודות',
    policy: 'preserve-attached',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'taamim',
    description: 'טעמי המקרא (U+0591–U+05AF) — תוכן משומר מילולית',
    policy: 'preserve-attached',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'kri-ktiv',
    description: 'סימוני קרי/כתיב — אין בקורפוס הנעול; אם יופיעו הם תוכן מילולי בלבד; אין החלפה/הצגה',
    policy: 'preserve',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'maqaf',
    description: 'מקף עברי (U+05BE) — תוכן; אין החלפה בהייפן לטיני; מדיניות שבירה בשלב 27 בלבד',
    policy: 'preserve',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'gershayim',
    description: 'גרש/גרשיים (U+05F3/U+05F4) — תוכן; אין המרה למרכאות',
    policy: 'preserve',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'bidi-controls',
    description: 'בקרות BiDi (LRM/RLM/LRE/RLE/PDF/LRO/RLO/LRI/RLI/FSI/PDI) — תוכן משומר מילולית; 230 RLM לכל קובץ ארוך בקורפוס; רמות BiDi יחושבו בשלב 28 בלי לגעת בתווים',
    policy: 'preserve',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'html-entities',
    description: 'HTML entities — קלט הוא טקסט חי; אין פענוח; דיווח במאגר בלבד',
    policy: 'literal-content-with-warning',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'html-tags',
    description: 'תגיות HTML בקלט — אטומים מילוליים + אזהרת errors.parser.WARN_HTML_IN_TEXT (מרשם שלב 17); אין HTML כמקור אמת',
    policy: 'literal-content-with-warning',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'edge-whitespace',
    description: 'רווחית Unicode בקצוות שורה — תחביר (trim של הישן, /\\s/ מדויק, לרבות em-space U+2003); רווחית פנימית היא תוכן',
    policy: 'whitespace-edge-syntax',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'bom',
    description: 'BOM (U+FEFF) — אינו מופיע בקורפוס; אם יופיע — תוכן מילולי בראש המסמך, מדווח, לא נסתר ולא מוסר',
    policy: 'report-only',
    adrSection: 'ADR-007 סעיף 4',
  },
  {
    category: 'normalization',
    description: 'נרמול Unicode (NFC/NFD/NFKC/NFKD) — אסור במסלול הייצור; view מפורש בלבד (normalizeView); הקורפוס מכיל 6 רצפים שאינם NFC לכל קובץ ארוך',
    policy: 'report-only',
    adrSection: 'ADR-007 סעיפים 1–3',
  },
] as const);

// ─────────────────────────── עזרי פנים ───────────────────────────

const HTML_ENTITY_RE = /&#x?[0-9a-fA-F]+;|&[a-zA-Z][a-zA-Z0-9]*;/g;
const HTML_TAG_RE = /<[A-Za-z/!][^>\n]*>/g;

const BIDI_CONTROL_NAMES: Readonly<Record<number, string>> = Object.freeze({
  0x200e: 'LRM', 0x200f: 'RLM',
  0x202a: 'LRE', 0x202b: 'RLE', 0x202c: 'PDF', 0x202d: 'LRO', 0x202e: 'RLO',
  0x2066: 'LRI', 0x2067: 'RLI', 0x2068: 'FSI', 0x2069: 'PDI',
} as Record<number, string>);

function isLoneSurrogateAt(text: string, i: number): boolean {
  const c = text.charCodeAt(i);
  if (c < 0xd800 || c > 0xdfff) return false;
  if (c <= 0xdbff) {
    const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
    return !(next >= 0xdc00 && next <= 0xdfff);
  }
  const prev = i > 0 ? text.charCodeAt(i - 1) : 0;
  return !(prev >= 0xd800 && prev <= 0xdbff);
}

/** גבול code point — לא באמצע surrogate pair (נותר לשימוש עתידי/בדיקות). */
export function isCodePointBoundary(text: string, i: number): boolean {
  if (i <= 0 || i >= text.length) return true;
  const prev = text.charCodeAt(i - 1);
  if (prev < 0xd800 || prev > 0xdbff) return true;
  return false;
}

function assertForm(form: UnicodeNormalizationForm): void {
  if (!(UNICODE_NORMALIZATION_FORMS as readonly string[]).includes(form)) {
    throw new ContentModelError(
      'errors.unicode.INVALID_FORM',
      { form: String(form) },
      `form חייב להיות אחד מ: ${UNICODE_NORMALIZATION_FORMS.join(', ')}`,
    );
  }
}

// ─────────────────────────── גילוי נרמול (דיווח בלבד) ───────────────────────────

/**
 * איתור פרוסות שנרמול בצורה `form` היה משנה — דיווח בלבד, שום שינוי.
 *
 * אלגוריתם (מדויק בקיום, עדין במיקום):
 *   1. מסלול מהיר — השוואת המחרוזת כולה; זהה ⇒ רשימה ריקה.
 *   2. חלוקה למילים בגבולות רווחית (בטוחה: רכב/פירוק קנוני אינו חוצה
 *      רווחית — כל ccc≠0 נצמד לבסיס שלפניו, ורווחית היא בסיס ccc=0 שאינו
 *      מתרכב) — שינוי כלשהו הוא תמיד בתוך מילה אחת.
 *   3. בתוך מילה שהשתנתה: פירוק ליחידות נרמול (בסיס + משלימים לפי טבלת
 *      המשלימים) ובדיקה פר־יחידה — מיקום עדין לכתבים בטבלה; אם אף
 *      יחידה לא דיווחה (Hangul Jamo וכדומה) — המילה כולה מדווחת.
 *
 * האינווריאנט המוחלט: רשימה ריקה ⟺ text.normalize(form) === text.
 */
export function findNormalizationSpans(
  text: string,
  form: UnicodeNormalizationForm,
): readonly NormalizationSpan[] {
  if (typeof text !== 'string') {
    throw new ContentModelError('errors.unicode.INVALID_TEXT', { reason: 'not-a-string' }, 'הטקסט חייב מחרוזת');
  }
  assertForm(form);
  if (text.length === 0) return [];
  if (text.normalize(form) === text) return [];

  const spans: NormalizationSpan[] = [];

  // ── חלוקה למילים (רצפים מקסימליים שאינם רווחית) ──
  let wordStart = -1;
  const checkWord = (start: number, end: number): void => {
    const word = text.slice(start, end);
    if (word.normalize(form) === word) return;
    // פירוק ליחידות נרמול בתוך המילה
    const wordSpans: NormalizationSpan[] = [];
    let unitStart = 0;
    for (let i = 0; i < word.length; i = i + 1) {
      const cp = word.codePointAt(i) as number;
      if (!isCombiningMark(cp)) {
        if (i > unitStart) checkUnit(start, unitStart, i);
        unitStart = i;
      }
      if (cp > 0xffff) i = i + 1;
    }
    checkUnit(start, unitStart, word.length);
    if (wordSpans.length === 0) {
      // נפל בטבלת המשלימים — המילה כולה ברמת גסה (קיום מדויק, מיקום גס)
      spans.push({ form, start, end, original: word, projected: word.normalize(form) });
    } else {
      spans.push(...wordSpans);
    }

    function checkUnit(wordOffset: number, from: number, to: number): void {
      if (to <= from) return;
      const unit = text.slice(wordOffset + from, wordOffset + to);
      const projected = unit.normalize(form);
      if (projected !== unit) {
        wordSpans.push({ form, start: wordOffset + from, end: wordOffset + to, original: unit, projected });
      }
    }
  };

  for (let i = 0; i <= text.length; i = i + 1) {
    const isWs = i < text.length ? /\s/.test(text[i] as string) : true;
    if (!isWs && wordStart < 0) wordStart = i;
    if (isWs && wordStart >= 0) {
      checkWord(wordStart, i);
      wordStart = -1;
    }
  }
  return spans;
}

// ─────────────────────────── view מנורמל (ההיתר היחיד) ───────────────────────────

/**
 * פרויקציה מנורמלת מפורשת עם מיפוי offsets מלא (ADR-007 סעיף 2).
 *
 * חוזה שימוש: הפלט נועד להשוואות/חיפוש בלבד. הוא אינו נשמר, אינו חוזר
 * לצינור כמקור ואינו מזין אטומים. בפרוסה שהשתנתה, המיפוי הוא רב־לאחד:
 * כל עמדות המקור של הפרוסה ממופות לראשית ההקרנה שלה, וכל עמדות ההקרנה —
 * לראשית פרוסת המקור. ה־view עצמו מנורמל תחת הצורה (נבדק בבדיקות).
 */
export function normalizeView(text: string, form: UnicodeNormalizationForm): NormalizationView {
  if (typeof text !== 'string') {
    throw new ContentModelError('errors.unicode.INVALID_TEXT', { reason: 'not-a-string' }, 'הטקסט חייב מחרוזת');
  }
  assertForm(form);

  const spans = findNormalizationSpans(text, form);
  if (spans.length === 0) {
    const identity = Array.from({ length: text.length }, (_, i) => i);
    return {
      form, changed: false, view: text,
      viewToSource: identity, sourceToView: identity, changes: [],
    };
  }

  const sourceToView: number[] = new Array(text.length);
  const viewPieces: string[] = [];
  const viewToSource: number[] = [];
  const changes: { start: number; end: number; original: string; projected: string }[] = [];
  let viewPos = 0;
  let srcPos = 0;
  for (const span of spans) {
    // מעבר ישר עד הפרוסה
    while (srcPos < span.start) {
      viewPieces.push(text[srcPos] as string);
      viewToSource.push(srcPos);
      sourceToView[srcPos] = viewPos;
      srcPos = srcPos + 1;
      viewPos = viewPos + 1;
    }
    // הקרנת הפרוסה
    const projected = text.slice(span.start, span.end).normalize(form);
    viewPieces.push(projected);
    for (let j = 0; j < projected.length; j = j + 1) viewToSource.push(span.start);
    for (let i = span.start; i < span.end; i = i + 1) sourceToView[i] = viewPos;
    changes.push({ start: span.start, end: span.end, original: span.original, projected });
    srcPos = span.end;
    viewPos = viewPos + projected.length;
  }
  // זנב
  while (srcPos < text.length) {
    viewPieces.push(text[srcPos] as string);
    viewToSource.push(srcPos);
    sourceToView[srcPos] = viewPos;
    srcPos = srcPos + 1;
    viewPos = viewPos + 1;
  }

  const view = viewPieces.join('');
  if (viewToSource.length !== view.length) {
    throw new ContentModelError(
      'errors.unicode.MAPPING_MISMATCH',
      { expected: String(view.length), actual: String(viewToSource.length) },
      'מיפוי view↔source אינו עקבי — אורך המיפוי אינו תואם את אורך ה־view',
    );
  }
  return { form, changed: true, view, viewToSource, sourceToView, changes };
}

// ─────────────────────────── מאגר (דיווח בלבד) ───────────────────────────

/** מאגר Unicode מלא של טקסט — דיווח בלבד; שום קטגוריה אינה "מתוקנת" (ADR-007 סעיף 4). */
export function inspectUnicode(text: string): UnicodeInventory {
  if (typeof text !== 'string') {
    throw new ContentModelError('errors.unicode.INVALID_TEXT', { reason: 'not-a-string' }, 'הטקסט חייב מחרוזת');
  }

  const loneSurrogates: number[] = [];
  const controlCharacters: number[] = [];
  const bidiControls: Record<string, number> = {};
  let nikudCount = 0;
  let taamimCount = 0;
  let maqafCount = 0;
  let gershayimCount = 0;
  let emSpaceCount = 0;
  let nbspCount = 0;
  let bomCount = 0;
  let codePoints = 0;

  for (let i = 0; i < text.length; i = i + 1) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoints = codePoints + 1;
        i = i + 1;
        continue;
      }
      loneSurrogates.push(i);
      codePoints = codePoints + 1;
      continue;
    }
    if (c >= 0xdc00 && c <= 0xdfff) {
      const prev = i > 0 ? text.charCodeAt(i - 1) : 0;
      if (!(prev >= 0xd800 && prev <= 0xdbff)) loneSurrogates.push(i);
      codePoints = codePoints + 1;
      continue;
    }
    codePoints = codePoints + 1;
    // תווי בקרה: \n (10) \t (9) \r (13) הם תחביר קווי חוקי; היתר נדונים
    if ((c <= 0x1f && c !== 9 && c !== 10 && c !== 13) || c === 0x7f || (c >= 0x80 && c <= 0x9f)) {
      controlCharacters.push(i);
    }
    const bidiName = BIDI_CONTROL_NAMES[c];
    if (bidiName !== undefined) bidiControls[bidiName] = (bidiControls[bidiName] ?? 0) + 1;
    if (c >= 0x05b0 && c <= 0x05bc) nikudCount = nikudCount + 1;
    else if (c >= 0x0591 && c <= 0x05af) taamimCount = taamimCount + 1;
    else if (c === 0x05be) maqafCount = maqafCount + 1;
    else if (c === 0x05f3 || c === 0x05f4) gershayimCount = gershayimCount + 1;
    else if (c === 0x2003) emSpaceCount = emSpaceCount + 1;
    else if (c === 0x00a0) nbspCount = nbspCount + 1;
    else if (c === 0xfeff) bomCount = bomCount + 1;
  }

  const htmlEntitySpans: { start: number; end: number; text: string }[] = [];
  for (const m of text.matchAll(HTML_ENTITY_RE)) {
    const start = m.index ?? 0;
    htmlEntitySpans.push({ start, end: start + m[0].length, text: m[0] });
  }
  const htmlTagSpans: { start: number; end: number; text: string }[] = [];
  for (const m of text.matchAll(HTML_TAG_RE)) {
    const start = m.index ?? 0;
    htmlTagSpans.push({ start, end: start + m[0].length, text: m[0] });
  }

  return Object.freeze({
    policyVersion: UNICODE_POLICY_VERSION,
    form: 'inventory-v1' as const,
    lengthUtf16: text.length,
    codePoints,
    loneSurrogates: Object.freeze(loneSurrogates),
    controlCharacters: Object.freeze(controlCharacters),
    bidiControls: Object.freeze(bidiControls),
    nikudCount,
    taamimCount,
    maqafCount,
    gershayimCount,
    emSpaceCount,
    nbspCount,
    bomCount,
    htmlEntitySpans: Object.freeze(htmlEntitySpans),
    htmlTagSpans: Object.freeze(htmlTagSpans),
    nonNfcSpans: Object.freeze([...findNormalizationSpans(text, 'NFC')]),
    nfkcWouldChange: text.length > 0 && text.normalize('NFKC') !== text,
    nfdWouldChange: text.length > 0 && text.normalize('NFD') !== text,
  });
}

// ─────────────────────────── ביקורת נאמנות אטומים ───────────────────────────

/**
 * הוכחת נאמנות ברמת האטום (ADR-007 סעיף 5): כל אטום מקור (בלי origin)
 * חייב להיות שווה מילולית לפרוסת המקור הגולמי שלו; אין חצאי surrogate.
 * אטומי החדרה (עם origin) פטורים משוויון פרוסה — הם מוקרנים ממקור מפורש
 * ונספרים בספר הטרנספורמציות (שלב 21 ישלים את החשבונאות המלאה).
 * רשימה ריקה = נאמנות הוכחה. טהור — מתאים לביקורת ול־CI.
 */
export function atomFidelityIssues(raw: string, doc: TorahDocument): readonly AtomFidelityIssue[] {
  if (typeof raw !== 'string') {
    throw new ContentModelError('errors.unicode.INVALID_TEXT', { reason: 'not-a-string' }, 'המקור הגולמי חייב מחרוזת');
  }
  const issues: AtomFidelityIssue[] = [];
  const seen = new Set<string>();
  for (const block of allBlocks(doc)) {
    for (const item of block.inline) {
      if (item.kind !== 'text') continue;
      for (const atom of item.atoms) {
        if (seen.has(atom.id)) continue; // אותו אטום יכול להופיע פעם אחת בלבד — ביקורת חד־פעמית
        seen.add(atom.id);
        collectAtomIssues(atom, raw, issues);
      }
    }
  }
  return issues;
}

function collectAtomIssues(atom: TextAtom, raw: string, out: AtomFidelityIssue[]): void {
  const start = atom.source.startUtf16;
  const end = atom.source.endUtf16;
  if (start < 0 || end > raw.length || end < start) {
    out.push({
      kind: 'atom-out-of-range',
      atomId: atom.id,
      startUtf16: start,
      endUtf16: end,
      detail: `פרוסה [${start},${end}) מחוץ למקור באורך ${raw.length}`,
    });
    return;
  }
  for (let i = 0; i < atom.text.length; i = i + 1) {
    if (isLoneSurrogateAt(atom.text, i)) {
      out.push({
        kind: 'lone-surrogate-in-atom',
        atomId: atom.id,
        startUtf16: start,
        endUtf16: end,
        detail: `חצי surrogate בודד בטקסט האטום (מיקום יחסי ${i})`,
      });
      return;
    }
  }
  if (atom.origin !== undefined) return; // אטום החדרה — מקור מפורש, לא פרוסת מקור
  const slice = raw.slice(start, end);
  if (slice !== atom.text) {
    out.push({
      kind: 'atom-text-mismatch',
      atomId: atom.id,
      startUtf16: start,
      endUtf16: end,
      detail: `טקסט האטום אינו שווה לפרוסת המקור (אטום ${atom.text.length} תווים, פרוסה ${slice.length}) — נרמול או שינוי בלתי מדווח`,
    });
  }
}

// ─────────────────────────── אינווריאנטים לבדיקות ───────────────────────────

/** אינווריאנט הגילוי: רשימה ריקה ⟺ הטקסט יציב תחת הצורה. לשימוש בבדיקות בלבד. */
export function normalizationDetectionInvariantHolds(text: string, form: UnicodeNormalizationForm): boolean {
  const spans = findNormalizationSpans(text, form);
  const stable = text.length === 0 || text.normalize(form) === text;
  return spans.length === 0 === stable;
}
