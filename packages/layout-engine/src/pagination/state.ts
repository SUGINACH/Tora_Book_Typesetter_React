/**
 * state.ts — PaginationState מלא ומעברי מצב טהורים (שלב 49; פרק ז/M6).
 *
 * אסמכתא: אפיון §9.1 (מצב חיפוש העימוד — הטיפוס כמו שהוא), §9.2 (חיפוש
 * חסום ודטרמיניסטי — ה־stateHash הוא מפתח טבלת ההמרה/transposition),
 * §10.4 (סוגריים חוצי עמוד — מצב המחסנית בתוך המצב), §10.3 (הערות —
 * pendingFootnotes/pendingSidenotes נישאים בין עמודים).
 *
 * עקרונות (שער השלב: "כל candidate עמוד מסביר את המצב שממנו ואליו הגיע"):
 *   1. מצב immutable וקפוא-עומק בלבד; כל מעבר מחזיר מצב חדש + רשומת
 *      מעבר (‏PaginationTransition) שנושאת את ה־hash שממנו ואליו — שרשרת
 *      המעברים ניתנת לאימות (‏fromHash של הבא == toHash של הקודם).
 *   2. stateHash = SHA-256 של canonicalJson של כל שדות המצב (בלעדיו עצמו):
 *      סמן תוכן, עמוד פיזי, טור, נותרי אזורים, הערות ממתינות, סוגריים
 *      פתוחים, הקשר כותרות ומצב פרק — כלומר שני מצבים בעלי hash זהה
 *      כוללים גם notes, brackets ו־parity (דרישת §9.2 במפורש).
 *   3. אין state גלובלי מוסתר: אין מודול שמחזיק מצב; הכול נבנה מקלט
 *      דרך initialPaginationState ומועבר הלאה במפורש.
 *   4. דטרמיניזם מלא: אין שעון, אין אקראיות, אין זיכרון מוסתר; אותם
 *      מעברים על אותו מצב ⇐ אותו hash, תמיד.
 */
import { asLu, type LayoutUnit, canonicalJson, sha256Hex } from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';

// ─────────────────────────── סמן תוכן ───────────────────────────

/**
 * סמן תוכן — "block + fragment + line/atom boundary" (§9.1):
 * הבלוק (גוף או גוף הערה), מספר הקו בתוך הפסקה וגבול האטום בתוך הקו.
 * סדר הזרימה בין בלוקים נקבע על ידי מחולל המועמדים (שלב 52) לפי
 * allBlocks; המצב עצמו מכיל את הסמן הקנוני בלבד.
 */
export interface ContentCursor {
  readonly blockId: string;
  /** אינדקס הקו בתוך הפסקה (0-based). */
  readonly fragmentIndex: number;
  /** גבול אטום בתוך הקו (0-based; סוף קו = מספר האטומים בקו). */
  readonly atomIndex: number;
}

const CURSOR_PREFIX = 'cursor:v1|';
// הבלוקים בפרויקט מכילים '|' בעצמם (‎body|1|para‎, ‎bracket:v1|doc|…‎) — לכן
// הפענוח עוגן לסוף: שני השדות האחרונים ספרות בלבד, והבלוק הוא הקידומת
// הארוכה ביותר שנותרת. חד-משמעי כי הזנב נוקשי (‎|f{digits}|a{digits}$‎).
const CURSOR_TAIL_RE = /^(.*)\|f(\d+)\|a(\d+)$/;

/** הצורה הקנונית של הסמן: ‎cursor:v1|{blockId}|f{fragment}|a{atom}‎. */
export function formatCursor(c: ContentCursor): string {
  const issues = cursorIssues(c);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.CURSOR_INVALID', { cursor: '', issues: issues.join(';') }, 'סמן תוכן שגוי');
  }
  return `${CURSOR_PREFIX}${c.blockId}|f${c.fragmentIndex}|a${c.atomIndex}`;
}

/** פענוח הסמן הקנוני — ההיפוך המדויק של formatCursor (עוגן לסוף). */
export function parseCursor(s: string): ContentCursor {
  if (typeof s !== 'string' || !s.startsWith(CURSOR_PREFIX)) {
    throw new LayoutEngineError('errors.engine.CURSOR_INVALID', { cursor: String(s), issues: 'structure' }, 'סמן תוכן שגוי');
  }
  const m = CURSOR_TAIL_RE.exec(s.slice(CURSOR_PREFIX.length));
  if (m === null) {
    throw new LayoutEngineError('errors.engine.CURSOR_INVALID', { cursor: String(s), issues: 'structure' }, 'סמן תוכן שגוי');
  }
  const c: ContentCursor = { blockId: m[1]!, fragmentIndex: Number(m[2]), atomIndex: Number(m[3]) };
  const issues = cursorIssues(c);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.CURSOR_INVALID', { cursor: String(s), issues: issues.join(';') }, 'סמן תוכן שגוי');
  }
  return c;
}

