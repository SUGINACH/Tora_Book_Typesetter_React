/**
 * render-links.test.ts — בדיקות שלב 72: הקישורים בהיטל ה-HTML (§15.1; פרק ט/M8).
 *
 * מה מוכח: שער השלב — "כל הקישורים תקינים ב-IR ובהיטלים":
 *   1. בלי LinkTable — הפלט זהה לקודם (התנהגות קיימת לא נשברת; goldens).
 *   2. עם LinkTable — סמן ההערה נושא data-link-id/kind/target-page (ההפניה
 *      הקדימה אל ההערה בעמודה הפיזי); עוגן הכותרת נושא data-link-target
 *      (החזרה ל-TOC).
 *   3. דטרמיניזם — אותם קלטים ⇐ אותם bytes, גם עם הקישורים.
 */
import { describe, expect, test } from 'vitest';
import {
  A4,
  buildLinkTable,
  createLayoutDocument,
  type LayoutDocument,
  type LinkEndpoint,
  makeLinkId,
  type PositionedRun,
  ptToLu,
  type Rect,
} from '@tora/layout-api';
import { renderHtml, type AssetManifest } from '../src/index.js';

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});

const ASSETS: AssetManifest = Object.freeze({
  schemaVersion: 1,
  fonts: Object.freeze([Object.freeze({ fontId: 'guttman-rashi-normal', family: 'Guttman Rashi', file: 'Guttman-Rashi-Normal.woff2', format: 'woff2' as const, contentSha256: 'a'.repeat(64) })]),
});

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x: x as never, y: y as never, width: w as never, height: h as never };
}

function makeRun(id: string, startLu: number, widthLu: number, text: string): PositionedRun {
  return {
    kind: 'run', id, font: FONT, fontSizeLu: ptToLu(12), direction: 'rtl',
    startLu: startLu as never, widthLu: widthLu as never, text,
    glyphs: [{ glyphId: 1, atomId: 'a:0' as never, clusterAtomIndex: 0, advanceLu: widthLu as never, xOffsetLu: 0 as never, yOffsetLu: 0 as never }],
    atomIds: ['a:0' as never], requestHash: 'b'.repeat(64),
  };
}

/** IR עם סמן הערה (noteId=fn-1) ועוגן כותרת (anchorId=h2|1). */
function makeLayout(): LayoutDocument {
  return createLayoutDocument({
    schemaVersion: 1,
    policyId: 'torah-v1',
    pages: [
      {
        id: 'page:1', physicalIndex: 1, printedFolio: 'א', parity: 'recto', kind: 'body',
        size: { width: A4.width, height: A4.height },
        regions: [{ id: 'page:1:col:0', kind: 'body-column', rect: rect(200000, 300000, 7000000, 9000000), columnIndex: 0 }],
        items: [
          {
            kind: 'note-marker', id: 'item:m1', noteId: 'fn-1', label: 'א', regionId: 'page:1:col:0',
            rect: rect(410000, 420000, 60000, 180000), baseline: 430000 as never,
            source: { documentId: 'd', stream: 'footnote', startUtf16: 0, endUtf16: 3 }, superscript: true,
          },
          {
            kind: 'anchor', id: 'item:a1', anchorId: 'h2|1' as never, regionId: 'page:1:col:0',
            rect: rect(410000, 500000, 60000, 60000),
            source: { documentId: 'd', stream: 'main', startUtf16: 10, endUtf16: 12 },
          },
        ],
      },
    ],
    anchors: [],
    transformations: [],
  } as never);
}

const bodyB1: LinkEndpoint = { kind: 'block', id: 'node:b1' };
const noteFn1: LinkEndpoint = { kind: 'note', id: 'fn-1', physicalPage: 12 };
const tocAnchor: LinkEndpoint = { kind: 'anchor', id: 'toc:h2|1' };
const headingH2: LinkEndpoint = { kind: 'heading', id: 'h2|1', physicalPage: 4 };

describe('שלב 72: הקישורים בהיטל ה-HTML — data-link-* מתוך LinkTable', () => {
  test('בלי LinkTable — הפלט זהה לקודם; אין תכונות data-link (goldens נשמרים)', () => {
    const a = renderHtml(makeLayout(), undefined, ASSETS);
    expect(a.html).not.toContain('data-link-');
  });

  test('עם LinkTable — סמן ההערה נושא data-link-id/kind/target-page; עוגן הכותרת — data-link-target', () => {
    const links = buildLinkTable([
      { linkId: makeLinkId('note', bodyB1, noteFn1), kind: 'note', source: bodyB1, target: noteFn1 },
      { linkId: makeLinkId('note-back', noteFn1, bodyB1), kind: 'note-back', source: noteFn1, target: bodyB1 },
      { linkId: makeLinkId('toc', tocAnchor, headingH2), kind: 'toc', source: tocAnchor, target: headingH2 },
      { linkId: makeLinkId('toc-back', headingH2, tocAnchor), kind: 'toc-back', source: headingH2, target: tocAnchor },
    ]);
    const { html } = renderHtml(makeLayout(), undefined, ASSETS, links);
    // סמן ההערה — ההפניה הקדימה
    const fwdId = makeLinkId('note', bodyB1, noteFn1);
    expect(html).toContain(`data-note-id="fn-1" data-link-id="${fwdId}" data-link-kind="note" data-link-target-page="12"`);
    // עוגן הכותרת — החזרה ל-TOC
    const backId = makeLinkId('toc-back', headingH2, tocAnchor);
    expect(html).toContain(`data-anchor-id="h2|1" data-link-id="${backId}" data-link-kind="toc-back" data-link-target="toc:h2|1"`);
  });

  test('דטרמיניזם — אותם IR ו-LinkTable ⇐ אותם bytes', () => {
    const links = buildLinkTable([
      { linkId: makeLinkId('note', bodyB1, noteFn1), kind: 'note', source: bodyB1, target: noteFn1 },
      { linkId: makeLinkId('note-back', noteFn1, bodyB1), kind: 'note-back', source: noteFn1, target: bodyB1 },
    ]);
    const a = renderHtml(makeLayout(), undefined, ASSETS, links);
    const b = renderHtml(makeLayout(), undefined, ASSETS, buildLinkTable([
      { linkId: makeLinkId('note', bodyB1, noteFn1), kind: 'note', source: bodyB1, target: noteFn1 },
      { linkId: makeLinkId('note-back', noteFn1, bodyB1), kind: 'note-back', source: noteFn1, target: bodyB1 },
    ]));
    expect(b.html).toBe(a.html);
  });

  test('קישור להערה שאין לה סמן בעמוד — הסמנים האחרים אינם נושאים תכונות', () => {
    const otherNote: LinkEndpoint = { kind: 'note', id: 'fn-99', physicalPage: 30 };
    const links = buildLinkTable([
      { linkId: makeLinkId('note', bodyB1, otherNote), kind: 'note', source: bodyB1, target: otherNote },
    ]);
    const { html } = renderHtml(makeLayout(), undefined, ASSETS, links);
    expect(html).toContain('data-note-id="fn-1"');
    expect(html).not.toContain('data-link-id');
  });
});
