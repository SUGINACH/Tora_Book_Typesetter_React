/**
 * parse.ts — פורט הפרסר הישן בשלמות אל מודל התוכן החדש (שלב 17).
 *
 * אסמכתא: אפיון §3.3 (שימור צנרת הפרסר) · §6.2 (אין sentinel, provenance,
 * אטומים עם פרוסות מדויקות) · §7 (Parse + source map) · תכנית שלב 17 ·
 * מרשם המזהים: docs/migration/identifiers.json (התחביר נצרך ממנו).
 *
 * עקרונות:
 *   1. סדר הצינור הישן נשמר במדויק: metadata ← editorial ← sidenote(H7) ←
 *      endnote ← footnote(מחובר) ← custom-linePrefix ← heading ← AST — אבל
 *      בלי הרס: מרחב קואורדינטות UTF-16 אחד של המקור הגולמי לכל אורך הדרך.
 *   2. אין sentinel: הפניית הערה = InlineItem מפורש; הסרת הערת עורך נרשמת
 *      כ־suppress בספר הטרנספורמציות ותוכנה נשמר בזרם editorial.
 *   3. חשבונאות מלאה: כל תו מסווג — אטום, ערך metadata, syntax או
 *      explicit-break; רווחית לא מכוסה = פער; תו לא מכוסה = כשל (ההוכחה
 *      בתוצאה, coverage.ok).
 *   4. טהור ודטרמיניסטי — אין רשת/DOM/אקראיות/זמן; אותו קלט ← אותה תוצאה.
 */

import { ContentModelError } from '../errors.js';
import { makeSourceSpan, isValidIdValue, makeAnchorId } from '../spans.js';
import type { AtomId, ContentStream, SourceSpan } from '../spans.js';
import { makeTextAtom } from '../atoms.js';
import type { BreakBefore, TextAtom, TransformRecord } from '../atoms.js';
import { makeTextItem, makeNoteReference, makeInlineBox, makeExplicitBreak } from '../inline.js';
import type { InlineItem } from '../inline.js';
import { makeContentBlock, deriveNodeId, deriveAnchorId } from '../blocks.js';
import type { ContentBlock, HeadingLevel } from '../blocks.js';
import { makeTorahDocument } from '../document.js';
import type { MetadataEntry, NoteEntry, Part, Siman, TorahDocument } from '../document.js';
import { scanBrackets } from '../brackets.js';
import type { BracketScanResult } from '../brackets.js';
import { IDENTIFIER_RECORDS } from './registry-data.js';

// ─────────────────────────── הציבורי ───────────────────────────

export type CustomStyleMatcher =
  | { readonly type: 'linePrefix'; readonly prefix: string }
  | { readonly type: 'inlineMarker'; readonly open: string; readonly close: string };

export interface CustomStyleGrammar {
  readonly id: string;
  readonly enabled: boolean;
  readonly matcher: CustomStyleMatcher;
}

export interface ParserOptions {
  readonly documentId: string;
  readonly sourceHash?: string;
  readonly endnotePrefix?: string;
  readonly footnoteDelimiters?: readonly [string, string];
  readonly customStyles?: readonly CustomStyleGrammar[];
}

export interface SyntaxSpan {
  readonly recordId: string;
  readonly start: number;
  readonly end: number;
  readonly detail?: string;
}

export type DiagnosticSeverity = 'error' | 'warning';

export interface ParserDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly start?: number;
  readonly end?: number;
}

export interface CoverageProof {
  readonly sourceLength: number;
  readonly atomChars: number;
  readonly syntaxChars: number;
  readonly metadataChars: number;
  readonly breakChars: number;
  readonly gaps: readonly { readonly start: number; readonly end: number; readonly nonWhitespace: boolean }[];
  readonly overlaps: readonly { readonly start: number; readonly end: number; readonly first: string; readonly second: string }[];
  readonly ok: boolean;
}

export interface ParseResult {
  readonly doc: TorahDocument;
  readonly syntax: readonly SyntaxSpan[];
  readonly transforms: readonly TransformRecord[];
  readonly diagnostics: readonly ParserDiagnostic[];
  readonly coverage: CoverageProof;
  /** עץ הסוגריים — גוף + הערות; מבני, מסופק לפני העימוד (שלב 19, §10.4). */
  readonly brackets: BracketScanResult;
}

// ─────────────────────────── המרשם — מקור התחביר היחיד ───────────────────────────

function recordOf(recordId: string) {
  const found = IDENTIFIER_RECORDS.find((r) => r.recordId === recordId);
  if (found === undefined) {
    throw new ContentModelError('errors.parser.REGISTRY_RECORD_MISSING', { recordId }, `רשומת מרשם חסרה: ${recordId}`);
  }
  return found;
}

const HEADING_RE = new RegExp(String(recordOf('heading-line').syntax.pattern), 'd');
const HEADING_LAX_RE = new RegExp(String(recordOf('heading-line').syntax.laxPattern ?? ''), 'd');
const FIRST_HEADING_RE = new RegExp(String(recordOf('metadata-block').syntax.firstHeadingDetector), '');
const EDITORIAL_SOURCE = String(recordOf('editorial-notes').syntax.pattern);
const METADATA_RES: readonly { key: string; re: RegExp }[] = Object.freeze(
  IDENTIFIER_RECORDS
    .filter((r) => r.recordId.startsWith('metadata-key:'))
    .map((r) => ({ key: r.recordId.slice('metadata-key:'.length), re: new RegExp(String(r.syntax.pattern), 'i') })),
);
const DEFAULT_ENDNOTE_PREFIX = String(recordOf('endnote-prefix').syntax.prefix);
const DEFAULT_FN_OPEN = String(recordOf('footnote-brackets').syntax.open);
const DEFAULT_FN_CLOSE = String(recordOf('footnote-brackets').syntax.close);

const SENTINEL_ONE = String.fromCharCode(1);
const SENTINEL_TWO = String.fromCharCode(2);
const SENTINEL_RE = new RegExp(`[${SENTINEL_ONE}${SENTINEL_TWO}]`);
const HTML_TAG_RE = /<[A-Za-z/!][^>\n]*>/;
const ORIGIN_PARAGRAPH_JOIN = 'parser:paragraph-join';
const PLACEHOLDER = SENTINEL_TWO; // ממלא מקום תווי-sentinel של הישן בזמן התאמת תחביר בלבד

type RawRange = { start: number; end: number };

// ─────────────────────────── מצב שורה ───────────────────────────

interface LineInfo {
  readonly index: number;
  readonly start: number;
  readonly end: number; // בלי ה־\n
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly hasNewline: boolean;
}

interface Removal {
  start: number;
  end: number;
  placeholder: boolean;
}

class LineState {
  removals: Removal[] = [];
  constructor(readonly info: LineInfo, private readonly raw: string) {}