function cursorIssues(c: unknown): string[] {
  const v = c as Record<string, unknown>;
  const issues: string[] = [];
  if (typeof v?.blockId !== 'string' || v.blockId.length === 0 || v.blockId.length > 512) issues.push('blockId');
  if (typeof v?.fragmentIndex !== 'number' || !Number.isSafeInteger(v.fragmentIndex) || v.fragmentIndex < 0) issues.push('fragmentIndex');
  if (typeof v?.atomIndex !== 'number' || !Number.isSafeInteger(v.atomIndex) || v.atomIndex < 0) issues.push('atomIndex');
  return issues;
}

/**
 * השוואת סמנים באותו בלוק: ‎-1|0|1‎ לפי (fragmentIndex, atomIndex).
 * בלוקים שונים — אין סדר אמין בתוך הסמן עצמו (סדר הזרימה חיצוני);
 * מוחזר null והקריאה באחריות מחולל המועמדים (שלב 52).
 */
export function compareCursors(a: ContentCursor, b: ContentCursor): -1 | 0 | 1 | null {
  if (a.blockId !== b.blockId) return null;
  if (a.fragmentIndex !== b.fragmentIndex) return a.fragmentIndex < b.fragmentIndex ? -1 : 1;
  if (a.atomIndex !== b.atomIndex) return a.atomIndex < b.atomIndex ? -1 : 1;
  return 0;
}

// ─────────────────────────── סוגריים ופרקים ───────────────────────────

/** זוג סוגריים פתוח בגבול העמוד (§9.1 openBracketStack; §10.4). */
export interface BracketState {
  /** ‎bracket:v1|…‎ — מזהה הזוג מעץ הסוגריים של הפרסר (שלב 19). */
  readonly pairId: string;
  readonly bracketKind: 'round' | 'square';
  /** עומק קינון כולל (1 לחיצוני ביותר). */
  readonly depth: number;
}

/** מצב פרק/חלק — היקפים ומספורים (§9.1 chapterState). */
export interface ChapterState {
  /** החלק הנוכחי (null לפני הבלוק הראשון). */
  readonly partId: string | null;
  /** סודר החלק, 1-based. */
  readonly partOrdinal: number;
  /** הסימן הנוכחי (null לפני הראשון). */
  readonly simanId: string | null;
  /** מספר הסימן מהמודל (simanNumber); null כשאין. */
  readonly simanNumber: number | null;
  /** המונה הבא למספור הערות שוליים בהיקף (§10.3 — resolved label). */
  readonly footnoteOrdinal: number;
  /** המונה הבא למספור הערות צד. */
  readonly sidenoteOrdinal: number;
  /** המונה הבא למספור הערות סיום. */
  readonly endnoteOrdinal: number;
}

/** היקף מספור הערות (§10.3: page/siman/part/continuous) — מוזרק למעברים. */
export type NoteNumberingScopeKind = 'page' | 'siman' | 'part' | 'continuous';

/** סוגי עמודות תוכן בזרימת העימוד (עמודי שער — M8; שלב 59). */
export type ContentPageKind = 'body' | 'toc' | 'notes';

// ─────────────────────────── המצב ───────────────────────────

/**
 * מצב חיפוש העימוד — §9.1 במדויק. כל השדות readonly; המצב נוצר רק
 * דרך initialPaginationState ומעברי המצב, וקפוא-עומק בכל יצירה.
 */
