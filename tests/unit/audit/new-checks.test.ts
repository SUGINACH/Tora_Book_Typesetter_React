import { describe, it, expect } from 'vitest';
import { auditGeometry, auditGeometryWithDoc } from '../../../src/audit/geometry-audit';
import type { RenderedPage, Settings } from '../../../src/types';
import { defaultSettings } from '../../../src/lib/default-settings';

const settings: Settings = defaultSettings;

function makePage(
  pageNumber: number,
  columns: { index: 0 | 1; height: number; blockCount: number; lineCount: number; width?: number }[],
  html = '',
  pageType: 'regular' | 'chapter-opener' = 'regular'
): RenderedPage {
  return {
    pageNumber, pageType,
    html: html || `<div class="tora-page" data-page="${pageNumber}">content</div>`,
    geometry: {
      width: 210, height: 297,
      columns: columns.map(c => ({ index: c.index, height: c.height, blockCount: c.blockCount, lineCount: c.lineCount, width: c.width ?? 80 })),
      hasShaar: false,
    },
  };
}

describe('audit V21 new checks', () => {
  it('checkHeadingEscort — מסמן כשמעט שורות יחסית לבלוקים', () => {
    const page = makePage(1, [{ index: 0, height: 100, blockCount: 3, lineCount: 4 }]);
    const f = auditGeometry([page], settings);
    expect(f.some(x => x.description.includes('heading-escort'))).toBe(true);
  });

  it('checkHeadingEscort — לא מסמן כשהרבה שורות', () => {
    const page = makePage(1, [
      { index: 0, height: 500, blockCount: 3, lineCount: 25 },
      { index: 1, height: 500, blockCount: 3, lineCount: 25 },
    ]);
    const f = auditGeometry([page], settings);
    expect(f.some(x => x.description.includes('heading-escort'))).toBe(false);
  });

  it('checkPageUnderfill — מסמן עמוד לא מלא', () => {
    const page = makePage(1, [
      { index: 0, height: 200, blockCount: 2, lineCount: 10 },
      { index: 1, height: 200, blockCount: 2, lineCount: 10 },
    ]);
    const f = auditGeometry([page], settings);
    expect(f.some(x => x.description.includes('לא מלא'))).toBe(true);
  });

  it('checkPageUnderfill — לא מסמן chapter-opener', () => {
    const page = makePage(1, [{ index: 0, height: 100, blockCount: 1, lineCount: 2 }], '', 'chapter-opener');
    const f = auditGeometry([page], settings);
    expect(f.some(x => x.description.includes('לא מלא'))).toBe(false);
  });

  it('checkBlockGap — מסמן חשד ריווח גדול', () => {
    const page = makePage(1, [
      { index: 0, height: 500, blockCount: 2, lineCount: 3 },
      { index: 1, height: 500, blockCount: 2, lineCount: 3 },
    ]);
    const f = auditGeometry([page], settings);
    expect(f.some(x => x.description.includes('block-gap'))).toBe(true);
  });

  it('checkMultipleBlocks — מסמן שני טורים עמוסים', () => {
    const page = makePage(1, [
      { index: 0, height: 800, blockCount: 4, lineCount: 30 },
      { index: 1, height: 800, blockCount: 4, lineCount: 30 },
    ]);
    const f = auditGeometry([page], settings);
    expect(f.some(x => x.description.includes('multiple-blocks'))).toBe(true);
  });

  it('audit pure function — לא משנה input', () => {
    const page = makePage(1, [{ index: 0, height: 500, blockCount: 3, lineCount: 25 }]);
    const before = JSON.parse(JSON.stringify(page));
    auditGeometry([page], settings);
    expect(JSON.parse(JSON.stringify(page))).toEqual(before);
  });

  it('auditGeometryWithDoc — לא קורס ללא doc', () => {
    const page = makePage(1, [{ index: 0, height: 500, blockCount: 3, lineCount: 25 }]);
    expect(auditGeometryWithDoc([page], settings, undefined).length).toBeGreaterThan(0);
  });

  it('audit — דטרמיניסטי', () => {
    const page = makePage(1, [{ index: 0, height: 100, blockCount: 1, lineCount: 2 }]);
    const r1 = auditGeometry([page], settings);
    const r2 = auditGeometry([page], settings);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