  remove(start: number, end: number, placeholder = false): void {
    if (end <= start) return;
    this.removals.push({ start, end, placeholder });
    this.removals.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  /** הטקסט ששרד (מקוצץ קצוות אחרי ההצאות — כמו ‎.trim()‎ של הישן), בלי placeholders. */
  cleanedRaw(): { text: string; map: number[] } {
    return this.build(false);
  }

  /** כמו cleanedRaw אבל במקום טווח שהוצא כהערת שוליים מוצב תו placeholder — לצורך התאמת תחביר בלבד (כמו ה-sentinel הישן). */
  cleanedForMatch(): { text: string; map: number[] } {
    return this.build(true);
  }

  private build(withPlaceholders: boolean): { text: string; map: number[] } {
    const { contentStart, contentEnd } = this.info;
    const pieces: string[] = [];
    const map: number[] = [];
    let pos = contentStart;
    const active = this.removals.filter((r) => r.end > contentStart && r.start < contentEnd);
    for (const r of active) {
      const from = Math.max(r.start, contentStart);
      const to = Math.min(r.end, contentEnd);
      if (to <= from) continue;
      if (from > pos) {
        pieces.push(this.raw.slice(pos, from));
        for (let i = pos; i < from; i = i + 1) map.push(i);
      }
      if (withPlaceholders && r.placeholder) {
        pieces.push(PLACEHOLDER);
        map.push(r.start);
      }
      pos = Math.max(pos, to);
    }
    if (contentEnd > pos) {
      pieces.push(this.raw.slice(pos, contentEnd));
      for (let i = pos; i < contentEnd; i = i + 1) map.push(i);
    }
    let text = pieces.join('');
    let m = [...map];
    // קיצוץ קצוות אחרי ההצאות — כמו ‎line.replace(...).trim()‎ בישן
    let lead = 0;
    while (lead < text.length && isWs(text[lead] as string)) lead = lead + 1;
    let trail = 0;
    while (trail < text.length - lead && isWs(text[text.length - 1 - trail] as string)) trail = trail + 1;
    if (lead > 0 || trail > 0) {
      text = text.slice(lead, text.length - trail);
      m = m.slice(lead, m.length - trail);
    }
    return { text, map: m };
  }

  /** הטווחים הגולמיים ששרדו בשורה (בלי placeholders). */
  surviving(): readonly RawRange[] {
    const out: RawRange[] = [];
    const { contentStart, contentEnd } = this.info;
    let pos = contentStart;
    for (const r of this.removals) {
      if (r.end <= contentStart || r.start >= contentEnd) continue;
      if (r.start > pos) out.push({ start: pos, end: Math.min(r.start, contentEnd) });
      pos = Math.max(pos, r.end);
    }
    if (pos < contentEnd) out.push({ start: pos, end: contentEnd });
    return out.filter((r) => r.end > r.start);
  }
}

function isWs(ch: string): boolean {
  return /\s/.test(ch); // בדיוק כמו trim הישן — כל רווחית Unicode (כולל em-space U+2003 שבקורפוס)
}

/** חיתוך טווחים לתוך [start, end) — לכידת התוכן שנותר בטרם הוצאת הסמן/הקידומת. */
function rangesWithin(ranges: readonly RawRange[], start: number, end: number): RawRange[] {
  const out: RawRange[] = [];
  for (const r of ranges) {
    const s = Math.max(r.start, start);
    const e = Math.min(r.end, end);
    if (e > s) out.push({ start: s, end: e });
  }
  return out;
}

// ─────────────────────────── טיפוסי ביניים ───────────────────────────

type RefStream = 'footnote' | 'endnote' | 'sidenote';

type Segment =
  | { kind: 'text'; ranges: readonly RawRange[] }
  | { kind: 'join'; at: number }
  | RefSegment
  | BoxSegment;

type RefSegment = { kind: 'ref'; noteId: string; stream: RefStream; start: number; end: number };
type BoxSegment = { kind: 'box'; styleId: string; start: number; end: number };
type ItemSegment = RefSegment | BoxSegment;

interface DraftBlock {
  role: 'body' | 'heading' | 'custom';
  headingLevel?: HeadingLevel;
  styleId?: string;
  source: RawRange;
  segments: Segment[];
  simanNumber?: number;
  subNumber?: number;
  isSidenoteMarker?: boolean;
  childrenDrafts?: DraftBlock[];
}

interface DraftNote {
  kind: 'footnote' | 'endnote' | 'sidenote' | 'editorial';
  noteId: string;
  anchor?: RawRange;
  body: DraftBlock;
}

// ─────────────────────────── הפרסר ───────────────────────────

export function parseSourceText(raw: string, options: ParserOptions): ParseResult {
  if (typeof raw !== 'string') {
    throw new ContentModelError('errors.parser.INVALID_OPTIONS', { reason: 'raw:not-a-string' }, 'המקור חייב מחרוזת');
  }
  if (options === null || typeof options !== 'object' || !isValidIdValue(options.documentId ?? '')) {
    throw new ContentModelError('errors.parser.INVALID_OPTIONS', { reason: 'documentId' }, 'documentId חובה — מחרוזת זהות חוקית');
  }
  const documentId = options.documentId;
  const diagnostics: ParserDiagnostic[] = [];
  const syntax: SyntaxSpan[] = [];
  const transforms: TransformRecord[] = [];
  const spanOf = (stream: ContentStream, start: number, end: number): SourceSpan => makeSourceSpan(documentId, stream, start, end);

  prevalidate(raw);

  // ── אינדקס שורות ──
  const lineInfos: LineInfo[] = [];
  {
    let lineStart = 0;
    for (let i = 0; i <= raw.length; i = i + 1) {
      if (i === raw.length || raw.charCodeAt(i) === 0x0a) {
        let cs = lineStart;
        let ce = i;
        while (cs < ce && isWs(raw[cs] as string)) cs = cs + 1;
        while (ce > cs && isWs(raw[ce - 1] as string)) ce = ce - 1;
        lineInfos.push({ index: lineInfos.length, start: lineStart, end: i, contentStart: cs, contentEnd: ce, hasNewline: i < raw.length });
        lineStart = i + 1;
      }
    }
  }
  const states = lineInfos.map((info) => new LineState(info, raw));
  const consumed: (null | 'metadata' | 'sidenote' | 'endnote' | 'custom' | 'heading')[] = lineInfos.map(() => null);

  // ── שלב 1: metadata (לפני הכותרת הראשונה בלבד; לפני הערות העורך — כמו בישן) ──
  const metadata: MetadataEntry[] = [];
  {
    let firstHeadingIdx = -1;
    for (const info of lineInfos) {
      if (FIRST_HEADING_RE.test(raw.slice(info.contentStart, info.contentEnd))) { firstHeadingIdx = info.index; break; }
    }
    const limit = firstHeadingIdx === -1 ? lineInfos.length : firstHeadingIdx;
    const seenKeys = new Set<string>();
    for (let i = 0; i < limit; i = i + 1) {
      const info = lineInfos[i] as LineInfo;
      const trimmed = raw.slice(info.contentStart, info.contentEnd);
      if (trimmed.length === 0) continue;
      let key: string | null = null;
      let value = '';
      for (const mk of METADATA_RES) {
        const m = mk.re.exec(trimmed);
        if (m !== null) { key = mk.key; value = (m[1] ?? '').trim(); break; }
      }
      if (key === null) {
        diagnostics.push({
          severity: 'warning',
          code: 'errors.parser.WARN_PRE_HEADING_CONTENT',
          message: 'שורה לפני הכותרת הראשונה שאינה metadata נשמרת כתוכן (הישן השמיט אותה בשקט — כאן אין אטום אבוד)',
          start: info.contentStart,
          end: info.contentEnd,
        });
        continue;
      }
      if (seenKeys.has(key)) {
        throw new ContentModelError('errors.parser.DUPLICATE_METADATA_KEY', { key, startUtf16: String(info.contentStart) }, `מפתח metadata כפול: ${key}`);
      }
      seenKeys.add(key);
      const valueEnd = info.contentEnd;
      const valueStart = valueEnd - value.length;
      metadata.push({ key, value, source: spanOf('metadata', valueStart, valueEnd) });
      syntax.push({ recordId: `metadata-key:${key}`, start: info.contentStart, end: valueStart, detail: 'key+delimiter' });
      consumed[info.index] = 'metadata';
    }
  }

  // ── שלב 2: הערות עורך (קדם-מעבר על תוכן כל שורה שנותרה) ──
  const editorialDrafts: DraftNote[] = [];
  for (const st of states) {
    if (consumed[st.info.index] !== null) continue;
    const lineText = raw.slice(st.info.start, st.info.end);
    if (!lineText.includes('##')) continue;
    const re = new RegExp(EDITORIAL_SOURCE, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(lineText)) !== null) {
      const fullStart = st.info.start + m.index;
      const contentStart = fullStart + 2;
      const contentEnd = fullStart + m[0].length - 2;
      syntax.push({ recordId: 'editorial-notes', start: fullStart, end: contentStart, detail: 'open' });
      syntax.push({ recordId: 'editorial-notes', start: contentEnd, end: contentEnd + 2, detail: 'close' });
      const noteId = `ed-${editorialDrafts.length + 1}`;
      editorialDrafts.push({
        kind: 'editorial',
        noteId,
        body: {
          role: 'body',
          source: { start: contentStart, end: contentEnd },
          segments: [{ kind: 'text', ranges: [{ start: contentStart, end: contentEnd }] }],
        },
      });
      st.remove(fullStart, contentEnd + 2, false);
      diagnostics.push({
        severity: 'warning',
        code: 'errors.parser.WARN_EDITORIAL_REMOVED',
        message: `הערת עורך הוסרה מהגוף ונשמרה בזרם editorial (${noteId}); ההסרה נרשמה בספר הטרנספורמציות`,
        start: fullStart,
        end: contentEnd + 2,
      });
    }
    if (st.cleanedRaw().text.includes('##')) {
      diagnostics.push({
        severity: 'warning',
        code: 'errors.parser.WARN_UNMATCHED_EDITORIAL',
        message: '## שלא נסגר — נשאר טקסט מילולי (כמו בישן), בתוספת דיווח ממוקם',
        start: st.info.contentStart,
        end: st.info.contentEnd,
      });
    }
  }

