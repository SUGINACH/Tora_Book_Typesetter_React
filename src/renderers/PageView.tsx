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

export interface PageViewProps {
  readonly page: LayoutPage;
  /** כיוון העמוד — קובע את פרשנות המאפיינים הלוגיים (rtl לתורה). */
  readonly dir?: 'rtl' | 'ltr';
}

function runStyle(r: RunViewModel): CSSProperties {
  return {
    position: 'absolute',
    insetInlineStart: `${r.insetInlineStartPx}px`,
    insetBlockStart: '0',
    inlineSize: `${r.inlineSizePx}px`,
    blockSize: '100%',
    fontSize: `${r.fontSizePx}px`,
    fontFamily: `"${r.fontFamily}"`,
    whiteSpace: 'pre',
  };
}

function renderRun(r: RunViewModel) {
  return (
    <span
      key={r.id}
      dir={r.direction}
      data-run-id={r.id}
      style={runStyle(r)}
    >
      {r.text}
    </span>
  );
}

export function PageView({ page, dir = 'rtl' }: PageViewProps) {
  const model: PageViewModel = projectPage(page);
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
      {model.lines.map((l) => (
        <div
          key={l.id}
          data-fragment-id={l.id}
          data-source-id={l.blockId}
          data-region-id={l.regionId}
          style={{
            position: 'absolute',
            insetInlineStart: `${l.insetInlineStartPx}px`,
            insetBlockStart: `${l.insetBlockStartPx}px`,
            inlineSize: `${l.inlineSizePx}px`,
            blockSize: `${l.blockSizePx}px`,
            boxSizing: 'border-box',
          }}
        >
          {l.runs.map(renderRun)}
        </div>
      ))}
      {model.markers.map((m) => (
        <span
          key={m.id}
          dir="ltr"
          data-note-id={m.noteId}
          style={{
            position: 'absolute',
            insetInlineStart: `${m.insetInlineStartPx}px`,
            insetBlockStart: `${m.insetBlockStartPx}px`,
            inlineSize: `${m.inlineSizePx}px`,
            blockSize: `${m.blockSizePx}px`,
            lineHeight: 1,
            whiteSpace: 'pre',
          }}
        >
          {m.label}
        </span>
      ))}
    </section>
  );
}
