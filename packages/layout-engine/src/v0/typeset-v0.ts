/**
 * typeset-v0.ts — מנוע v0 דטרמיניסטי (שלב 33; §5–7, §18-M4).
 *
 * שלד מהלך מסומן: "מותר אלגוריתם פשוט כל עוד הוא דטרמיניסטי ומסומן".
 * הצינור: קלט → טוקנים (אטומים + סמני הערה + עוגנים + שבירה כפויה)
 * → BiDi (UAX #9, שלב 28) → shaping לפי רצופי רמה → שבירה גרידית
 * נרשמת בפנקס (כל קו = רשומת החלטה עם מועמדים, דחיות וחירום רשום)
 * → עמודים (טור ימין 0 ואז שמאל 1; §9.3) → עמודי notes לגופי ההערות
 * (NOTES_V0_DEFERRED) → IR + מניפסט + פנקס.
 *
 * מה אין כאן (במפורש): Canvas/DOM, שעון, אקראיות; fallback רק עם קוד
 * ופנקס. ההחלטות הקבועות של v0 מתועדות בפנקס עצמו ובקוד; האלגוריתם
 * הגלובלי מגיע בפרק ו (M5) והשריון האמיתי של הערות — בפרק ז (M6).
 */
import {
  type AnyProvider,
  allBlocks,
  asLu,
  assertTypesetRequest,
  canonicalJson,
  type ContentBlock,
  type DecisionLedgerBuilder,
  DecisionLedgerBuilder as LedgerCtor,
  type EffectiveSettings,
  type FontFaceKey,
  type LayoutDocument,
  type LayoutObserver,
  type LayoutPolicy,
  type LayoutUnit,
  type PageAnchor,
  type PositionedAnchor,
  type PositionedNoteMarker,
  type PositionedRun,
  type Rect,
  roundDiv,
  sha256Hex,
  type SourceSpan,
  type TextAtom,
  toGematriaLabel,
  type TypesetRequest,
  type TypesetSuccess,
  validatedLayout,
  type ContinuationKind,
  numberNotes,
  type NoteNumberingResult,
  makeRunManifest,
  makeTypesetSuccess,
  type PlacedItem,
} from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';
import { type V0Settings, readV0Settings, v0LineHeight } from './v0-settings.js';
import {
  type BlockTokens,
  type Cell,
  type InlineLike,
  tokenize,
  tokenizeNotesBody,
  coalesceSpans,
} from '../linebreak/tokens.js';
import { shapeParagraph, type ShapedParagraph } from '../linebreak/shaping.js';

export const ENGINE_VERSION = '0.1.0' as const;
export const ENGINE_ALGORITHM = 'v0-greedy-walking-skeleton' as const;
export const CODE_SHA = 'dev' as const;

// ─────────────────────────── שבירה גרידית עם פנקס ───────────────────────────

interface LineSpec {
  readonly blockId: string;
  readonly fragmentIndex: number;
  readonly cells: readonly Cell[];
  readonly breakReason: 'fit' | 'required' | 'paragraph-end' | 'emergency';
  readonly continuation: ContinuationKind;
  readonly widthLu: number;
  readonly sourceSpans: readonly SourceSpan[];
}