export interface PaginationState {
  /** סמן התוכן הקנוני (formatCursor). */
  readonly contentCursor: string;
  /** אינדקס העמוד הפיזי, 1-based, רץ בלי דילוגים. */
  readonly physicalPageIndex: number;
  readonly columnIndex: 0 | 1;
  /**
   * סוג התבנית של העמוד הנוכחי (§9.3#1 — "בוחרים Page Template לפי סוג
   * עמוד"; שלב 59 — forcePageTemplate). חלק מהמצב ומה־hash: שני מצבים
   * עם hash זהה חייבים להיות באותו סוג עמוד (body ו־toc זהים מבנית
   * אך שונים בפריסה; §9.2).
   */
  readonly pageKind: ContentPageKind;
  /** גובה נותר בכל אזור של העמוד הנוכחי, ב-LU — פר-מזהה אזור. */
  readonly remainingByRegion: Readonly<Record<string, LayoutUnit>>;
  /** הערות שוליים שהעוגן שלהן כבר בגוף אך גופן טרם הוצב (§9.3#5). */
  readonly pendingFootnotes: readonly string[];
  /** הערות צד (H7) שהעוגן שלהן בגוף אך מיקומן טרם נקבע (§9.4). */
  readonly pendingSidenotes: readonly string[];
  /** מחסנית הסוגריים הפתוחים בגבול הנוכחי (§10.4 — אין protectParens). */
  readonly openBracketStack: readonly BracketState[];
  /** הקשר הכותרות הפעילות — מזהי בלוקי heading מהחיצוני פנימה. */
  readonly activeHeadingContext: readonly string[];
  readonly chapterState: ChapterState;
  /** SHA-256 של ייצוג קנוני של כל שאר השדות — מפתח ההשוואה והטבלה. */
  readonly stateHash: string;
}

// ─────────────────────────── המעברים ───────────────────────────

/** פעולת מעבר — כל שינוי מצב עובר דרך אחת מאלה (במפורש, ברישום). */
export type PaginationAction =
  | { readonly kind: 'advance-cursor'; readonly to: ContentCursor }
  | { readonly kind: 'open-page'; readonly physicalPageIndex: number; readonly remainingByRegion: Readonly<Record<string, LayoutUnit>> }
  | { readonly kind: 'switch-column'; readonly columnIndex: 0 | 1 }
  | { readonly kind: 'consume-region'; readonly regionId: string; readonly amountLu: number }
  | { readonly kind: 'pend-footnote'; readonly noteId: string }
  | { readonly kind: 'place-footnotes'; readonly noteIds: readonly string[] }
  | { readonly kind: 'pend-sidenote'; readonly noteId: string }
  | { readonly kind: 'place-sidenotes'; readonly noteIds: readonly string[] }
  | { readonly kind: 'bracket-open'; readonly pair: BracketState }
  | { readonly kind: 'bracket-close'; readonly pairId: string }
  | { readonly kind: 'heading-enter'; readonly nodeId: string }
  | { readonly kind: 'heading-exit'; readonly nodeId: string }
  | {
    readonly kind: 'chapter-enter';
    readonly partId: string | null;
    readonly partOrdinal: number;
    readonly simanId: string | null;
    readonly simanNumber: number | null;
    readonly noteScope: NoteNumberingScopeKind;
  };

/**
 * רשומת מעבר — "ההסבר" של השער: מאיזה מצב הגיעו, לאן, באיזו פעולה
 * ובקנוניזציה אנושית-קריאה אחידה. מועמד עמוד (שלב 52) נושא רשומות
 * כאלה; השרשרת ניתנת לאימות ב־verifyTransitionChain.
 */
export interface PaginationTransition {
  readonly action: PaginationAction;
  readonly fromStateHash: string;
  readonly toStateHash: string;
  /** ייצוג קנוני אחיד לפנקס ולקורא האנושי. */
  readonly explanation: string;
}

/** תוצאת מעבר: המצב החדש + הרשומה. */
export interface PaginationStep {
  readonly state: PaginationState;
  readonly transition: PaginationTransition;
}

// ─────────────────────────── חישוב ה־hash ואימות ───────────────────────────

/** גרעין המצב ללא ה־hash — כל שדה שמבדיל מצבים חייב להופיע כאן. */
function stateCore(s: Omit<PaginationState, 'stateHash'>): unknown {
  return {
    v: 1,
    kind: 'pagination-state',
    contentCursor: s.contentCursor,
    physicalPageIndex: s.physicalPageIndex,
    columnIndex: s.columnIndex,
    pageKind: s.pageKind, // §9.2: hash זהה ⇒ אותו סוג עמוד (body≠toc גיאומטרית-זהים)
    remainingByRegion: s.remainingByRegion, // canonicalJson ממיין מפתחות — סדר הכנסה לא משנה
    pendingFootnotes: s.pendingFootnotes,
    pendingSidenotes: s.pendingSidenotes,
    openBracketStack: s.openBracketStack,
    activeHeadingContext: s.activeHeadingContext,
    chapterState: s.chapterState,
  };
}

