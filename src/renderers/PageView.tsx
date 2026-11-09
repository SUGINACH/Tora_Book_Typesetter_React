/**
 * PageView.tsx — עמוד בודד בתצוגה המקדימה (שלב 36; אפיון §13.2).
 *
 * PageView מקבל LayoutPage (לא מסמך שלם, לא Worker, לא typeset) ומיצג
 * אותו בלבד: מיפוי חד-כיווני IR ← אלמנטים עם data-source-id/
 * data-region-id/data-fragment-id (§13.2). הטקסט מגיע כערכי React —
 * אין dangerouslySetInnerHTML (§13.2). אין כל מדידת DOM במסלול.
 */
import type { CSSProperties } from 'react';
import type { LayoutPage } from '@tora/layout-api';
import { projectPage, type PageViewModel, type RunViewModel } from './preview-model.js';

/** פריט שהופעל בפריסה — קליק לניווט למקור (שלב 81; §13.2). */
export interface ItemActivation {
  readonly kind: 'line' | 'note-marker';
  readonly itemId: string;
  readonly pageId: string;
}

export interface PageViewProps {
  readonly page: LayoutPage;
  /**
   * תמונת מקור המסמך מזמן הריצה (resultStore.sourceAtRun) — נחוצה לשחזור
   * הטקסט הלוגי של הריצות (logicalTextOfRun; תיקון שורש 2026-11-09/ב').
   */
  readonly sourceText: string;
  /** כיוון העמוד — קובע את פרשנות המאפיינים הלוגיים (rtl לתורה). */
  readonly dir?: 'rtl' | 'ltr';
  /** שלב 81 — קליק על קו/סמן מדגיש את ה־SourceSpan בעורך (§13.2). */
  readonly onItemActivate?: (activation: ItemActivation) => void;
  /** שלב 81 — מזהי פריטים להדגשה (בחירה בעורך ⇐ הפריסה, דרך provenance). */
  readonly highlightItemIds?: ReadonlySet<string>;
}

function runStyle(r: RunViewModel): CSSProperties {
  // תיקון שורש 2026-11-09/ב' (מראות תווים באתר החי): הריצה מציגה את
  // הטקסט הלוגי (displayText מ-logicalTextOfRun) בכיוון הטבעי שלה —
  // הדפדפן מפעיל את UAX#9 בעצמו (סדר מילים, מראוי סוגריים, ספרות).
  // bidi-override+ltr על המחרוזת החזותית מראה כל מילה ("יורה דעה" נקרא
  // "הרוי העד" — אומת באתר החי במדידת מיקומי תווים). יישור: קו מוצדק
  // (fit) נמתח לרוחב תיבת הריצה כפי שהמנוע חילק על הרווחים; קו טבעי
  // עוגן בקצה ההתחלתי של הכיוון — ימין ל-rtl.
  const align: CSSProperties['textAlign'] = r.justified ? 'justify' : (r.direction === 'rtl' ? 'right' : 'left');
  return {
    position: 'absolute',
    insetInlineStart: `${r.insetInlineStartPx}px`,
    insetBlockStart: '0',
    inlineSize: `${r.inlineSizePx}px`,
    blockSize: '100%',
    fontSize: `${r.fontSizePx}px`,
    fontFamily: `"${r.fontFamily}"`,
    whiteSpace: 'pre',
    direction: r.direction,
    textAlign: align,
    ...(r.justified ? { textAlignLast: 'justify' as const } : {}),
  };
}

function renderRun(r: RunViewModel) {
  return (
    <span
      key={r.id}
      dir={r.direction}
      data-run-id={r.id}
      data-run-direction={r.direction}
      style={runStyle(r)}
    >
      {r.displayText}
    </span>
  );
}