function breakBlockGreedy(
  bt: BlockTokens,
  shaped: ShapedParagraph,
  columnWidth: number,
  markerWidth: (label: string, bodyPrefix: boolean) => number,
  ledger: DecisionLedgerBuilder,
): readonly LineSpec[] {
  const { tokens, atoms } = bt;
  const lines: LineSpec[] = [];
  if (tokens.length === 0) return lines;

  // הזדמנויות שבירה: לפי האטומים (breakBefore; הספק עם UAX #14 מלא נכנס ב-M5 עם hooks)
  const opportunitySet = new Set<number>();
  for (let i = 1; i < atoms.length; i++) {
    if (atoms[i]!.breakBefore !== 'forbidden') opportunitySet.add(i);
  }
  type End = { tokEnd: number; atomEnd: number; forced: boolean };
  const ends: End[] = [];
  {
    const tokIndexOfAtom = (pIdx: number): number => {
      for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t]!;
        if (tok.kind === 'atom' && tok.pIdx === pIdx) return t;
      }
      return tokens.length;
    };
    for (const pIdx of [...opportunitySet].sort((a, b) => a - b)) {
      ends.push({ tokEnd: tokIndexOfAtom(pIdx), atomEnd: pIdx, forced: false });
    }
    for (let t = 0; t < tokens.length; t++) {
      if (tokens[t]!.kind === 'forced') ends.push({ tokEnd: t, atomEnd: -1, forced: true });
    }
    ends.push({ tokEnd: tokens.length, atomEnd: atoms.length, forced: false });
    ends.sort((a, b) => a.tokEnd - b.tokEnd || a.atomEnd - b.atomEnd);
  }

  const cellWidth = (cell: Cell): number => {
    if (cell.kind === 'atom') return shaped.advances[cell.pIdx] ?? 0;
    if (cell.kind === 'marker') return markerWidth(cell.label, cell.bodyPrefix);
    return 0;
  };
  const widthOf = (from: number, to: number): number => {
    let w = 0;
    for (let t = from; t < to; t++) {
      const tok = tokens[t]!;
      if (tok.kind === 'forced') continue;
      w += cellWidth(tok);
    }
    return w;
  };

  let t0 = 0;
  while (t0 < tokens.length) {
    const firstForced = ends.find((e) => e.forced && e.tokEnd > t0)?.tokEnd ?? Number.MAX_SAFE_INTEGER;
    const cap = Math.min(firstForced, tokens.length);
    const candidates = ends.filter((e) => e.tokEnd > t0 && e.tokEnd <= cap);
    if (candidates.length === 0) {
      // אין אפשרות סגירה — קפיצה מעבר ל-forced הקרוב
      t0 = Math.min(firstForced, tokens.length) + 1;
      continue;
    }
    const fitting = candidates.filter((e) => widthOf(t0, e.tokEnd) <= columnWidth);
    const emergency = fitting.length === 0;
    const chosen = emergency ? candidates[0]! : fitting[fitting.length - 1]!;

    const cells: Cell[] = [];
    for (let t = t0; t < chosen.tokEnd; t++) {
      const tok = tokens[t]!;
      if (tok.kind !== 'forced') cells.push(tok);
    }
    const isBlockLast = chosen.tokEnd >= tokens.length;
    const reason: LineSpec['breakReason'] = emergency ? 'emergency' : chosen.forced ? 'required' : isBlockLast ? 'paragraph-end' : 'fit';
    if (cells.length > 0) {
      const isFirst = lines.length === 0;
      const continuation: ContinuationKind = isFirst && isBlockLast ? 'whole' : isFirst ? 'start' : isBlockLast ? 'end' : 'middle';
      lines.push({
        blockId: bt.blockId,
        fragmentIndex: lines.length,
        cells,
        breakReason: reason,
        continuation,
        widthLu: widthOf(t0, chosen.tokEnd),
        sourceSpans: coalesceSpans(cells, atoms),
      });
      const stateHash = sha256Hex(canonicalJson({
        b: bt.blockId, f: lines.length - 1, r: reason, w: widthOf(t0, chosen.tokEnd),
        s: cells.find((c) => c.kind === 'atom') && (cells.find((c) => c.kind === 'atom') as { pIdx: number }).pIdx !== undefined
          ? atoms[(cells.find((c) => c.kind === 'atom') as { pIdx: number }).pIdx]!.id : null,
        e: (() => { const last = [...cells].reverse().find((c) => c.kind === 'atom') as { pIdx: number } | undefined; return last ? atoms[last.pIdx]!.id : null; })(),
      }));
      ledger.append({
        stage: 'line-break',
        scopeId: `${bt.blockId}#f${lines.length - 1}`,
        sourceSpans: coalesceSpans(cells, atoms),
        stateHash,
        candidates: candidates.map((e) => ({ id: `end:${e.atomEnd}`, cost: Math.max(0, columnWidth - widthOf(t0, e.tokEnd)) })),
        selectedCandidateId: `end:${chosen.atomEnd}`,
        rejected: candidates
          .filter((e) => e !== chosen)
          .map((e) => ({ candidateId: `end:${e.atomEnd}`, reason: widthOf(t0, e.tokEnd) > columnWidth ? 'overflow' : 'underfill-greedy-v0' })),
        ...(emergency ? { fallbackCode: 'EMERGENCY_LINE' as const } : {}),
        budget: { generated: candidates.length, pruned: 0, exhausted: false },
      });
    }
    t0 = chosen.tokEnd + (chosen.forced ? 1 : 0);
  }
  return lines;
}