/** hash של מצב לפי שדותיו (בלי לקרוא את השדה stateHash עצמו). */
export function stateHashOf(s: Omit<PaginationState, 'stateHash'>): string {
  return sha256Hex(canonicalJson(stateCore(s)));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function makeState(core: Omit<PaginationState, 'stateHash'>): PaginationState {
  return deepFreeze({ ...core, stateHash: stateHashOf(core) }) as PaginationState;
}

function bad(action: string, reason: string, params: Record<string, unknown>): never {
  throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action, reason, ...params }, `מעבר מצב לא חוקי (${action}): ${reason}`);
}

/** אימות מבני של ליבת מצב — רשימת בעיות (ריקה = תקין). */
export function paginationStateIssues(value: unknown): string[] {
  const issues: string[] = [];
  if (typeof value !== 'object' || value === null) return ['not-an-object'];
  const s = value as Record<string, unknown>;
  if (typeof s.contentCursor !== 'string' || s.contentCursor.length === 0) issues.push('contentCursor');
  else {
    try { parseCursor(s.contentCursor); } catch { issues.push('contentCursor:unparseable'); }
  }
  if (typeof s.physicalPageIndex !== 'number' || !Number.isSafeInteger(s.physicalPageIndex) || s.physicalPageIndex < 1) issues.push('physicalPageIndex');
  if (s.columnIndex !== 0 && s.columnIndex !== 1) issues.push('columnIndex');
  if (s.pageKind !== undefined && !['body', 'toc', 'notes'].includes(String(s.pageKind))) issues.push('pageKind');
  if (typeof s.remainingByRegion !== 'object' || s.remainingByRegion === null || Array.isArray(s.remainingByRegion)) {
    issues.push('remainingByRegion');
  } else {
    for (const [k, v] of Object.entries(s.remainingByRegion)) {
      if (k.length === 0) issues.push('remainingByRegion.key:empty');
      if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) issues.push(`remainingByRegion.${k}`);
    }
  }
  for (const field of ['pendingFootnotes', 'pendingSidenotes'] as const) {
    const arr = s[field];
    if (!Array.isArray(arr)) { issues.push(field); continue; }
    const seen = new Set<string>();
    for (const id of arr) {
      if (typeof id !== 'string' || id.length === 0 || id.length > 256 || /\s/.test(id)) { issues.push(`${field}:bad-id`); break; }
      if (seen.has(id)) { issues.push(`${field}:duplicate`); break; }
      seen.add(id);
    }
  }
  if (!Array.isArray(s.openBracketStack)) issues.push('openBracketStack');
  else {
    for (let i = 0; i < s.openBracketStack.length; i++) {
      const b = s.openBracketStack[i] as Record<string, unknown> | null;
      if (typeof b !== 'object' || b === null
        || typeof b.pairId !== 'string' || b.pairId.length === 0
        || (b.bracketKind !== 'round' && b.bracketKind !== 'square')
        || typeof b.depth !== 'number' || !Number.isSafeInteger(b.depth) || b.depth !== i + 1) {
        issues.push(`openBracketStack[${i}]`);
        break;
      }
    }
  }
  if (!Array.isArray(s.activeHeadingContext)) issues.push('activeHeadingContext');
  else {
    const seen = new Set<string>();
    for (const id of s.activeHeadingContext) {
      if (typeof id !== 'string' || id.length === 0 || seen.has(id)) { issues.push('activeHeadingContext'); break; }
      seen.add(id);
    }
  }
  const ch = s.chapterState as Record<string, unknown> | null | undefined;
  if (typeof ch !== 'object' || ch === null
    || !(ch.partId === null || (typeof ch.partId === 'string' && ch.partId.length > 0))
    || typeof ch.partOrdinal !== 'number' || !Number.isSafeInteger(ch.partOrdinal) || ch.partOrdinal < 1
    || !(ch.simanId === null || (typeof ch.simanId === 'string' && ch.simanId.length > 0))
    || !(ch.simanNumber === null || (typeof ch.simanNumber === 'number' && Number.isSafeInteger(ch.simanNumber)))
    || typeof ch.footnoteOrdinal !== 'number' || !Number.isSafeInteger(ch.footnoteOrdinal) || ch.footnoteOrdinal < 1
    || typeof ch.sidenoteOrdinal !== 'number' || !Number.isSafeInteger(ch.sidenoteOrdinal) || ch.sidenoteOrdinal < 1
    || typeof ch.endnoteOrdinal !== 'number' || !Number.isSafeInteger(ch.endnoteOrdinal) || ch.endnoteOrdinal < 1) {
    issues.push('chapterState');
  }
  return issues;
}