  // ── שלב 3: הערות צד (H7) ──
  const sidenoteDrafts: DraftNote[] = [];
  const sidenoteRefByLine = new Map<number, { noteId: string; start: number; end: number }>();
  for (const st of states) {
    if (consumed[st.info.index] !== null) continue;
    const cleaned = st.cleanedRaw();
    if (!cleaned.text.startsWith('כותרת')) continue;
    const hm = matchHeading(cleaned.text);
    if (hm === null) continue;
    if (hm.level !== 7) continue;
    if (hm.simanNumber !== undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'errors.parser.WARN_H7_SIMAN_DISCARDED',
        message: `מספר הסימן (${hm.simanNumber}) על כותרת 7 נזנח — כמו בישן (ParsedSidenote בלי מספר)`,
        start: st.info.contentStart,
        end: st.info.contentEnd,
      });
    }
    const textStartRaw = cleaned.map[hm.textIdx] ?? st.info.contentEnd;
    const textEndRaw = st.info.contentEnd;
    const noteId = `sn-${sidenoteDrafts.length + 1}`;
    syntax.push({ recordId: 'sidenote-h7', start: st.info.contentStart, end: textStartRaw, detail: 'marker' });
    sidenoteDrafts.push({
      kind: 'sidenote',
      noteId,
      anchor: { start: textStartRaw, end: textEndRaw },
      body: {
        role: 'body',
        source: { start: textStartRaw, end: textEndRaw },
        segments: [{ kind: 'text', ranges: rangesWithin(st.surviving(), textStartRaw, textEndRaw) }],
      },
    });
    sidenoteRefByLine.set(st.info.index, { noteId, start: textStartRaw, end: textEndRaw });
    consumed[st.info.index] = 'sidenote';
    st.remove(st.info.contentStart, textEndRaw, false); // הסמן והטקסט יצאו מהגוף; הטקסט חי בזרם הצד
  }

  // ── שלב 4: הערות סיום ──
  const endnotePrefix = options.endnotePrefix ?? DEFAULT_ENDNOTE_PREFIX;
  if (typeof endnotePrefix !== 'string' || endnotePrefix.trim().length === 0) {
    throw new ContentModelError('errors.parser.INVALID_ENDNOTE_PREFIX', { prefix: String(endnotePrefix) }, 'קידומת הערות סיום חייבת מחרוזת לא ריקה');
  }
  const endnoteDrafts: DraftNote[] = [];
  const endnoteRefByLine = new Map<number, { noteId: string; start: number; end: number }>();
  for (const st of states) {
    if (consumed[st.info.index] !== null) continue;
    const cleaned = st.cleanedRaw();
    if (cleaned.text.length === 0 || !cleaned.text.startsWith(endnotePrefix)) continue;
    const afterPrefix = cleaned.text.slice(endnotePrefix.length);
    const leadWs = afterPrefix.length - afterPrefix.trimStart().length;
    const contentIdx = endnotePrefix.length + leadWs;
    const contentStartRaw = cleaned.map[contentIdx] ?? st.info.contentStart;
    const contentEndRaw = st.info.contentEnd;
    const noteId = `en-${endnoteDrafts.length + 1}`;
    syntax.push({ recordId: 'endnote-prefix', start: st.info.contentStart, end: contentStartRaw, detail: 'prefix+trim' });
    endnoteDrafts.push({
      kind: 'endnote',
      noteId,
      anchor: { start: contentStartRaw, end: contentEndRaw },
      body: {
        role: 'body',
        source: { start: contentStartRaw, end: contentEndRaw },
        segments: [{ kind: 'text', ranges: rangesWithin(st.surviving(), contentStartRaw, contentEndRaw) }],
      },
    });
    endnoteRefByLine.set(st.info.index, { noteId, start: contentStartRaw, end: contentEndRaw });
    consumed[st.info.index] = 'endnote';
    st.remove(st.info.contentStart, contentEndRaw, false); // הפניה נשארת בזרימת הפסקה, התוכן יצא לזרם ההערה
  }

  // ── שלב 5: הערות שוליים — על הטקסט המחובר של השורות שנותרו (כמו join('\n') הישן) ──
  const fnOpen = options.footnoteDelimiters?.[0] ?? DEFAULT_FN_OPEN;
  const fnClose = options.footnoteDelimiters?.[1] ?? DEFAULT_FN_CLOSE;
  if (typeof fnOpen !== 'string' || fnOpen.length === 0 || typeof fnClose !== 'string' || fnClose.length === 0) {
    throw new ContentModelError('errors.parser.INVALID_OPTIONS', { reason: 'footnoteDelimiters' }, 'תוחמי הערות שוליים חייבים מחרוזות לא ריקות');
  }
  const footnoteDrafts: DraftNote[] = [];
  const fnRefByLine = new Map<number, { noteId: string; start: number; end: number }[]>();
  const swallowedNewlines = new Set<number>(); // \n שנבלעו בתוכן הערה חוצת שורות — לא מפרידים פסקאות ולא מצטרפים ברווח (כמו בישן)
  const swallowedLines = new Set<number>(); // שורות שנבלעו כולן בתוכן הערה
  {
    const pieces: string[] = [];
    const map: { raw: number; lineIndex: number; isJoin: boolean }[] = [];
    let lastSurviving: LineState | null = null;
    for (const st of states) {
      if (consumed[st.info.index] !== null) continue;
      const cleaned = st.cleanedRaw();
      if (lastSurviving !== null) {
        pieces.push('\n');
        map.push({ raw: -1, lineIndex: -1, isJoin: true });
      }
      for (let i = 0; i < cleaned.map.length; i = i + 1) {
        map.push({ raw: cleaned.map[i] as number, lineIndex: st.info.index, isJoin: false });
      }
      pieces.push(cleaned.text);
      lastSurviving = st;
    }
    const joined = pieces.join('');
    const rawAt = (idx: number): number => {
      const e = map[idx];
      if (e === undefined) return raw.length;
      return e.isJoin ? -1 : e.raw;
    };
    let pos = 0;
    let scanning = true;
    while (scanning && pos < joined.length) {
      const openIdx = joined.indexOf(fnOpen, pos);
      if (openIdx === -1) break;
      const closeIdx = findMatchingClose(joined, openIdx, fnOpen, fnClose);
      if (closeIdx === -1) {
        // כמו בישן: תוחם פתוח עוצר את הסריקה כולה — השאר מילולי
        const at = rawAt(openIdx);
        diagnostics.push({
          severity: 'warning',
          code: 'errors.parser.WARN_UNMATCHED_FOOTNOTE',
          message: 'תוחם הערת שוליים פתוח שלא נסגר — הטקסט מהנקודה הזאת נשאר מילולי (כמו בישן)',
          start: at === -1 ? 0 : at,
          end: (at === -1 ? 0 : at) + fnOpen.length,
        });
        scanning = false;
        break;
      }
      const closeEnd = closeIdx + fnClose.length;
      // טווחי המקור של תוכן ההערה (עשוי לחצות שורות)
      const ranges: RawRange[] = [];
      let runStart = -1;
      for (let ji = openIdx + fnOpen.length; ji <= closeIdx; ji = ji + 1) {
        const entry = map[ji];
        const isGap = ji === closeIdx || entry === undefined || entry.isJoin;
        if (isGap) {
          if (runStart >= 0) {
            ranges.push({ start: rawAt(runStart), end: rawAt(ji - 1) + 1 });
            runStart = -1;
          }
        } else if (runStart < 0) {
          runStart = ji;
        }
      }
      const rawOpen = rawAt(openIdx);
      const rawClose = rawAt(closeIdx);
      const openLine = map[openIdx]?.lineIndex ?? -1;
      const noteId = `fn-${footnoteDrafts.length + 1}`;
      syntax.push({ recordId: 'footnote-brackets', start: rawOpen, end: rawOpen + fnOpen.length, detail: 'open' });
      syntax.push({ recordId: 'footnote-brackets', start: rawClose, end: rawClose + fnClose.length, detail: 'close' });
      footnoteDrafts.push({
        kind: 'footnote',
        noteId,
        anchor: { start: rawOpen, end: rawClose + fnClose.length },
        body: {
          role: 'body',
          source: {
            start: ranges.length > 0 ? (ranges[0] as RawRange).start : rawOpen,
            end: ranges.length > 0 ? (ranges[ranges.length - 1] as RawRange).end : rawOpen,
          },
          segments: [{ kind: 'text', ranges }],
        },
      });
      const list = fnRefByLine.get(openLine) ?? [];
      list.push({ noteId, start: rawOpen, end: rawClose + fnClose.length });
      fnRefByLine.set(openLine, list);
      // רישום הבליעה: ה-\n שבתוך הטווח והשורות שנבלעו כולן (הישן: השורות מתמזגות לשורה אחת)
      for (let off = rawOpen; off < rawClose + fnClose.length; off = off + 1) {
        if (raw.charCodeAt(off) === 0x0a) swallowedNewlines.add(off);
      }
      const firstLine = map[openIdx]?.lineIndex ?? -1;
      const lastLine = map[closeIdx]?.lineIndex ?? -1;
      for (let li = firstLine + 1; li < lastLine; li = li + 1) swallowedLines.add(li);
      removeRangeFromStates(states, rawOpen, rawClose + fnClose.length, true);
      // שורת הסגירה שהתרוקנה כולה אחרי החילוץ — גם היא נבלעה: הישן מיזג אותה לשורת הפתיחה
      if (firstLine !== lastLine && lastLine >= 0) {
        const closeState = states[lastLine];
        if (closeState !== undefined && closeState.cleanedRaw().text.length === 0) swallowedLines.add(lastLine);
      }
      pos = closeEnd;
    }
  }

  // ── שלב 6: סגנונות מותאמים — קידומת שורה ──
  const customStyles = options.customStyles ?? [];
  for (const style of customStyles) {
    if (typeof style.id !== 'string' || !isValidIdValue(style.id)) {
      throw new ContentModelError('errors.parser.INVALID_CUSTOM_STYLE', { styleId: String(style.id), reason: 'id' }, 'מזהה סגנון מותאם חייב מחרוזת זהות חוקית');
    }
    if (style.matcher.type === 'linePrefix' && style.matcher.prefix.trim().length === 0) {
      throw new ContentModelError('errors.parser.INVALID_CUSTOM_STYLE', { styleId: style.id, reason: 'empty-prefix' }, 'קידומת ריקה אסורה בסגנון linePrefix');
    }
    if (style.matcher.type === 'inlineMarker' && (style.matcher.open.length === 0 || style.matcher.close.length === 0)) {
      throw new ContentModelError('errors.parser.INVALID_CUSTOM_STYLE', { styleId: style.id, reason: 'empty-delimiter' }, 'תוחמי inlineMarker ריקים אסורים');
    }
  }
  const enabledLinePrefix = customStyles.filter((s) => s.enabled && s.matcher.type === 'linePrefix');
  const enabledInlineMarker = customStyles.filter((s) => s.enabled && s.matcher.type === 'inlineMarker');
  const customByLine = new Map<number, DraftBlock>();
  for (const st of states) {
    if (consumed[st.info.index] !== null) continue;
    const cleaned = st.cleanedForMatch();
    if (cleaned.text.length === 0) continue;
    let matched: CustomStyleGrammar | null = null;
    for (const style of enabledLinePrefix) {
      const prefix = style.matcher.type === 'linePrefix' ? style.matcher.prefix : '';
      if (cleaned.text.startsWith(prefix)) { matched = style; break; }
    }
    if (matched === null) continue;
    const prefix = matched.matcher.type === 'linePrefix' ? matched.matcher.prefix : '';
    const afterPrefix = cleaned.text.slice(prefix.length);
    const leadWs = afterPrefix.length - afterPrefix.trimStart().length;
    const contentIdx = prefix.length + leadWs;
    const contentStartRaw = cleaned.map[contentIdx] ?? st.info.contentStart;
    const contentEndRaw = st.info.contentEnd;
    syntax.push({ recordId: 'custom-style-linePrefix', start: st.info.contentStart, end: contentStartRaw, detail: `style:${matched.id}` });
    customByLine.set(st.info.index, {
      role: 'custom',
      styleId: matched.id,
      source: { start: st.info.contentStart, end: contentEndRaw },
      segments: [{ kind: 'text', ranges: rangesWithin(st.surviving(), contentStartRaw, contentEndRaw) }],
    });
    consumed[st.info.index] = 'custom';
    st.remove(st.info.contentStart, contentEndRaw, false);
  }

  // ── שלב 7: כותרות ──
  const headingByLine = new Map<number, DraftBlock>();
  for (const st of states) {
    if (consumed[st.info.index] !== null) continue;
    const cleaned = st.cleanedForMatch();
    if (!cleaned.text.startsWith('כותרת')) continue;
    const hm = matchHeading(cleaned.text);
    if (hm === null) {
      diagnostics.push({
        severity: 'warning',
        code: 'errors.parser.WARN_NEAR_MISS_HEADING',
        message: 'שורה שמתחילה ב"כותרת" ולא תואמה ככותרת — נשארת פסקה (כמו בישן, בתוספת דיווח ממוקם)',
        start: st.info.contentStart,
        end: st.info.contentEnd,
      });
      continue;
    }
    const level = hm.level;
    const textStartRaw = cleaned.map[hm.textIdx] ?? st.info.contentEnd;
    const textEndRaw = st.info.contentEnd;
    syntax.push({ recordId: 'heading-line', start: st.info.contentStart, end: textStartRaw, detail: `H${level}` });
    headingByLine.set(st.info.index, {
      role: 'heading',
      headingLevel: level as HeadingLevel,
      source: { start: st.info.contentStart, end: textEndRaw },
      segments: [{ kind: 'text', ranges: rangesWithin(st.surviving(), textStartRaw, textEndRaw) }],
      ...(hm.simanNumber !== undefined ? { simanNumber: hm.simanNumber } : {}),
      ...(hm.subNumber !== undefined ? { subNumber: hm.subNumber } : {}),
    });
    consumed[st.info.index] = 'heading';
    st.remove(st.info.contentStart, textStartRaw, false);
  }

  // ── inlineMarker: תוחמי inline מוגדרי משתמש על הטקסט ששרד (אחרי ניתוב השורות) ──
  const boxByLine = new Map<number, ItemSegment[]>();
  if (enabledInlineMarker.length > 0) {
    for (const st of states) {
      if (consumed[st.info.index] === 'metadata' || consumed[st.info.index] === 'sidenote') continue;
      for (const range of st.surviving()) {
        for (const style of enabledInlineMarker) {
          if (style.matcher.type !== 'inlineMarker') continue;
          const text = raw.slice(range.start, range.end);
          let pos = 0;
          while (pos < text.length) {
            const start = text.indexOf(style.matcher.open, pos);
            if (start === -1) break;
            const contentStart = start + style.matcher.open.length;
            const end = text.indexOf(style.matcher.close, contentStart);
            if (end === -1) {
              diagnostics.push({
                severity: 'warning',
                code: 'errors.parser.WARN_UNMATCHED_INLINE_MARKER',
                message: `תוחם פתיחה של ${style.id} שלא נסגר — נשאר טקסט מילולי`,
                start: range.start + start,
                end: range.start + start + style.matcher.open.length,
              });
              break;
            }
            const fullEnd = end + style.matcher.close.length;
            const rawStart = range.start + start;
            const rawEnd = range.start + fullEnd;
            syntax.push({ recordId: 'custom-style-inlineMarker', start: rawStart, end: range.start + contentStart, detail: `open:${style.id}` });
            syntax.push({ recordId: 'custom-style-inlineMarker', start: range.start + end, end: rawEnd, detail: `close:${style.id}` });
            const list = boxByLine.get(st.info.index) ?? [];
            list.push({ kind: 'box', styleId: style.id, start: rawStart, end: rawEnd });
            boxByLine.set(st.info.index, list);
            st.remove(rawStart, range.start + contentStart, false);
            st.remove(range.start + end, rawEnd, false);
            pos = fullEnd;
          }
        }
      }
    }
  }

  // ── HTML-נראה בקלט: מילולי + אזהרה (אין HTML כמקור אמת) ──
  for (const st of states) {
    if (consumed[st.info.index] === 'metadata' || consumed[st.info.index] === 'sidenote') continue;
    const piece = raw.slice(st.info.contentStart, st.info.contentEnd);
    if (HTML_TAG_RE.test(piece)) {
      diagnostics.push({
        severity: 'warning',
        code: 'errors.parser.WARN_HTML_IN_TEXT',
        message: 'תגית HTML בקלט — נשמרת כטקסט מילולי; שום החלטה אינה נשענת על HTML כמקור אמת (§6.2)',
        start: st.info.contentStart,
        end: st.info.contentEnd,
      });
    }
  }

  // ── רהיטה: פסקאות, סמני H7 וסדר המסמך ──
  const itemsForLine = (lineIndex: number): ItemSegment[] => {
    const out: ItemSegment[] = [];
    for (const ref of fnRefByLine.get(lineIndex) ?? []) out.push({ kind: 'ref', noteId: ref.noteId, stream: 'footnote', start: ref.start, end: ref.end });
    const enRef = endnoteRefByLine.get(lineIndex);
    if (enRef !== undefined) out.push({ kind: 'ref', noteId: enRef.noteId, stream: 'endnote', start: enRef.start, end: enRef.end });
    for (const box of boxByLine.get(lineIndex) ?? []) out.push(box);
    return out.sort((a, b) => segmentStart(a) - segmentStart(b));
  };
  const sidenoteRef = (lineIndex: number): { noteId: string; start: number; end: number } | undefined => sidenoteRefByLine.get(lineIndex);

  // פסקאות: שורות רצופות עם תוכן או הפניות (metadata/sidenote לא בזרימה)
  const paragraphGroups: number[][] = [];
  {
    let current: number[] = [];
    for (const st of states) {
      const k = consumed[st.info.index];
      // metadata/sidenote הוצאו מהזרימה; heading פותח בלוק עצמאי ומפסיק פסקה (כמו flushParagraph הישן);
      // custom לא מפסיק פסקה (השורה הוחלפה בסנטינל בתוך הזרימה); הערות סיום נשארות בזרימה
      if (k === 'metadata' || k === 'sidenote' || k === 'custom') continue;
      const hasContent = st.cleanedRaw().text.length > 0 || itemsForLine(st.info.index).length > 0;
      if (k === 'heading' || !hasContent) {
        // שורה שנבלעה כולה בתוכן הערה חוצת שורות — הישן מזג אותה לשורה אחת עם שכנותיה;
        // היא אינה מפריד פסקאות (אין לה קיום עצמאי בזרימה)
        if (!hasContent && k !== 'heading' && swallowedLines.has(st.info.index)) continue;
        if (current.length > 0) { paragraphGroups.push(current); current = []; }
        continue;
      }
      current.push(st.info.index);
    }
    if (current.length > 0) paragraphGroups.push(current);
  }
  const paragraphOfLine = new Map<number, number>();
  paragraphGroups.forEach((g, gi) => {
    for (const li of g) paragraphOfLine.set(li, gi);
  });
  const paragraphBlocks: DraftBlock[] = paragraphGroups.map((group) => {
    const first = lineInfos[group[0] as number] as LineInfo;
    const last = lineInfos[group[group.length - 1] as number] as LineInfo;
    const segments: Segment[] = [];
    group.forEach((li, idx) => {
      const st = states[li] as LineState;
      // מיזוג לפי סדר המקור: טווחי טקסט ופריטים (הפניות/תיבות) לסירוגין
      const items = itemsForLine(li);
      const ranges = [...st.surviving()];
      let rangeIdx = 0;
      let itemIdx = 0;
      while (rangeIdx < ranges.length || itemIdx < items.length) {
        const r = ranges[rangeIdx];
        const it = items[itemIdx];
        if (it !== undefined && (r === undefined || it.start < r.start)) {
          segments.push(it);
          itemIdx = itemIdx + 1;
        } else if (r !== undefined) {
          segments.push({ kind: 'text', ranges: [r] });
          rangeIdx = rangeIdx + 1;
        }
      }
      if (idx < group.length - 1) {
        // רווח החדרה בין שורות סופיות שונות (כמו join(' ') הישן). \n שנבלע בהערה חוצת שורות
        // אינו גבול: השורות שמשני צדי ההערה היו שורה סופית אחת בישן — בלי רווח ביניהן.
        const next = states[group[idx + 1] as number] as LineState;
        let boundary = false;
        for (let off = st.info.end; off < next.info.start; off = off + 1) {
          if (raw.charCodeAt(off) === 0x0a && !swallowedNewlines.has(off)) { boundary = true; break; }
        }
        if (boundary) segments.push({ kind: 'join', at: st.info.end });
      }
    });
    return { role: 'body' as const, source: { start: first.start, end: last.end }, segments };
  });

  // סדר המסמך
  const docOrder: DraftBlock[] = [];
  for (const st of states) {
    const li = st.info.index;
    if (consumed[li] === 'sidenote') {
      const ref = sidenoteRef(li);
      if (ref !== undefined) {
        docOrder.push({
          role: 'heading',
          headingLevel: 7,
          source: { start: st.info.start, end: st.info.end },
          segments: [{ kind: 'ref', noteId: ref.noteId, stream: 'sidenote', start: ref.start, end: ref.end }],
          isSidenoteMarker: true,
        });
      }
      continue;
    }
    if (consumed[li] === 'custom') {
      const d = customByLine.get(li);
      if (d !== undefined) docOrder.push(d);
      continue;
    }
    if (consumed[li] === 'heading') {
      const d = headingByLine.get(li);
      if (d !== undefined) docOrder.push(d);
      continue;
    }
    // חבר פסקה (כולל שורות הערות סיום — ההפניה בתוך הפסקה, כמו ה-placeholder הישן)
    if (paragraphOfLine.has(li)) {
      const gi = paragraphOfLine.get(li) as number;
      const firstLine = paragraphGroups[gi]?.[0];
      if (firstLine === li) {
        const pb = paragraphBlocks[gi];
        if (pb !== undefined) docOrder.push(pb);
      }
    }
  }

  // קינון: כותרת פותחת בלוק שילדיו עד הכותרת הבאה (כמו ast-builder הישן)
  const nested: DraftBlock[] = [];
  {
    let currentHeading: DraftBlock | null = null;
    for (const d of docOrder) {
      if (d.role === 'heading' && !d.isSidenoteMarker) {
        const heading: DraftBlock = { ...d, childrenDrafts: [] };
        nested.push(heading);
        currentHeading = heading;
      } else if (currentHeading !== null) {
        (currentHeading.childrenDrafts as DraftBlock[]).push(d);
      } else {
        nested.push(d);
      }
    }
  }

  // ── חלקים וסימנים ──
  interface DraftSiman { simanNumber: number; subNumber?: number; source?: RawRange; blocks: DraftBlock[] }
  interface DraftPart { title?: string; source?: RawRange; simans: DraftSiman[] }
  const parts: DraftPart[] = [];
  {
    // רטרואקטיבי: בלוקים לפני פותח־הסימן הראשון בחלק ממתינים ומוצמדים אליו;
    // חלק שנגמר בלי פותח סימן — סימן סינתטי אוטומטי עוטף את הממתינים
    let part: DraftPart | null = null;
    let pending: DraftBlock[] = [];
    let lastNumber = 0;
    const flushPending = (): void => {
      if (part !== null && pending.length > 0) {
        lastNumber = lastNumber + 1;
        part.simans.push({ simanNumber: lastNumber, blocks: pending });
      }
      pending = [];
    };
    const ensurePart = (): DraftPart => {
      if (part === null) { part = { simans: [] }; parts.push(part); }
      return part;
    };
    for (const d of nested) {
      const isHeading = d.role === 'heading' && !d.isSidenoteMarker;
      if (isHeading && d.headingLevel === 1) {
        flushPending();
        part = { title: draftPlainText(raw, d), source: { ...d.source }, simans: [] };
        parts.push(part);
        lastNumber = 0;
        if (d.simanNumber !== undefined) {
          // H1 עם מספר — פותח בעצמו סימן עם המספר המפורש (שימור הנתון הישן)
          lastNumber = d.simanNumber;
          part.simans.push({ simanNumber: d.simanNumber, subNumber: d.subNumber, source: { ...d.source }, blocks: [d] });
        } else {
          pending = [d];
        }
        continue;
      }
      if (isHeading && (d.headingLevel === 2 || d.simanNumber !== undefined)) {
        const p = ensurePart();
        const explicit = d.simanNumber;
        const number = explicit !== undefined ? explicit : lastNumber + 1;
        lastNumber = number;
        p.simans.push({ simanNumber: number, subNumber: d.subNumber, source: { ...d.source }, blocks: [...pending, d] });
        pending = [];
        continue;
      }
      ensurePart();
      pending.push(d);
    }
    flushPending();
    if (parts.length === 0) parts.push({ simans: [{ simanNumber: 1, blocks: [] }] });
    for (const p of parts) if (p.simans.length === 0) p.simans.push({ simanNumber: 1, blocks: [] });
  }

  // ── בניית אטומים ובלוקים ──
  let blockOrdinal = 0;
  let joinOrdinal = 0;
  const makeJoinSpace = (at: number, stream: ContentStream): InlineItem => {
    const span = spanOf(stream, at, at);
    const atom = makeTextAtom(' ', span, { origin: ORIGIN_PARAGRAPH_JOIN, breakBefore: 'forbidden', ordinal: joinOrdinal });
    joinOrdinal = joinOrdinal + 1;
    return makeTextItem([atom]);
  };
  const inlineOf = (d: DraftBlock, stream: ContentStream): InlineItem[] => {
    const items: InlineItem[] = [];
    let firstBreak: BreakBefore = 'required';
    for (const seg of d.segments) {
      if (seg.kind === 'join') {
        items.push(makeJoinSpace(seg.at, stream));
        continue;
      }
      if (seg.kind === 'ref') {
        items.push(makeNoteReference(seg.noteId, spanOf(seg.stream, seg.start, seg.end)));
        firstBreak = 'allowed';
        continue;
      }
      if (seg.kind === 'box') {
        items.push(makeInlineBox(seg.styleId, spanOf(stream, seg.start, seg.end)));
        firstBreak = 'allowed';
        continue;
      }
      const ranges = seg.ranges.filter((r) => r.end > r.start);
      let prevEnd = -1;
      for (const r of ranges) {
        // פער בין טווחים שורדים שמכיל מפרידי שורות — כל רצף מפרידים הוא שבירה
        // מפורשת אחת (השורות נבלעו בהערה חוצת שורות — כמו join('\n') הישן).
        // תוכן שהוסר בפער (למשל הערת עורך שהוצאה קודם) אינו חלק מהשבירה —
        // הוא מכוסה על ידי הספר/התחביר שלו; נמצא על ידי ה-fuzz של שלב 21.
        if (prevEnd >= 0 && r.start > prevEnd) {
          let g = prevEnd;
          while (g < r.start) {
            if (raw[g] === '\n' || raw[g] === '\r') {
              let h = g + 1;
              while (h < r.start && (raw[h] === '\n' || raw[h] === '\r')) h = h + 1;
              items.push(makeExplicitBreak(spanOf(stream, g, h)));
              g = h;
            } else {
              g = g + 1;
            }
          }
        }
        const atoms = atomsForRanges(raw, [r], documentId, stream, firstBreak);
        if (atoms.length > 0) {
          items.push(makeTextItem(atoms));
          firstBreak = 'allowed';
        }
        prevEnd = r.end;
      }
    }
    return items;
  };
  const buildBlock = (d: DraftBlock, stream: ContentStream): ContentBlock => {
    const ordinal = blockOrdinal;
    blockOrdinal = blockOrdinal + 1;
    const children: ContentBlock[] | undefined =
      d.role === 'heading' && !d.isSidenoteMarker
        ? (d.childrenDrafts ?? []).map((c) => buildBlock(c, stream))
        : undefined;
    return makeContentBlock({
      role: d.isSidenoteMarker ? 'heading' : d.role,
      ...(d.headingLevel !== undefined ? { headingLevel: d.headingLevel } : {}),
      ...(d.styleId !== undefined ? { styleId: d.styleId } : {}),
      source: spanOf(stream, d.source.start, d.source.end),
      inline: inlineOf(d, stream),
      ...(children !== undefined ? { children } : {}),
      ordinal,
    });
  };
  const buildNote = (n: DraftNote): NoteEntry => {
    const stream: ContentStream = n.kind === 'footnote' ? 'footnote' : n.kind === 'endnote' ? 'endnote' : n.kind === 'sidenote' ? 'sidenote' : 'body';
    const ordinal = blockOrdinal;
    blockOrdinal = blockOrdinal + 1;
    const block = makeContentBlock({
      role: 'note-body',
      source: spanOf(stream, n.body.source.start, n.body.source.end),
      inline: inlineOf(n.body, stream),
      ordinal,
    });
    return {
      noteId: n.noteId,
      kind: n.kind,
      ...(n.kind !== 'editorial' && n.anchor !== undefined
        ? { anchor: makeAnchorId(deriveAnchorId(spanOf(stream, n.anchor.start, n.anchor.end), 0)) }
        : {}),
      block,
    };
  };
  for (const ed of editorialDrafts) {
    const ids: AtomId[] = [];
    for (const item of inlineOf(ed.body, 'body')) {
      if (item.kind === 'text') for (const a of item.atoms) ids.push(a.id);
    }
    transforms.push({ kind: 'suppress', from: ids, to: [], reason: 'editorial-note-removal', detail: { noteId: ed.noteId } });
  }

  const finalParts: Part[] = [];
  let partOrdinal = 0;
  let simanOrdinal = 0;
  for (const p of parts) {
    partOrdinal = partOrdinal + 1;
    const partSpan = p.source !== undefined ? spanOf('body', p.source.start, p.source.end) : spanOf('body', 0, 0);
    const simans: Siman[] = p.simans.map((s) => {
      simanOrdinal = simanOrdinal + 1;
      const simanSpan = s.source !== undefined ? spanOf('body', s.source.start, s.source.end) : spanOf('body', 0, 0);
      return {
        id: deriveNodeId(simanSpan, simanOrdinal),
        simanNumber: s.simanNumber,
        ...(s.subNumber !== undefined ? { subNumber: s.subNumber } : {}),
        ...(s.source !== undefined ? { source: simanSpan } : {}),
        blocks: s.blocks.map((b) => buildBlock(b, 'body')),
      };
    });
    finalParts.push({
      id: deriveNodeId(partSpan, partOrdinal),
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.source !== undefined ? { source: partSpan } : {}),
      simanim: Object.freeze(simans),
    });
  }
  const doc = makeTorahDocument({
    schemaVersion: 1,
    documentId,
    metadata,
    parts: finalParts,
    notes: {
      footnotes: footnoteDrafts.map(buildNote),
      endnotes: endnoteDrafts.map(buildNote),
      sidenotes: sidenoteDrafts.map(buildNote),
      editorial: editorialDrafts.map(buildNote),
    },
    customStyleIds: Object.freeze([...new Set([...customByLine.values()].map((d) => d.styleId as string))]),
    sourceHash: options.sourceHash ?? '',
    sourceLength: raw.length,
  });

  // ── חשבונאות מבנית: רווחית/מפרידי שורות/תווי \n שלא כוסו ──
  fillStructuralAccounting(raw, lineInfos, doc, syntax);

  // ── הוכחת כיסוי ──
  const coverage = computeCoverage(doc, syntax, raw.length);

  // ── עץ סוגריים (שלב 19, §10.4): מבני, לפני העימוד; בעיות קלט מדווחות ──
  const brackets = scanBrackets(doc);
  for (const scan of [brackets.body, ...brackets.notes.map((n) => n.scan)]) {
    for (const issue of scan.issues) {
      diagnostics.push({
        severity: 'warning',
        code: issue.kind === 'unclosed-open'
          ? 'errors.parser.WARN_UNCLOSED_BRACKET'
          : 'errors.parser.WARN_STRAY_CLOSE_BRACKET',
        message: issue.detail,
        start: issue.span.startUtf16,
        end: issue.span.endUtf16,
      });
    }
  }

  return {
    doc,
    syntax: Object.freeze(syntax),
    transforms: Object.freeze(transforms),
    diagnostics: Object.freeze(diagnostics),
    coverage,
    brackets,
  };
}