// ─────────────────────────── הצבה חזותית ───────────────────────────

interface MarkerInfo { readonly widthLu: number; readonly ascentLu: number; readonly descentLu: number }

interface PlacedLineContent {
  readonly runs: readonly PositionedRun[];
  readonly markers: readonly { noteId: string; label: string; source: SourceSpan; bodyPrefix: boolean; xLu: number; info: MarkerInfo }[];
  readonly anchors: readonly { anchorId: string; source: SourceSpan; xLu: number }[];
}

function placeLineVisually(
  line: LineSpec,
  atoms: readonly TextAtom[],
  shaped: ShapedParagraph,
  font: FontFaceKey,
  fontSizeLu: LayoutUnit,
  markerInfoOf: (label: string, bodyPrefix: boolean) => MarkerInfo,
): PlacedLineContent {
  const inLine = new Set<number>();
  for (const cell of line.cells) if (cell.kind === 'atom') inLine.add(cell.pIdx);

  const visualPos = new Map<number, number>();
  let vi = 0;
  for (const pIdx of shaped.visualOrder) {
    if (inLine.has(pIdx)) { visualPos.set(pIdx, vi); vi += 1; }
  }

  interface Sortable { cell: Cell; key: number; seq: number }
  const sortable: Sortable[] = [];
  let prevAtomInLine: number | null = null;
  let seq = 0;
  for (const cell of line.cells) {
    if (cell.kind === 'atom') {
      sortable.push({ cell, key: visualPos.get(cell.pIdx) ?? 0, seq });
      prevAtomInLine = cell.pIdx;
    } else {
      const key = prevAtomInLine !== null ? (visualPos.get(prevAtomInLine) ?? 0) + 0.5 : -0.5;
      sortable.push({ cell, key, seq });
    }
    seq += 1;
  }
  sortable.sort((a, b) => a.key - b.key || a.seq - b.seq);

  const runs: PositionedRun[] = [];
  const markers: PlacedLineContent['markers'][number][] = [];
  const anchors: PlacedLineContent['anchors'][number][] = [];
  let x = 0;
  // הצבה לפי מקטעים חזותיים: אותו רצף בי-די יכול להופיע בשני מקטעים נפרדים
  // באותו קו (הטמעה כמו עברית-מספרים-עברית); כל מקטע רציף = PositionedRun
  // משלו — אחרת ייווצר כפילות אטומים (נתגלה בבדיקות הכיסוי של שלב 33).
  interface OpenRun { runIdx: number; startLu: number; widthLu: number; atoms: TextAtom[] }
  let open: OpenRun | null = null;
  const flush = (): void => {
    if (open === null) return;
    const rr = shaped.runs[open.runIdx]!;
    const segmentAtoms = open.atoms;
    if (segmentAtoms.length > 0) {
      const memberSet = new Set<string>(segmentAtoms.map((a) => a.id as string));
      runs.push({
        kind: 'run',
        id: `run:${line.blockId}#f${line.fragmentIndex}:r${runs.length}`,
        font,
        fontSizeLu,
        direction: rr.run.direction,
        startLu: asLu(open.startLu),
        widthLu: asLu(open.widthLu),
        text: segmentAtoms.map((a) => a.text).join(''),
        glyphs: rr.shaped.glyphs
          .map((g) => ({
            glyphId: g.glyphId,
            atomId: atoms[rr.run.startAtom + g.clusterAtomIndex]!.id,
            clusterAtomIndex: g.clusterAtomIndex,
            advanceLu: g.advanceLu,
            xOffsetLu: g.xOffsetLu,
            yOffsetLu: g.yOffsetLu,
          }))
          .filter((g) => memberSet.has(g.atomId as string)),
        atomIds: segmentAtoms.map((a) => a.id),
        requestHash: rr.shaped.requestHash,
      });
    }
    open = null;
  };
  for (const s of sortable) {
    const cell = s.cell;
    if (cell.kind === 'atom') {
      const ri = shaped.runOfAtom[cell.pIdx] ?? -1;
      const w = shaped.advances[cell.pIdx] ?? 0;
      if (open !== null && open.runIdx !== ri) flush();
      if (ri >= 0) {
        if (open === null) open = { runIdx: ri, startLu: x, widthLu: 0, atoms: [] };
        open.widthLu += w;
        open.atoms.push(atoms[cell.pIdx]!);
      }
      x += w;
    } else if (cell.kind === 'marker') {
      flush();
      const info = markerInfoOf(cell.label, cell.bodyPrefix);
      markers.push({ noteId: cell.noteId, label: cell.label, source: cell.source, bodyPrefix: cell.bodyPrefix, xLu: x, info });
      x += info.widthLu;
    } else {
      flush();
      anchors.push({ anchorId: cell.anchorId, source: cell.source, xLu: x });
    }
  }
  flush();
  return { runs: Object.freeze(runs), markers: Object.freeze(markers), anchors: Object.freeze(anchors) };
}