/** אימות שלמות ה־hash: מחשוב מחדש והשוואה — מצב שזויף נתפס כאן. */
export function verifyPaginationState(s: PaginationState): void {
  const issues = paginationStateIssues(s);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'verify', reason: issues.join(';') }, `מצב עימוד שגוי: ${issues.join(';')}`);
  }
  const expected = stateHashOf(s);
  if (expected !== s.stateHash) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'verify', reason: `stateHash-mismatch expected=${expected} actual=${s.stateHash}` }, 'stateHash אינו תואם לשדות המצב');
  }
}

// ─────────────────────────── יצירה והעתקה ───────────────────────────

/** קלט המצב ההתחלתי — הבלוק הראשון בסדר הזרימה והאזורים של העמוד הראשון. */
export interface InitialPaginationInput {
  /** מזהה הבלוק הראשון (allBlocks[0]); מסמך ריק — '@none'. */
  readonly firstBlockId: string;
  /** נותרי האזורים של העמוד הראשון (פר-מזהה אזור; נבנה בשלב 50 מתבנית). */
  readonly remainingByRegion: Readonly<Record<string, LayoutUnit>>;
  /** סוג העמודים בזרימה (ברירת מחדל body; שלב 59). */
  readonly pageKind?: ContentPageKind;
}

/** המצב ההתחלתי: עמוד 1, טור 0, סמן על תחילת הבלוק הראשון, אין הערות/סוגריים/כותרות. */
export function initialPaginationState(input: InitialPaginationInput): PaginationState {
  if (typeof input.firstBlockId !== 'string' || input.firstBlockId.length === 0 || input.firstBlockId.length > 512) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'initial', reason: `firstBlockId=${String(input.firstBlockId)}` }, 'מזהה בלוק ראשון שגוי');
  }
  const core: Omit<PaginationState, 'stateHash'> = {
    contentCursor: formatCursor({ blockId: input.firstBlockId, fragmentIndex: 0, atomIndex: 0 }),
    physicalPageIndex: 1,
    columnIndex: 0,
    pageKind: input.pageKind ?? 'body',
    remainingByRegion: { ...input.remainingByRegion },
    pendingFootnotes: [],
    pendingSidenotes: [],
    openBracketStack: [],
    activeHeadingContext: [],
    chapterState: {
      partId: null, partOrdinal: 1, simanId: null, simanNumber: null,
      footnoteOrdinal: 1, sidenoteOrdinal: 1, endnoteOrdinal: 1,
    },
  };
  return makeState(core);
}

/**
 * שכפול עותק — snapshot לחיפוש: מחזיר מצב שקול מבנית (אותו hash) בעצם
 * חדש. המצבים עצמם קפואים; ההעתקה מבטיחה שהחיפוש יכול להחזיק ולשחרר
 * צילומים בלי שיתוף מבנים פנימיים (מערכים/מפות) עם מסלולים אחרים.
 */
export function clonePaginationState(s: PaginationState): PaginationState {
  return makeState({
    contentCursor: s.contentCursor,
    physicalPageIndex: s.physicalPageIndex,
    columnIndex: s.columnIndex,
    pageKind: s.pageKind,
    remainingByRegion: { ...s.remainingByRegion },
    pendingFootnotes: [...s.pendingFootnotes],
    pendingSidenotes: [...s.pendingSidenotes],
    openBracketStack: s.openBracketStack.map((b) => ({ ...b })),
    activeHeadingContext: [...s.activeHeadingContext],
    chapterState: { ...s.chapterState },
  });
}

/**
 * שחזור מליבה — הדרך ההפוכה לחיפוש: בונה מצב משדות גולמיים (צילום
 * שנשמר) עם אימות מלא; ה־stateHash מחושב מחדש וחייב להתאים למה
 * שסופק אם סופק. כל שחזור עובר את אותו שער כמו יצירה ראשונית.
 */