/** סגנון הדגשת פריט מקושר (שלב 81) — מסגרת כחולה + רקע קל; inline כמו שאר העמוד. */
function highlightStyle(highlighted: boolean): CSSProperties {
  if (!highlighted) return {};
  return {
    outline: '2px solid rgba(37, 99, 235, 0.9)',
    outlineOffset: '-2px',
    background: 'rgba(37, 99, 235, 0.08)',
  };
}

export function PageView({ page, sourceText, dir = 'rtl', onItemActivate, highlightItemIds }: PageViewProps) {
  const model: PageViewModel = projectPage(page, sourceText);
  const clickable = onItemActivate !== undefined;
  const activateLine = (lineId: string): void => {
    onItemActivate?.({ kind: 'line', itemId: lineId, pageId: model.id });
  };
  const activateMarker = (markerId: string): void => {
    onItemActivate?.({ kind: 'note-marker', itemId: markerId, pageId: model.id });
  };
  return (
    <section
      className="tora-preview-page"
      dir={dir}
      data-page-id={model.id}
      data-page-kind={model.kind}
      data-parity={model.parity}
      data-physical-index={model.physicalIndex}
      {...(model.folio !== undefined ? { 'data-folio': model.folio } : {})}
      style={{
        position: 'relative',
        inlineSize: `${model.inlineSizePx}px`,
        blockSize: `${model.blockSizePx}px`,
        overflow: 'hidden',
        background: '#fff',
        color: '#000',
        boxSizing: 'border-box',
      }}
    >
      {model.regions.map((r) => (
        <div
          key={r.id}
          data-region-id={r.id}
          data-region-kind={r.kind}
          {...(r.columnIndex !== undefined ? { 'data-column-index': r.columnIndex } : {})}
          style={{
            position: 'absolute',
            insetInlineStart: `${r.insetInlineStartPx}px`,
            insetBlockStart: `${r.insetBlockStartPx}px`,
            inlineSize: `${r.inlineSizePx}px`,
            blockSize: `${r.blockSizePx}px`,
            boxSizing: 'border-box',
          }}
        />
      ))}
      {model.lines.map((l) => {
        const highlighted = highlightItemIds?.has(l.id) === true;
        return (
          <div
            key={l.id}
            data-fragment-id={l.id}
            data-source-id={l.blockId}
            data-region-id={l.regionId}
            data-item-kind="line"
            data-break-reason={l.breakReason}
            {...(highlighted ? { 'data-highlighted': 'true' } : {})}
            onClick={clickable ? () => activateLine(l.id) : undefined}
            style={{
              position: 'absolute',
              insetInlineStart: `${l.insetInlineStartPx}px`,
              insetBlockStart: `${l.insetBlockStartPx}px`,
              inlineSize: `${l.inlineSizePx}px`,
              blockSize: `${l.blockSizePx}px`,
              boxSizing: 'border-box',
              ...(clickable ? { cursor: 'pointer' } : {}),
              ...highlightStyle(highlighted),
            }}
          >
            {l.runs.map(renderRun)}
          </div>
        );
      })}
      {model.markers.map((m) => {
        const highlighted = highlightItemIds?.has(m.id) === true;
        return (
          <span
            key={m.id}
            dir="ltr"
            data-marker-id={m.id}
            data-note-id={m.noteId}
            data-item-kind="note-marker"
            {...(highlighted ? { 'data-highlighted': 'true' } : {})}
            onClick={clickable ? () => activateMarker(m.id) : undefined}
            style={{
              position: 'absolute',
              insetInlineStart: `${m.insetInlineStartPx}px`,
              insetBlockStart: `${m.insetBlockStartPx}px`,
              inlineSize: `${m.inlineSizePx}px`,
              blockSize: `${m.blockSizePx}px`,
              lineHeight: 1,
              whiteSpace: 'pre',
              fontFamily: m.fontFamily !== undefined ? `"${m.fontFamily}"` : undefined,
              ...(clickable ? { cursor: 'pointer' } : {}),
              ...highlightStyle(highlighted),
            }}
          >
            {m.label}
          </span>
        );
      })}
    </section>
  );
}