// ─────────────────────────── מכונת עמודים ───────────────────────────

function rectOf(x: number, y: number, w: number, h: number): Rect {
  return { x: asLu(x), y: asLu(y), width: asLu(Math.max(1, w)), height: asLu(Math.max(1, h)) };
}

interface PageAcc {
  readonly physicalIndex: number;
  readonly isNotes: boolean;
  readonly regions: readonly { id: string; rect: Rect; columnIndex: 0 | 1 }[];
  items: PlacedItem[];
}

class PageMachine {
  readonly bodyPages: PageAcc[] = [];
  readonly notesPages: PageAcc[] = [];
  private penBody = { page: -1, col: 0 as 0 | 1, y: 0 };
  private penNotes = { page: -1, y: 0 };

  constructor(
    private readonly v0: V0Settings,
    private readonly lineHeight: number,
    private readonly ledger: DecisionLedgerBuilder,
  ) {}

  private total(): number { return this.bodyPages.length + this.notesPages.length; }

  private newBodyPage(): PageAcc {
    const physicalIndex = this.total() + 1;
    const g = this.v0.geometry;
    const p: PageAcc = {
      physicalIndex,
      isNotes: false,
      regions: [
        { id: `page:${physicalIndex}:col:0`, columnIndex: 0, rect: rectOf(g.mainX + g.columnWidth + g.columnGap, g.contentTop, g.columnWidth, g.contentBottom - g.contentTop) },
        { id: `page:${physicalIndex}:col:1`, columnIndex: 1, rect: rectOf(g.mainX, g.contentTop, g.columnWidth, g.contentBottom - g.contentTop) },
      ],
      items: [],
    };
    this.bodyPages.push(p);
    this.penBody = { page: physicalIndex, col: 0, y: g.contentTop };
    return p;
  }

  private newNotesPage(): PageAcc {
    const physicalIndex = this.total() + 1;
    const g = this.v0.geometry;
    const p: PageAcc = {
      physicalIndex,
      isNotes: true,
      regions: [{ id: `page:${physicalIndex}:notes`, columnIndex: 0, rect: rectOf(g.mainX, g.contentTop, g.mainWidth, g.contentBottom - g.contentTop) }],
      items: [],
    };
    this.notesPages.push(p);
    this.penNotes = { page: physicalIndex, y: g.contentTop };
    return p;
  }