export function restorePaginationState(core: Omit<PaginationState, 'stateHash'>, expectedHash?: string): PaginationState {
  const issues = paginationStateIssues(core);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'restore', reason: issues.join(';') }, `שחזור מצב עימוד נדחה: ${issues.join(';')}`);
  }
  const s = makeState(core);
  if (expectedHash !== undefined && s.stateHash !== expectedHash) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'restore', reason: `hash-mismatch expected=${expectedHash} actual=${s.stateHash}` }, 'שחזור מצב: hash אינו תואם');
  }
  return s;
}

// ─────────────────────────── ביצוע המעברים ───────────────────────────

function explain(action: PaginationAction): string {
  switch (action.kind) {
    case 'advance-cursor': return `סמן ← ${formatCursor(action.to)}`;
    case 'open-page': return `עמוד פיזי ← ${action.physicalPageIndex} (אזורים: ${Object.keys(action.remainingByRegion).sort().join(',')})`;
    case 'switch-column': return `טור ← ${action.columnIndex}`;
    case 'consume-region': return `אזור ${action.regionId} נצרך ${action.amountLu} LU`;
    case 'pend-footnote': return `הערת שוליים ממתינה: ${action.noteId}`;
    case 'place-footnotes': return `הערות שוליים הוצבו: ${action.noteIds.join(',')}`;
    case 'pend-sidenote': return `הערת צד ממתינה: ${action.noteId}`;
    case 'place-sidenotes': return `הערות צד הוצבו: ${action.noteIds.join(',')}`;
    case 'bracket-open': return `סוגריים נפתחו: ${action.pair.pairId}`;
    case 'bracket-close': return `סוגריים נסגרו: ${action.pairId}`;
    case 'heading-enter': return `הקשר כותרת + ${action.nodeId}`;
    case 'heading-exit': return `הקשר כותרת − ${action.nodeId}`;
    case 'chapter-enter': return `פרק: part=${action.partId ?? '—'} siman=${action.simanId ?? '—'} (scope=${action.noteScope})`;
  }
}

function step(from: PaginationState, action: PaginationAction, core: Omit<PaginationState, 'stateHash'>): PaginationStep {
  const state = makeState(core);
  return {
    state,
    transition: {
      action,
      fromStateHash: from.stateHash,
      toStateHash: state.stateHash,
      explanation: explain(action),
    },
  };
}

/** קידום הסמן — מונוטוני בתוך בלוק (fragment, atom); בלוק חדש באחריות הקריאה החוצה. */
export function advanceCursor(s: PaginationState, to: ContentCursor): PaginationStep {
  const cur = parseCursor(s.contentCursor);
  if (to.blockId === cur.blockId) {
    const cmp = compareCursors(cur, to);
    if (cmp !== null && cmp >= 0) bad('advance-cursor', 'סמן אינו מתקדם (חייב גדול מהקודם באותו בלוק)', { to: formatCursor(to), from: s.contentCursor });
  }
  return step(s, { kind: 'advance-cursor', to }, { ...s, contentCursor: formatCursor(to) });
}

/**
 * פתיחת עמוד חדש: האינדקס הפיזי ממשיך בלי דילוגים (חייב בדיוק +1),
 * הטור חוזר ל־0, ונותרי האזורים הם של התבנית החדשה (נבנית בשלב 50).
 * הערות ממתינות, סוגריים והקשר כותרות נישאים כמו שהם — זו התלות
 * בין עמודים (§9.1: "מצב הפתיחה והסגירה נשמר בין אזורים").
 */
export function openPage(
  s: PaginationState,
  remainingByRegion: Readonly<Record<string, LayoutUnit>>,
  pageKind: ContentPageKind = s.pageKind,
): PaginationStep {
  const physicalPageIndex = s.physicalPageIndex + 1;
  return step(s, { kind: 'open-page', physicalPageIndex, remainingByRegion: { ...remainingByRegion } }, {
    ...s,
    physicalPageIndex,
    columnIndex: 0,
    pageKind,
    remainingByRegion: { ...remainingByRegion },
  });
}

/** מעבר טור באותו עמוד — 0↔1 בלבד (אותו עמוד). */
export function switchColumn(s: PaginationState, columnIndex: 0 | 1): PaginationStep {
  if (columnIndex === s.columnIndex) bad('switch-column', 'מעבר לאותו טור', { columnIndex });
  return step(s, { kind: 'switch-column', columnIndex }, { ...s, columnIndex });
}

