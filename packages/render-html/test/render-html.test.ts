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

/**
 * מקור הבדיקה — מכיל את כל טקסטי הריצות להלן;‏ makeRun מקודד טווח מקור
 * אמיתי (atom:v1|…|<start>+<end>|src|0) כך ש-logicalTextOfRun משחזר
 * בדיוק את text מ-TEST_SOURCE — כמו האטומים האמיתיים מהמנוע.
 */
const TEST_SOURCE = 'שלום <עולם> "וציטוט" שורה מוצדקת שורת סיום latin tail מלה    אחרת שלום עולם תוכן הערה לדוגמה כותרת לעמוד הערות פרט גם   tail';

function makeRun(id: string, startLu: number, widthLu: number, text: string): PositionedRun {
  if (TEST_SOURCE.indexOf(text) < 0) throw new Error(`טקסט הבדיקה חסר ב-TEST_SOURCE: ${text}`);
  return {
    kind: 'run', id, font: FONT, fontSizeLu: ptToLu(12), direction: 'rtl',
    startLu: startLu as never, widthLu: widthLu as never, text,
    glyphs: [{ glyphId: 1, atomId: 'a:0' as never, clusterAtomIndex: 0, advanceLu: widthLu as never, xOffsetLu: 0 as never, yOffsetLu: 0 as never }],
    atomIds: [`atom:v1|test|body|${TEST_SOURCE.indexOf(text)}+${TEST_SOURCE.indexOf(text) + text.length}|src|0` as never], requestHash: 'b'.repeat(64),
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
    const a = renderHtml(makeLayout(), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const reparsed = parseLayoutDocument(serializeLayoutDocument(makeLayout()));
    const b = renderHtml(reparsed, undefined, ASSETS, undefined, { source: TEST_SOURCE });
    expect(b.html).toBe(a.html);
    expect(b.css).toBe(a.css);
  });

  test('סדר מפתחות שונה ב-IR ⇐ אותם bytes (קנוניזציה של ההיטל)', () => {
    const a = renderHtml(makeLayout(), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const raw = JSON.parse(JSON.stringify(makeLayout()));
    const rev = JSON.parse(JSON.stringify(raw), (_k, v) => (typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse())
      : v));
    const b = renderHtml(createLayoutDocument(rev), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    expect(b.html).toBe(a.html);
  });

  test('שינוי IR ⇒ bytes שונים (ההיטל נאמן ל-IR)', () => {
    const a = renderHtml(makeLayout('א'), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const b = renderHtml(makeLayout('ב'), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    expect(b.html).not.toBe(a.html);
  });
});

describe('שלב 37: טוהר וביטחון', () => {
  test('escaping: תוכן משתמש אינו נכנס כ-HTML', () => {
    const out = renderHtml(makeLayout(), undefined, ASSETS, undefined, { source: TEST_SOURCE });
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
    const out = renderHtml(makeLayout(), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    expect(out.html).toContain('data-page-id="page:1"');
    expect(out.html).toContain('data-fragment-id="item:l1"');
    expect(out.html).toContain('data-source-id="node:b1"');
    expect(out.html).toContain('data-note-id="fn-1"');
    // 12pt = 16px (רציונלי, לא 3.7795·מ״מ)
    expect(out.html).toContain('font-size:16px');
  });
});

// ───────── תיקון שורש 2026-11-09/ב' — מראות תווים באתר החי ─────────
//
// הוכחות-נפל לפצעי ההיטל שנתגלו באתר החי של Pages:
//   (א) bidi-override+ltr על המחרוזת החזותית (אטומים שמאל→ימין, תווים
//       לוגיים) ⇒ הדפדפן הציג כל מילה מראה ("יורה דעה" נקרא "הרוי העד").
//       הריצות חייבות טקסט לוגי + כיוון טבעי.
//   (ב) מרכאות כפולות בתוך מאפיין style כפול-מרכאות חתכו את המאפיין —
//       הגופן נפל לברירת המחדל (Times) בכל preview.html שהופק אי-פעם.
//   (ג) קו justify נמתח במנוע על הרווחים — ההיטל חייב לשחזר את המתיחה
//       (text-align/-last: justify) אחרת הקו לא מילא את תיבתו.

describe('תיקון 2026-11-09: בי-די, גופן וריווח בהיטל', () => {
  function makeLine(id: string, breakReason: 'fit' | 'paragraph-end', dir: 'rtl' | 'ltr', text: string): never {
    const run: PositionedRun = {
      ...makeRun(`run:${id}`, 0, 400000, text),
      direction: dir,
    };
    return {
      kind: 'line', id, blockId: 'node:b1', fragmentIndex: 0, lineIndex: 0, regionId: 'page:1:col:0',
      rect: rect(200000, 300000, 7000000, 300000), baseline: 450000 as never,
      runs: [run],
      sourceSpans: [], breakReason, continuation: 'whole',
    } as never;
  }

  function layoutWith(lines: never[]): LayoutDocument {
    return createLayoutDocument({
      schemaVersion: 1,
      policyId: 'torah-v1',
      pages: [
        {
          id: 'page:1', physicalIndex: 1, printedFolio: 'א', parity: 'recto', kind: 'body',
          size: { width: A4.width, height: A4.height },
          regions: [{ id: 'page:1:col:0', kind: 'body-column', rect: rect(200000, 300000, 7000000, 9000000), columnIndex: 0 }],
          items: [
            ...lines,
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

  test('ריצה מוצגת בכיוון הטבעי שלה, בלי bidi-override — הדפדפן מפעיל UAX#9 (מראות תווים)', () => {
    const out = renderHtml(layoutWith([makeLine('item:l1', 'fit', 'rtl', 'שלום עולם')]), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const start = out.html.indexOf('class="tora-run"');
    const runSpan = out.html.slice(start, out.html.indexOf('</span>', start));
    expect(runSpan).toContain('dir="rtl"');
    expect(runSpan).toContain('direction:rtl');
    expect(runSpan).toContain('data-run-direction="rtl"');
    // אין override — bidi-override+ltr על המחרוזת החזותית מראה כל מילה
    // ("יורה דעה" נקרא "הרוי העד"; אומת באתר החי במדידת מיקומי תווים)
    expect(runSpan).not.toContain('unicode-bidi');
    // ריצת ltr — כיוון טבעי משלה
    const out2 = renderHtml(layoutWith([makeLine('item:l2', 'paragraph-end', 'ltr', 'latin tail')]), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const start2 = out2.html.indexOf('class="tora-run"');
    const ltrSpan = out2.html.slice(start2, out2.html.indexOf('</span>', start2));
    expect(ltrSpan).toContain('dir="ltr"');
    expect(ltrSpan).toContain('direction:ltr');
  });

  test('גופן הריצה תחום בגרש בודד — מרכאות כפולות חתכו את מאפיין ה-style (404 שקט לגופן)', () => {
    const out = renderHtml(layoutWith([makeLine('item:l1', 'fit', 'rtl', 'שלום')]), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    expect(out.html).toContain(`font-family:'tora-guttman-rashi-normal'`);
    // בתוך מאפיין style (הקשר התקלה) אסור מרכאות כפולות סביב שם משפחה —
    // הן חתכו את המאפיין. בלוק ה־<style> (buildCss) חוקי ונבדק בנפרד למטה.
    const attr = out.html.slice(out.html.indexOf('class="tora-run"'));
    const styleAttr = attr.slice(attr.indexOf('style="'), attr.indexOf('">'));
    expect(styleAttr).not.toContain('font-family:"');
  });

  test('קו fit (justify) נמתח לרוחב התיבה; קו טבעי rtl עוגן בימין; קו טבעי ltr בשמאל', () => {
    const out = renderHtml(layoutWith([
      makeLine('item:l-fit', 'fit', 'rtl', 'שורה מוצדקת'),
      makeLine('item:l-end', 'paragraph-end', 'rtl', 'שורת סיום'),
      makeLine('item:l-ltr', 'paragraph-end', 'ltr', 'latin tail'),
    ]), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const spanOf = (marker: string): string => {
      const start = out.html.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      return out.html.slice(start, out.html.indexOf('</span>', start));
    };
    const fitRun = spanOf('data-run-id="run:item:l-fit"');
    expect(fitRun).toContain('text-align:justify');
    expect(fitRun).toContain('text-align-last:justify');
    const endRun = spanOf('data-run-id="run:item:l-end"');
    expect(endRun).toContain('text-align:right');
    expect(endRun).not.toContain('text-align-last');
    const ltrRun = spanOf('data-run-id="run:item:l-ltr"');
    expect(ltrRun).toContain('text-align:left');
  });

  test('סמן הערה עוגן למשפחת ה-manifest — לא לגופן ברירת המחדל של הדפדפן', () => {
    const out = renderHtml(layoutWith([makeLine('item:l1', 'fit', 'rtl', 'שלום')]), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const marker = out.html.slice(out.html.indexOf('class="tora-note-marker"'), out.html.indexOf('</span>', out.html.indexOf('class="tora-note-marker"')));
    expect(marker).toContain(`font-family:'tora-guttman-rashi-normal'`);
    // בלי manifest אין עיגון — התנהגות קיימת נשמרת
    const noManifest = renderHtml(layoutWith([makeLine('item:l1', 'fit', 'rtl', 'שלום')]), undefined, undefined, undefined, { source: TEST_SOURCE });
    const markerNoManifest = noManifest.html.slice(noManifest.html.indexOf('class="tora-note-marker"'), noManifest.html.indexOf('</span>', noManifest.html.indexOf('class="tora-note-marker"')));
    expect(markerNoManifest).not.toContain('font-family');
  });

  test('רווחי סוף-הקו המאופסים (trailingZero) לא מוצגים — חיתוך U+0020 מהריצה השמאלית בלבד', () => {
    // שתי ריצות בקו: הראשונה (השמאלית) נושאת "  " בראש המחרוזת = סוף הקו
    // החזותי — המנוע איפס את הקידום שלהן; השנייה פנימית והרווח שלה אמיתי.
    const line = makeLine('item:l-trim', 'fit', 'rtl', 'שלום');
    const firstRun: PositionedRun = { ...makeRun('run:left', 0, 100000, 'מלה   ') };
    const innerRun: PositionedRun = { ...makeRun('run:inner', 100000, 300000, ' אחרת ') };
    const withRuns = { ...line, runs: [firstRun, innerRun] } as never;
    const out = renderHtml(layoutWith([withRuns]), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const leftSpan = out.html.slice(out.html.indexOf('data-run-id="run:left"'), out.html.indexOf('</span>', out.html.indexOf('data-run-id="run:left"')));
    expect(leftSpan).toContain('>מלה');
    expect(leftSpan).not.toContain('מלה   ');
    const innerSpan = out.html.slice(out.html.indexOf('data-run-id="run:inner"'), out.html.indexOf('</span>', out.html.indexOf('data-run-id="run:inner"')));
    expect(innerSpan).toContain('> אחרת ');
    // ריצת ltr שמאלית — רווחי סוף-קו בראש הלוגי (ראש חזותי === ראש לוגי)
    const ltrLine = makeLine('item:l-trim-ltr', 'paragraph-end', 'ltr', 'שלום');
    const ltrRun: PositionedRun = { ...makeRun('run:left-ltr', 0, 100000, '   tail'), direction: 'ltr' };
    const out2 = renderHtml(layoutWith([{ ...ltrLine, runs: [ltrRun] }]), undefined, ASSETS, undefined, { source: TEST_SOURCE });
    const ltrSpan = out2.html.slice(out2.html.indexOf('data-run-id="run:left-ltr"'), out2.html.indexOf('</span>', out2.html.indexOf('data-run-id="run:left-ltr"')));
    expect(ltrSpan).toContain('>tail');
    expect(ltrSpan).not.toContain('>   tail');
  });
});