  private place(
    acc: PageAcc,
    region: { id: string; rect: Rect },
    line: LineSpec,
    placed: PlacedLineContent,
    shaped: ShapedParagraph,
    y: number,
    outAnchors: PageAnchor[],
  ): void {
    const g = this.v0.geometry;
    const baseline = y + roundDiv(this.lineHeight - (shaped.ascentLu + shaped.descentLu), 2) + shaped.ascentLu;
    const lineId = `item:${line.blockId}#f${line.fragmentIndex}@${region.id}`;
    acc.items.push({
      kind: 'line',
      id: lineId,
      blockId: line.blockId as never,
      fragmentIndex: line.fragmentIndex,
      lineIndex: line.fragmentIndex,
      regionId: region.id,
      rect: rectOf(region.rect.x, y, region.rect.width, this.lineHeight),
      baseline: asLu(baseline),
      runs: placed.runs,
      sourceSpans: line.sourceSpans,
      breakReason: line.breakReason,
      continuation: line.continuation,
    });
    for (const m of placed.markers) {
      const superShift = this.v0.markerSuperscript && !m.bodyPrefix ? Math.max(0, shaped.ascentLu - m.info.ascentLu) : 0;
      const mBaseline = baseline - superShift;
      acc.items.push({
        kind: 'note-marker',
        id: `${lineId}:marker:${m.noteId}`,
        noteId: m.noteId,
        label: m.label,
        regionId: region.id,
        rect: rectOf(region.rect.x + m.xLu, mBaseline - m.info.ascentLu, m.info.widthLu, m.info.ascentLu + m.info.descentLu),
        baseline: asLu(mBaseline),
        source: m.source,
        superscript: this.v0.markerSuperscript && !m.bodyPrefix,
      } as PositionedNoteMarker);
    }
    for (const a of placed.anchors) {
      const itemId = `${lineId}:anchor:${a.anchorId}`;
      acc.items.push({
        kind: 'anchor',
        id: itemId,
        anchorId: a.anchorId as never,
        regionId: region.id,
        rect: rectOf(region.rect.x + a.xLu, baseline - 2, 2, 4),
        source: a.source,
      } as PositionedAnchor);
      outAnchors.push({ anchorId: a.anchorId as never, pageId: `page:${acc.physicalIndex}`, regionId: region.id, itemId });
    }
    void g;
  }

  addBodyLine(line: LineSpec, placed: PlacedLineContent, shaped: ShapedParagraph, outAnchors: PageAnchor[]): void {
    const g = this.v0.geometry;
    if (this.bodyPages.length === 0) this.newBodyPage();
    if (this.penBody.y + this.lineHeight > g.contentBottom) {
      if (this.penBody.col === 0) {
        this.ledger.append({
          stage: 'column-break', scopeId: `page:${this.penBody.page}:0to1`, sourceSpans: [],
          stateHash: sha256Hex(canonicalJson({ p: this.penBody.page, col: 1 })),
          candidates: [{ id: 'fixed-v0', cost: 0 }], selectedCandidateId: 'fixed-v0', rejected: [],
        });
        this.penBody = { page: this.penBody.page, col: 1, y: g.contentTop };
      } else {
        this.ledger.append({
          stage: 'page-break', scopeId: `after:${this.penBody.page}`, sourceSpans: [],
          stateHash: sha256Hex(canonicalJson({ p: this.penBody.page })),
          candidates: [{ id: 'fixed-v0', cost: 0 }], selectedCandidateId: 'fixed-v0', rejected: [],
        });
        this.newBodyPage();
      }
    }
    const page = this.bodyPages.find((p) => p.physicalIndex === this.penBody.page)!;
    const region = page.regions.find((r) => r.columnIndex === this.penBody.col)!;
    this.place(page, region, line, placed, shaped, this.penBody.y, outAnchors);
    this.penBody = { ...this.penBody, y: this.penBody.y + this.lineHeight };
  }

  addNotesLine(line: LineSpec, placed: PlacedLineContent, shaped: ShapedParagraph, outAnchors: PageAnchor[]): void {
    const g = this.v0.geometry;
    if (this.notesPages.length === 0 || this.penNotes.y + this.lineHeight > g.contentBottom) {
      if (this.notesPages.length > 0) {
        this.ledger.append({
          stage: 'page-break', scopeId: `after:${this.penNotes.page}:notes`, sourceSpans: [],
          stateHash: sha256Hex(canonicalJson({ p: this.penNotes.page, kind: 'notes' })),
          candidates: [{ id: 'fixed-v0', cost: 0 }], selectedCandidateId: 'fixed-v0', rejected: [],
        });
      }
      this.newNotesPage();
    }
    const page = this.notesPages.find((p) => p.physicalIndex === this.penNotes.page)!;
    this.place(page, page.regions[0]!, line, placed, shaped, this.penNotes.y, outAnchors);
    this.penNotes = { ...this.penNotes, y: this.penNotes.y + this.lineHeight };
  }
}

// ─────────────────────────── הרצה ───────────────────────────