/** צריכת גובה מאזור — חייבת להישאר בגבולות (אין גלישה שקטה של אזור). */
export function consumeRegion(s: PaginationState, regionId: string, amountLu: number): PaginationStep {
  if (typeof regionId !== 'string' || regionId.length === 0) bad('consume-region', 'מזהה אזור ריק', { regionId });
  if (!Number.isSafeInteger(amountLu) || amountLu <= 0) bad('consume-region', 'כמות חייבת שלם חיובי', { amountLu });
  const remaining = s.remainingByRegion[regionId];
  if (remaining === undefined) bad('consume-region', 'אזור לא קיים בעמוד הנוכחי', { regionId, known: Object.keys(s.remainingByRegion).sort().join(',') });
  if (amountLu > remaining) bad('consume-region', 'צריכה מעבר לנותר באזור', { regionId, amountLu, remaining });
  const next: Record<string, LayoutUnit> = { ...s.remainingByRegion, [regionId]: asLu(remaining - amountLu) };
  return step(s, { kind: 'consume-region', regionId, amountLu }, { ...s, remainingByRegion: next });
}

/** הערת שוליים שהעוגן שלה הוצב בגוף — נכנסת לתור ההמתנה (FIFO; §9.3#5). */
export function pendFootnote(s: PaginationState, noteId: string): PaginationStep {
  if (typeof noteId !== 'string' || noteId.length === 0) bad('pend-footnote', 'מזהה הערה ריק', { noteId });
  if (s.pendingFootnotes.includes(noteId)) bad('pend-footnote', 'הערה כבר ממתינה', { noteId });
  return step(s, { kind: 'pend-footnote', noteId }, { ...s, pendingFootnotes: [...s.pendingFootnotes, noteId] });
}

/** הצבת הערות שוליים (הסרה מהתור) — חייבות להיות בתור; הסדר נשמר. */
export function placeFootnotes(s: PaginationState, noteIds: readonly string[]): PaginationStep {
  if (noteIds.length === 0) bad('place-footnotes', 'רשימה ריקה', {});
  const pending = new Set(s.pendingFootnotes);
  for (const id of noteIds) {
    if (!pending.has(id)) bad('place-footnotes', 'הערה אינה בתור ההמתנה', { noteId: id, pending: s.pendingFootnotes.join(',') });
  }
  const removed = new Set(noteIds);
  const next = s.pendingFootnotes.filter((id) => !removed.has(id));
  return step(s, { kind: 'place-footnotes', noteIds: [...noteIds] }, { ...s, pendingFootnotes: next });
}

/** הערת צד (H7) שהעוגן שלה הוצב — נכנסת לתור (§9.4). */
export function pendSidenote(s: PaginationState, noteId: string): PaginationStep {
  if (typeof noteId !== 'string' || noteId.length === 0) bad('pend-sidenote', 'מזהה הערה ריק', { noteId });
  if (s.pendingSidenotes.includes(noteId)) bad('pend-sidenote', 'הערה כבר ממתינה', { noteId });
  return step(s, { kind: 'pend-sidenote', noteId }, { ...s, pendingSidenotes: [...s.pendingSidenotes, noteId] });
}

/** הצבת הערות צד — הסרה מהתור. */
export function placeSidenotes(s: PaginationState, noteIds: readonly string[]): PaginationStep {
  if (noteIds.length === 0) bad('place-sidenotes', 'רשימה ריקה', {});
  const pending = new Set(s.pendingSidenotes);
  for (const id of noteIds) {
    if (!pending.has(id)) bad('place-sidenotes', 'הערה אינה בתור ההמתנה', { noteId: id, pending: s.pendingSidenotes.join(',') });
  }
  const removed = new Set(noteIds);
  const next = s.pendingSidenotes.filter((id) => !removed.has(id));
  return step(s, { kind: 'place-sidenotes', noteIds: [...noteIds] }, { ...s, pendingSidenotes: next });
}

/** פתיחת זוג סוגריים — העומק נגזר מהמחסנית; כפילות אסורה (§10.4). */
export function bracketOpen(s: PaginationState, pairId: string, bracketKind: 'round' | 'square'): PaginationStep {
  if (typeof pairId !== 'string' || pairId.length === 0) bad('bracket-open', 'מזהה זוג ריק', { pairId });
  if (s.openBracketStack.some((b) => b.pairId === pairId)) bad('bracket-open', 'זוג כבר פתוח', { pairId });
  const pair: BracketState = { pairId, bracketKind, depth: s.openBracketStack.length + 1 };
  return step(s, { kind: 'bracket-open', pair }, { ...s, openBracketStack: [...s.openBracketStack, pair] });
}

