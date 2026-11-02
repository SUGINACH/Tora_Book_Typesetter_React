/**
 * preview-model.ts — היטל טהור IR ← מודל תצוגה (שלב 36; אפיון §13.2).
 *
 * התצוגה היא היטל של ה־IR ולא מקור החלטות: ההמרה חד-כיוונית, טהורה
 * ודטרמיניסטית — אותו IR ⇐ אותו מודל. **CSS logical properties** בלבד
 * (§13.2): המיקומים נגזרים כ-inset-inline-start ביחס לקצה ההתחלתי של
 * המיכל (בעמוד RTL — מימין), כך שהכיוון נגזר מה-DOM ולא מחישוב שמאל/ימין
 * כפול. ההמרה LU→px רציונלית (luToCssPx — projection.ts של layout-api).
 *
 * אין כאן: מדידה, DOM, גישה ל-window, או כל כתיבה חזרה אל ה־IR.
 */
import {
  luToCssPx,
  type LayoutDocument,
  type LayoutPage,
  type LineFragment,
  type PositionedNoteMarker,
  type PositionedRun,
  type PlacedItem,
  type Rect,
} from '@tora/layout-api';

export interface RunViewModel {
  readonly kind: 'run';
  readonly id: string;
  readonly text: string;
  readonly direction: 'rtl' | 'ltr';
  /** מיקום ההיסב מהקצה ההתחלתי (inline-start) של תיבת הקו, ב-px. */
  readonly insetInlineStartPx: number;
  readonly inlineSizePx: number;
  readonly fontSizePx: number;
  readonly fontFamily: string;
}

export interface LineViewModel {
  readonly kind: 'line';
  readonly id: string;
  readonly blockId: string;
  readonly regionId: string;
  readonly insetInlineStartPx: number;
  readonly insetBlockStartPx: number;
  readonly inlineSizePx: number;
  readonly blockSizePx: number;
  readonly runs: readonly RunViewModel[];
}

export interface MarkerViewModel {
  readonly kind: 'note-marker';
  readonly id: string;
  readonly noteId: string;
  readonly label: string;
  readonly insetInlineStartPx: number;
  readonly insetBlockStartPx: number;
  readonly inlineSizePx: number;
  readonly blockSizePx: number;
}

export interface RegionViewModel {
  readonly id: string;
  readonly kind: string;
  readonly columnIndex?: 0 | 1;
  readonly insetInlineStartPx: number;
  readonly insetBlockStartPx: number;
  readonly inlineSizePx: number;
  readonly blockSizePx: number;
}

export interface PageViewModel {
  readonly id: string;
  readonly physicalIndex: number;
  readonly kind: string;
  readonly parity: string;
  readonly folio?: string;
  readonly inlineSizePx: number;
  readonly blockSizePx: number;
  readonly regions: readonly RegionViewModel[];
  readonly lines: readonly LineViewModel[];
  readonly markers: readonly MarkerViewModel[];
}

/** מרחק הקצה ההתחלתי של מלבן מהקצה ההתחלתי של המיכל — ב-LU, בטרם המרה. */
function insetInlineStartLu(containerWidthLu: number, rect: Rect): number {
  return containerWidthLu - rect.x - rect.width;
}

const px = (lu: number): number => luToCssPx(lu as never);

/** היטל עמוד בודד — PageView מקבל LayoutPage (§13.2) ומיצג אותו בלבד. */
export function projectPage(page: LayoutPage): PageViewModel {
  const pageW = page.size.width as number;
  const regions: RegionViewModel[] = page.regions.map((r) => ({
    id: r.id,
    kind: r.kind,
    ...(r.columnIndex !== undefined ? { columnIndex: r.columnIndex } : {}),
    insetInlineStartPx: px(insetInlineStartLu(pageW, r.rect)),
    insetBlockStartPx: px(r.rect.y),
    inlineSizePx: px(r.rect.width),
    blockSizePx: px(r.rect.height),
  }));
  const lines: LineViewModel[] = [];
  const markers: MarkerViewModel[] = [];
  for (const item of page.items as readonly PlacedItem[]) {
    if (item.kind === 'line') {
      lines.push(projectLine(item, pageW));
    } else if (item.kind === 'note-marker') {
      markers.push(projectMarker(item, pageW));
    }
  }
  return {
    id: page.id,
    physicalIndex: page.physicalIndex,
    kind: page.kind,
    parity: page.parity,
    ...(page.printedFolio !== undefined ? { folio: page.printedFolio } : {}),
    inlineSizePx: px(page.size.width),
    blockSizePx: px(page.size.height),
    regions,
    lines,
    markers,
  };
}

function projectLine(line: LineFragment, pageWidthLu: number): LineViewModel {
  const runs: RunViewModel[] = line.runs.map((r) => projectRun(r, line.rect.width as number));
  return {
    kind: 'line',
    id: line.id,
    blockId: line.blockId,
    regionId: line.regionId,
    insetInlineStartPx: px(insetInlineStartLu(pageWidthLu, line.rect)),
    insetBlockStartPx: px(line.rect.y),
    inlineSizePx: px(line.rect.width),
    blockSizePx: px(line.rect.height),
    runs,
  };
}

function projectRun(run: PositionedRun, lineWidthLu: number): RunViewModel {
  return {
    kind: 'run',
    id: run.id,
    text: run.text,
    direction: run.direction,
    insetInlineStartPx: px(lineWidthLu - (run.startLu as number) - (run.widthLu as number)),
    inlineSizePx: px(run.widthLu),
    fontSizePx: px(run.fontSizeLu),
    fontFamily: run.font.family,
  };
}

function projectMarker(m: PositionedNoteMarker, pageWidthLu: number): MarkerViewModel {
  // הסמן בקואורדינטות עמוד (כמו שה-IR נושא אותו) — היטל לוגי מהקצה ההתחלתי
  return {
    kind: 'note-marker',
    id: m.id,
    noteId: m.noteId,
    label: m.label,
    insetInlineStartPx: px(insetInlineStartLu(pageWidthLu, m.rect)),
    insetBlockStartPx: px((m.baseline as number) - (m.rect.y as number)),
    inlineSizePx: px(m.rect.width),
    blockSizePx: px(m.rect.height),
  };
}

/** מזהה יציב ל-source span — לניווט עורך↔פריסה (§13.2; קליק על קו). */
export function spanKey(span: { stream: string; start: number; end: number }): string {
  return `${span.stream}:${span.start}-${span.end}`;
}

/** היטל מסמך שלם — סדר עמודים קבוע; טהור לחלוטין. */
export function projectLayout(layout: LayoutDocument): readonly PageViewModel[] {
  return layout.pages.map(projectPage);
}