export function typeset(
  request: TypesetRequest,
  measurement: AnyProvider,
  policy: LayoutPolicy,
  observer?: LayoutObserver,
): TypesetSuccess {
  assertTypesetRequest(request);
  if (typeof policy?.policyId !== 'string' || policy.policyId.length === 0) {
    throw new LayoutEngineError('errors.engine.SETTING_INVALID', { key: 'policyId', reason: 'empty' }, 'policyId חובה');
  }
  const v0 = readV0Settings(request.settings as EffectiveSettings);
  const g = v0.geometry;
  const lineHeight = v0LineHeight(v0);

  const bodyFontEntry = request.assets.fonts.find((f) => f.usage === 'body');
  if (bodyFontEntry === undefined) {
    throw new LayoutEngineError('errors.engine.BODY_FONT_MISSING', { usage: 'body' }, 'לא סופק גופן body פתור');
  }
  const font = bodyFontEntry.font;

  // מטמון סמנים (מידע + רוחב) — טהור, ללא זמן; מפתח: תווית+גודל+סוג.
  const markerCache = new Map<string, MarkerInfo>();
  const markerInfoOf = (label: string, bodyPrefix: boolean): MarkerInfo => {
    const key = `${label}|${v0.markerFontSizeLu}|${bodyPrefix ? 'p' : 'r'}`;
    let info = markerCache.get(key);
    if (info === undefined) {
      const shaped = measurement.shape({
        atoms: [{ id: `marker:${label}` as never, text: label, script: 'number', bidiLevel: 0, breakBefore: 'forbidden' }] as never,
        font,
        fontSizeLu: v0.markerFontSizeLu,
        direction: 'ltr',
        language: 'he',
        features: {},
        letterSpacingLu: asLu(0),
      });
      let gap = 0;
      if (bodyPrefix) {
        const space = measurement.shape({
          atoms: [{ id: 'marker:space' as never, text: ' ', script: 'other', bidiLevel: 0, breakBefore: 'forbidden' }] as never,
          font,
          fontSizeLu: v0.markerFontSizeLu,
          direction: 'ltr',
          language: 'he',
          features: {},
          letterSpacingLu: asLu(0),
        });
        gap = space.widthLu;
      }
      info = { widthLu: shaped.widthLu + gap, ascentLu: shaped.ascentLu, descentLu: shaped.descentLu };
      markerCache.set(key, info);
    }
    return info;
  };
  const markerWidth = (label: string, bodyPrefix: boolean): number => markerInfoOf(label, bodyPrefix).widthLu;

  const doc = request.document;
  observer?.onProgress?.('parse', 0);

  // מספור הערות — טרם העימוד (§10.3); v0: page-scope מומר ל-siman בהסבר רשום.
  const numbering: NoteNumberingResult = numberNotes(doc, { scope: v0.noteScope, labelFormat: 'gematria', streams: ['footnote', 'endnote'] });
  const noteLabels = new Map<string, string>();
  for (const [noteId, assignment] of numbering.assignments) noteLabels.set(noteId, assignment.label);

  const ledger = new LedgerCtor(request.trace);
  ledger.append({
    stage: 'notes', scopeId: 'numbering:policy', sourceSpans: [],
    stateHash: sha256Hex(canonicalJson({ scope: v0.noteScope, requested: v0.pageScopeRequested ? 'page' : v0.noteScope })),
    candidates: [{ id: `${v0.noteScope}-scope-v0`, cost: 0 }], selectedCandidateId: `${v0.noteScope}-scope-v0`,
    rejected: v0.pageScopeRequested ? [{ candidateId: 'page-scope', reason: 'page-scope-requires-layout-context (M6)' }] : [],
    fallbackCode: 'NOTES_V0_DEFERRED',
  });

  // זרימת הגוף: כל בלוקי המסמך למעט גופי הערות (הם מגיעים בשלב ה-notes)
  const bodyBlocks = allBlocks(doc).filter((b) => b.role !== 'note-body') as readonly ContentBlock[];
  observer?.onProgress?.('parse', bodyBlocks.length);

  const machine = new PageMachine(v0, lineHeight, ledger);
  const outAnchors: PageAnchor[] = [];

  for (const block of bodyBlocks) {
    const bt = tokenize(block.id as string, block.inline as InlineLike, noteLabels);
    const shaped = shapeParagraph(bt.atoms, measurement, font, v0.bodyFontSizeLu);
    const lines = breakBlockGreedy(bt, shaped, g.columnWidth, markerWidth, ledger);
    for (const line of lines) {
      const placed = placeLineVisually(line, bt.atoms, shaped, font, v0.bodyFontSizeLu, markerInfoOf);
      machine.addBodyLine(line, placed, shaped, outAnchors);
    }
    observer?.onProgress?.('breaking', bodyBlocks.indexOf(block) + 1, bodyBlocks.length);
  }

  // ── עמודי notes: גופי ההערות בסוף המסמך (v0 מסומן; NOTES_V0_DEFERRED) ──
  type NoteEntryLike = { noteId: string; block: ContentBlock };
  const streams: readonly { entries: readonly NoteEntryLike[] }[] = [
    { entries: doc.notes.footnotes as readonly NoteEntryLike[] },
    { entries: doc.notes.endnotes as readonly NoteEntryLike[] },
    { entries: doc.notes.sidenotes as readonly NoteEntryLike[] },
    { entries: doc.notes.editorial as readonly NoteEntryLike[] },
  ];
  let noteCount = 0;
  for (const stream of streams) {
    for (const entry of stream.entries) {
      noteCount += 1;
      const label = noteLabels.get(entry.noteId) ?? null;
      const src = entry.block.source ?? { documentId: doc.documentId, stream: 'footnote' as const, startUtf16: 0, endUtf16: 1 } as SourceSpan;
      const bt = tokenizeNotesBody(entry.noteId, label, src, entry.block.inline as InlineLike);
      const shaped = shapeParagraph(bt.atoms, measurement, font, v0.bodyFontSizeLu);
      const lines = breakBlockGreedy(bt, shaped, g.mainWidth, markerWidth, ledger);
      for (const line of lines) {
        const placed = placeLineVisually(line, bt.atoms, shaped, font, v0.bodyFontSizeLu, markerInfoOf);
        machine.addNotesLine(line, placed, shaped, outAnchors);
      }
      observer?.onProgress?.('notes', noteCount);
    }
  }
  observer?.onProgress?.('paginating', machine.bodyPages.length + machine.notesPages.length);

  // ── הרכבה: folio, parity, pages, IR ──
  const folioOf = (physicalIndex: number): string => {
    const n = v0.folioInitial + physicalIndex - 1;
    return v0.folioFormat === 'gematria' ? toGematriaLabel(n) : String(n);
  };
  const toPage = (acc: PageAcc): Record<string, unknown> => ({
    id: `page:${acc.physicalIndex}`,
    physicalIndex: acc.physicalIndex,
    ...(acc.isNotes ? {} : { printedFolio: folioOf(acc.physicalIndex) }),
    parity: acc.physicalIndex % 2 === 1 ? 'recto' : 'verso',
    kind: acc.isNotes ? 'notes' : 'body',
    size: { width: g.pageWidth, height: g.pageHeight },
    regions: acc.regions.map((r) => ({ id: r.id, kind: 'body-column', rect: r.rect, columnIndex: r.columnIndex })),
    items: acc.items,
  });
  const pages = [...machine.bodyPages, ...machine.notesPages].map(toPage);

  const layout: LayoutDocument = validatedLayout({
    schemaVersion: 1,
    policyId: policy.policyId,
    pages,
    anchors: outAnchors,
    transformations: doc.transforms,
  });

  const manifest = makeRunManifest({
    engineVersion: ENGINE_VERSION,
    codeSha: CODE_SHA,
    // שלב 40: חבילה זו היא המנוע 'next'; legacy הוא הרץ הנעול של הבייסליין
    // (docs/migration/baseline) ואינו חלק מחבילות הליבה — אין מסלול צד.
    engine: 'next',
    sourceSha256: request.sourceSha256,
    effectiveSettings: request.settings,
    fontsManifestSha256: request.assets.fontsManifestSha256,
    assetsManifestSha256: request.assets.assetsManifestSha256,
    parserVersion: request.parserVersion,
    environmentHash: measurement.environmentHash,
    layout,
  });

  observer?.onProgress?.('assembling', pages.length);
  return makeTypesetSuccess(layout, manifest, ledger.build() ?? undefined);
}