/** סגירת זוג — LIFO בלבד: רק הזוג העליון נסגר (מחסנית אמיתית). */
export function bracketClose(s: PaginationState, pairId: string): PaginationStep {
  const top = s.openBracketStack[s.openBracketStack.length - 1];
  if (top === undefined || top.pairId !== pairId) {
    bad('bracket-close', 'סגירה שאינה הזוג העליון', { pairId, top: top?.pairId ?? '—' });
  }
  return step(s, { kind: 'bracket-close', pairId }, { ...s, openBracketStack: s.openBracketStack.slice(0, -1) });
}

/** כניסה להקשר כותרת — push; כפילות אסורה. */
export function headingEnter(s: PaginationState, nodeId: string): PaginationStep {
  if (typeof nodeId !== 'string' || nodeId.length === 0) bad('heading-enter', 'מזהה כותרת ריק', { nodeId });
  if (s.activeHeadingContext.includes(nodeId)) bad('heading-enter', 'כותרת כבר בהקשר', { nodeId });
  return step(s, { kind: 'heading-enter', nodeId }, { ...s, activeHeadingContext: [...s.activeHeadingContext, nodeId] });
}

/** יציאה מהקשר כותרת — מסירה את הכותרת וכל מה שנפתח אחריה (קינון). */
export function headingExit(s: PaginationState, nodeId: string): PaginationStep {
  const idx = s.activeHeadingContext.indexOf(nodeId);
  if (idx < 0) bad('heading-exit', 'כותרת אינה בהקשר', { nodeId, context: s.activeHeadingContext.join(',') });
  return step(s, { kind: 'heading-exit', nodeId }, { ...s, activeHeadingContext: s.activeHeadingContext.slice(0, idx) });
}

/**
 * כניסת פרק/סימן — מעדכנת היקפים ומספורים: המונים של הערות מתאפסים
 * לפי ההיקף (‏siman/part מאפסים; continuous לא; page נספר מחדש לכל
 * עמוד על ידי מחולל המועמדים — שלב 52 — ולא כאן) ומספרי החלק/סימן
 * מתעדכנים. כניסה כפולה לאותו סימן נדחית.
 */
export function chapterEnter(
  s: PaginationState,
  scope: {
    readonly partId: string | null;
    readonly partOrdinal: number;
    readonly simanId: string | null;
    readonly simanNumber: number | null;
    readonly noteScope: NoteNumberingScopeKind;
  },
): PaginationStep {
  if (scope.partOrdinal === s.chapterState.partOrdinal && scope.partId === s.chapterState.partId
    && scope.simanId === s.chapterState.simanId) {
    bad('chapter-enter', 'כניסה כפולה לאותו סימן', { simanId: scope.simanId ?? '—' });
  }
  const reset = scope.noteScope === 'siman' || scope.noteScope === 'part';
  return step(s, { kind: 'chapter-enter', ...scope }, {
    ...s,
    chapterState: {
      partId: scope.partId,
      partOrdinal: scope.partOrdinal,
      simanId: scope.simanId,
      simanNumber: scope.simanNumber,
      footnoteOrdinal: reset ? 1 : s.chapterState.footnoteOrdinal,
      sidenoteOrdinal: reset ? 1 : s.chapterState.sidenoteOrdinal,
      endnoteOrdinal: s.chapterState.endnoteOrdinal,
    },
  });
}

// ─────────────────────────── שרשרת המעברים ───────────────────────────

/**
 * אימות שרשרת מעברים — שער השלב: כל מועמד/מסלול עמוד שנבנה מהמצבים
 * האלה חייב לעבור כאן. נבדק: לכל מעבר from==prev.to (מתחיל במצב
 * ההתחלתי) וה־to בפורמט hash תקין. מחזיר את ה־hash הסופי של השרשרת.
 */
export function verifyTransitionChain(initial: PaginationState, transitions: readonly PaginationTransition[]): string {
  let currentHash = initial.stateHash;
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i]!;
    if (t.fromStateHash !== currentHash) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'chain', reason: `index=${i} expected=${currentHash} actual=${t.fromStateHash}` }, `שרשרת מעברים נותקה באינדקס ${i}`);
    }
    if (!/^[0-9a-f]{64}$/.test(t.toStateHash)) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'chain', reason: `index=${i} bad-to-hash` }, `hash יעד שגוי באינדקס ${i}`);
    }
    currentHash = t.toStateHash;
  }
  return currentHash;
}