// ─────────────────────────── עזרים ───────────────────────────

interface HeadingMatch {
  level: number;
  simanNumber?: number;
  subNumber?: number;
  textIdx: number;
  isLax: boolean;
}

/**
 * התאמת כותרת — קודם התבנית המובנית של React (‎מספר X (Y)‎), ואם לא התאימה —
 * התבנית הגמישה של Orange (כל טקסט בין הרמה למקף; המקף הראשון חותך) —
 * הבייסליין בפועל (למשל “כותרת 7 (מקור: הוצאה, 7, 367) - חובת שמירה”).
 * הרמה חייבת 0–7 והטקסט אינו ריק (React).
 */
function matchHeading(text: string): HeadingMatch | null {
  const hm = HEADING_RE.exec(text);
  if (hm !== null) {
    const level = parseInt(hm[1] as string, 10);
    if (level >= 0 && level <= 7) {
      return {
        level,
        ...(hm[2] !== undefined ? { simanNumber: parseInt(hm[2], 10) } : {}),
        ...(hm[3] !== undefined ? { subNumber: parseInt(hm[3], 10) } : {}),
        textIdx: (hm.indices?.[4] ?? [text.length, text.length])[0] as number,
        isLax: false,
      };
    }
    return null;
  }
  const lx = HEADING_LAX_RE.exec(text);
  if (lx === null) return null;
  const level = parseInt(lx[1] as string, 10);
  if (level < 0 || level > 7) return null;
  return {
    level,
    textIdx: (lx.indices?.[2] ?? [text.length, text.length])[0] as number,
    isLax: true,
  };
}

