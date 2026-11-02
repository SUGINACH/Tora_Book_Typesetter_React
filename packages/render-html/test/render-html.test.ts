/**
 * render-html.test.ts — בדיקות שלב 37 (§15.1).
 *
 * מה מוכח: קנוניות (אותו IR ⇐ ביט-ביט); טוהר (אין document/measure — הרינדור
 * ב-Node בלבד); escaping; עיגון גופנים לפי manifest; ממדים מה-IR בלבד.
 */
import { describe, expect, test } from 'vitest';
import {
  A4,
  createLayoutDocument,
  type LayoutDocument,
  parseLayoutDocument,
  serializeLayoutDocument,
  type PositionedRun,
  ptToLu,
  type Rect,
} from '@tora/layout-api';
import { buildCss, escapeAttr, escapeHtmlText, renderHtml, type AssetManifest } from '../src/index.js';

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

function makeLayout(folio: string = 'א'): LayoutDocument {
  return createLayoutDocument({
    schemaVersion: 1,
    policyId: 'torah-v1',
    pages: [
      {
        id: 'page:1', physicalIndex: 1, printedFolio: folio, parity: 'recto', kind: 'body',
        size: { width: A4.width, height: A4.height },
        regions: [{ id: 'page:1:col:0', kind: 'body-column', rect: rect(200000, 300000, 7000000, 9000000), columnIndex: 0 }],
        items: [
          {
            kind: 'line', id: 'item:l1', blockId: 'node:b1', fragmentIndex: 0, lineIndex: 0, regionId: 'page:1:col:0',
            rect: rect(200000, 300000, 7000000, 300000), baseline: 450000 as never,
            runs: [makeRun('run:1', 0, 400000, 'שלום <עולם> "וציטוט"')],
            sourceSpans: [], breakReason: 'fit', continuation: 'whole',
          },
          {
            kind: 'note-marker', id: 'item:m1', noteId: 'fn-1', label: 'א', regionId: 'page:1:col:0',
            rect: rect(410000, 420000, 60000, 180000), baseline: 430000 as never,
            source: { documentId: 'd', stream: 'footnote', startUtf16: 0, endUtf16: 3 }, superscript: true,
          },
        ],
      },
    ],
    anchors: [],
    transformations: [],
  } as never);
}

describe('שלב 37: render-html v1 — קנוניות', () => {
  test('אותו IR (round-trip) ⇐ ביט-ביט אותם bytes', () => {
    const a = renderHtml(makeLayout(), undefined, ASSETS);
    const reparsed = parseLayoutDocument(serializeLayoutDocument(makeLayout()));
    const b = renderHtml(reparsed, undefined, ASSETS);
    expect(b.html).toBe(a.html);
    expect(b.css).toBe(a.css);
  });

  test('סדר מפתחות שונה ב-IR ⇐ אותם bytes (קנוניזציה של ההיטל)', () => {
    const a = renderHtml(makeLayout(), undefined, ASSETS);
    const raw = JSON.parse(JSON.stringify(makeLayout()));
    const rev = JSON.parse(JSON.stringify(raw), (_k, v) => (typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse())
      : v));
    const b = renderHtml(createLayoutDocument(rev), undefined, ASSETS);
    expect(b.html).toBe(a.html);
  });

  test('שינוי IR ⇒ bytes שונים (ההיטל נאמן ל-IR)', () => {
    const a = renderHtml(makeLayout('א'), undefined, ASSETS);
    const b = renderHtml(makeLayout('ב'), undefined, ASSETS);
    expect(b.html).not.toBe(a.html);
  });
});

describe('שלב 37: טוהר וביטחון', () => {
  test('escaping: תוכן משתמש אינו נכנס כ-HTML', () => {
    const out = renderHtml(makeLayout(), undefined, ASSETS);
    expect(out.html).toContain('שלום &lt;עולם&gt; &quot;וציטוט&quot;');
    expect(out.html).not.toContain('<עולם>');
  });

  test('escapeAttr מנקה מרכאות', () => {
    expect(escapeAttr('a"b<c')).toBe('a&quot;b&lt;c');
    expect(escapeHtmlText('x&y')).toBe('x&amp;y');
  });

  test('אין גישה ל-document/window/print — קוד המקור נקי', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../src/render.ts'), 'utf8');
    expect(src).not.toContain('document.');
    expect(src).not.toContain('window.');
    expect(src).not.toContain('getComputedStyle');
    for (const bad of ['3.7795']) expect(src).not.toContain(bad);
  });

  test('גופנים עוגנים לפי manifest — @font-face עם src קבוע; אין גופן רשת', () => {
    const css = buildCss(ASSETS);
    expect(css).toContain('@font-face{font-family:"tora-guttman-rashi-normal"');
    expect(css).toContain('src:url("fonts/Guttman-Rashi-Normal.woff2") format("woff2")');
    expect(css).not.toContain('http://');
    expect(css).not.toContain('https://');
  });

  test('בלי manifest — אין @font-face כלל (מתועד; גופני הרשת אסורים)', () => {
    const css = buildCss(undefined);
    expect(css).not.toContain('@font-face');
  });
});

describe('שלב 37: ממדים מה-IR', () => {
  test('כל עמוד וקו מקבלים ממדים מה-IR; ההמרה רציונלית', () => {
    const out = renderHtml(makeLayout(), undefined, ASSETS);
    expect(out.html).toContain('data-page-id="page:1"');
    expect(out.html).toContain('data-fragment-id="item:l1"');
    expect(out.html).toContain('data-source-id="node:b1"');
    expect(out.html).toContain('data-note-id="fn-1"');
    // 12pt = 16px (רציונלי, לא 3.7795·מ״מ)
    expect(out.html).toContain('font-size:16px');
  });
});