function segmentStart(s: Segment): number {
  switch (s.kind) {
    case 'text': return s.ranges.length > 0 ? (s.ranges[0] as RawRange).start : Number.MAX_SAFE_INTEGER;
    case 'join': return s.at;
    default: return s.start;
  }
}

function prevalidate(raw: string): void {
  if (SENTINEL_RE.test(raw)) {
    const idx = raw.search(SENTINEL_RE);
    throw new ContentModelError('errors.parser.SENTINEL_IN_INPUT', { offset: String(idx) }, 'הקלט מכיל תווי sentinel אסורים — הפרסר מסרב לקלט מזוהם');
  }
  // תווי בקרה: \n חוקי (מפריד); \r/\t חוקיים רק בקצוות שורה; יתר נדחים בהתאם לחוזה האטום (שלב 15)
  let lineStart = 0;
  const checkLine = (end: number): void => {
    const line = raw.slice(lineStart, end);
    let seenContent = false;
    for (let i = 0; i < line.length; i = i + 1) {
      const c = line.charCodeAt(i);
      if (c === 0x09) {
        const onlySpacesAfter = line.slice(i).trimStart().length === 0;
        if (seenContent && !onlySpacesAfter) {
          throw new ContentModelError('errors.parser.INVALID_CONTROL_CHAR', { offset: String(lineStart + i), codePoint: '9' }, `טאב בתוך שורה אסור כתוכן (היסט ${lineStart + i}) — תווי בקרה הם גבולות תחביר`);
        }
        if (!seenContent) continue;
      }
      if (c === 0x0d) {
        const onlySpacesAfter = line.slice(i).replace(/\r/g, '').trimStart().length === 0;
        if (seenContent && !onlySpacesAfter) {
          throw new ContentModelError('errors.parser.INVALID_CONTROL_CHAR', { offset: String(lineStart + i), codePoint: '13' }, `\\r בתוך שורה אסור כתוכן (היסט ${lineStart + i})`);
        }
        continue;
      }
      if (c <= 0x1f || c === 0x7f) {
        throw new ContentModelError('errors.parser.INVALID_CONTROL_CHAR', { offset: String(lineStart + i), codePoint: String(c) }, `תו בקרה אסור במקור (היסט ${lineStart + i})`);
      }
      if (c >= 0xd800 && c <= 0xdfff) {
        const okPair = c <= 0xdbff && i + 1 < line.length && line.charCodeAt(i + 1) >= 0xdc00 && line.charCodeAt(i + 1) <= 0xdfff;
        if (!okPair) {
          throw new ContentModelError('errors.parser.INVALID_CONTROL_CHAR', { offset: String(lineStart + i), codePoint: String(c) }, `חצי surrogate בודד במקור (היסט ${lineStart + i})`);
        }
        i = i + 1;
      }
      if (!isWs(line[i] as string)) seenContent = true;
    }
    lineStart = end + 1;
  };
  for (let i = 0; i <= raw.length; i = i + 1) {
    if (i === raw.length || raw.charCodeAt(i) === 0x0a) checkLine(i);
  }
}

/** כמו findMatchingCloseBracket הישן — ספירת עומק תו-בודד (תמיד בתו הראשון של התוחם). */
function findMatchingClose(text: string, openPos: number, open: string, close: string): number {
  const openChar = open[0] as string;
  const closeChar = close[0] as string;
  let depth = 1;
  for (let i = openPos + open.length; i < text.length; i = i + 1) {
    const ch = text[i] as string;
    if (ch === openChar) depth = depth + 1;
    else if (ch === closeChar) {
      depth = depth - 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function removeRangeFromStates(states: LineState[], start: number, end: number, placeholder: boolean): void {
  for (const st of states) {
    if (st.info.start >= end) break;
    if (st.info.end <= start) continue;
    st.remove(Math.max(start, st.info.start), Math.min(end, st.info.end), placeholder);
  }
}

function draftPlainText(raw: string, d: DraftBlock): string {
  const pieces: string[] = [];
  for (const seg of d.segments) {
    if (seg.kind !== 'text') continue;
    for (const r of seg.ranges) pieces.push(raw.slice(r.start, r.end));
  }
  return pieces.join('').trim();
}

/** אטומים ברמת מילה/רווח לטווח אחד רציף — הפרסר הוא הבעלים של החלוקה (שלב 15). */
function atomsForRanges(
  doc: string,
  ranges: readonly RawRange[],
  documentId: string,
  stream: ContentStream,
  firstBreak: BreakBefore,
): TextAtom[] {
  const atoms: TextAtom[] = [];
  let isFirst = true;
  for (const range of ranges) {
    let i = range.start;
    while (i < range.end) {
      const ws = isWs(doc[i] as string);
      let j = i + 1;
      while (j < range.end && isWs(doc[j] as string) === ws) j = j + 1;
      atoms.push(
        makeTextAtom(doc.slice(i, j), makeSourceSpan(documentId, stream, i, j), {
          breakBefore: isFirst ? firstBreak : ws ? 'forbidden' : 'allowed',
        }),
      );
      isFirst = false;
      i = j;
    }
  }
  return atoms;
}

/** מילוי חשבונאות מבנית: כל רווחית שאינה מכוסה בשורה = line-trim; כל \n = line-separator. */
function fillStructuralAccounting(
  raw: string,
  lineInfos: readonly LineInfo[],
  doc: TorahDocument,
  syntax: SyntaxSpan[],
): void {
  // איסוף הטווחים המכוסים (אטומים + ערכי metadata + breaks + syntax שנרשם)
  const covered: RawRange[] = [];
  const walk = (block: ContentBlock): void => {
    for (const item of block.inline) {
      if (item.kind === 'text') {
        for (const atom of item.atoms) covered.push({ start: atom.source.startUtf16, end: atom.source.endUtf16 });
      } else if (item.kind === 'explicit-break') {
        covered.push({ start: item.source.startUtf16, end: item.source.endUtf16 });
      }
    }
    if (block.children !== undefined) for (const c of block.children) walk(c);
  };
  for (const part of doc.parts) {
    for (const siman of part.simanim) for (const b of siman.blocks) walk(b);
  }
  for (const n of [...doc.notes.footnotes, ...doc.notes.endnotes, ...doc.notes.sidenotes, ...doc.notes.editorial]) walk(n.block);
  for (const m of doc.metadata) covered.push({ start: m.source.startUtf16, end: m.source.endUtf16 });
  for (const s of syntax) covered.push({ start: s.start, end: s.end });
  covered.sort((a, b) => a.start - b.start || a.end - b.end);
  const isCovered = (start: number, end: number): boolean => {
    let lo = 0;
    let hi = covered.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const c = covered[mid] as RawRange;
      if (c.end <= start) lo = mid + 1;
      else if (c.start >= end) hi = mid - 1;
      else return true;
    }
    return false;
  };
  for (const info of lineInfos) {
    // רווחית לא מכוסה בתוך השורה → line-trim
    let i = info.start;
    while (i < info.end) {
      const ch = raw[i] as string;
      if (isWs(ch) && !isCovered(i, i + 1)) {
        let j = i + 1;
        while (j < info.end && isWs(raw[j] as string) && !isCovered(j, j + 1)) j = j + 1;
        syntax.push({ recordId: 'line-trim', start: i, end: j, detail: 'trimmed-whitespace' });
        i = j;
      } else {
        i = i + 1;
      }
    }
    // תו ה־\n — מפריד שורות
    if (info.hasNewline) {
      const at = info.end;
      if (!isCovered(at, at + 1)) {
        syntax.push({ recordId: 'paragraph-separator', start: at, end: at + 1, detail: 'newline' });
      }
    }
  }
}

function computeCoverage(doc: TorahDocument, syntax: readonly SyntaxSpan[], sourceLength: number): CoverageProof {
  type Interval = { start: number; end: number; cat: string };
  const intervals: Interval[] = [];
  const walk = (block: ContentBlock): void => {
    for (const item of block.inline) {
      if (item.kind === 'text') {
        for (const atom of item.atoms) intervals.push({ start: atom.source.startUtf16, end: atom.source.endUtf16, cat: 'atoms' });
      } else if (item.kind === 'explicit-break') {
        intervals.push({ start: item.source.startUtf16, end: item.source.endUtf16, cat: 'break' });
      }
    }
    if (block.children !== undefined) for (const c of block.children) walk(c);
  };
  for (const part of doc.parts) {
    for (const siman of part.simanim) for (const b of siman.blocks) walk(b);
  }
  for (const n of [...doc.notes.footnotes, ...doc.notes.endnotes, ...doc.notes.sidenotes, ...doc.notes.editorial]) walk(n.block);
  for (const m of doc.metadata) intervals.push({ start: m.source.startUtf16, end: m.source.endUtf16, cat: 'metadata' });
  for (const s of syntax) intervals.push({ start: s.start, end: s.end, cat: 'syntax' });
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const gaps: { start: number; end: number; nonWhitespace: boolean }[] = [];
  const overlaps: { start: number; end: number; first: string; second: string }[] = [];
  let cursor = 0;
  let atomChars = 0;
  let syntaxChars = 0;
  let metadataChars = 0;
  let breakChars = 0;
  let prevCat = '';
  for (const iv of intervals) {
    const start = Math.max(iv.start, 0);
    const end = Math.min(iv.end, sourceLength);
    if (end <= start) continue;
    const len = end - start;
    if (iv.cat === 'atoms') atomChars = atomChars + len;
    else if (iv.cat === 'syntax') syntaxChars = syntaxChars + len;
    else if (iv.cat === 'metadata') metadataChars = metadataChars + len;
    else breakChars = breakChars + len;
    if (start > cursor) {
      gaps.push({ start: cursor, end: start, nonWhitespace: false });
    } else if (start < cursor) {
      overlaps.push({ start, end: Math.min(end, cursor), first: prevCat, second: iv.cat });
    }
    if (end > cursor) {
      cursor = end;
      prevCat = iv.cat;
    }
  }
  if (cursor < sourceLength) gaps.push({ start: cursor, end: sourceLength, nonWhitespace: false });
  return {
    sourceLength,
    atomChars,
    syntaxChars,
    metadataChars,
    breakChars,
    gaps: Object.freeze(gaps),
    overlaps: Object.freeze(overlaps),
    ok: gaps.length === 0 && overlaps.length === 0,
  };
}
