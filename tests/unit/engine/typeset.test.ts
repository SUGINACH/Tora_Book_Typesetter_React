import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../../src/parser';
import { typesetDocument } from '../../../src/worker/engine/typeset-document';
import { SimulatedMeasurer } from '../../../src/worker/measurement/text-metrics';
import { fnv1a32 } from '../../../src/worker/inputs/fnv-hash';
import { defaultSettings } from '../../../src/lib/default-settings';
import type { Settings } from '../../../src/types';

const TEXT_WITH_FOOTNOTES = `שם הספר - ספר בדיקה
שם המחבר - מחבר
כותרת 1 - חלק ראשון
כותרת 2 מספר 1 - פרק א
כותרת 3 - סעיף
זוהי פסקה עם [הערת שוליים א] טקסט.
עוד פסקה בלי הערות.

כותרת 4 - תת-סעיף
פסקה נוספת [עוד הערה] כאן.`;

const TEXT_NO_METADATA = `כותרת 2 - פרק
פסקה ראשונה.
פסקה שנייה.`;

const TEXT_LONG = `כותרת 1 - חלק
כותרת 2 מספר 1 - פרק א
${'זוהי פסקה ארוכה לבדיקת עימוד. '.repeat(20)}
כותרת 2 מספר 2 - פרק ב
${'עוד פסקה ארוכה לבדיקה. '.repeat(20)}
כותרת 2 מספר 3 - פרק ג
${'פסקה שלישית לבדיקה. '.repeat(20)}`;

const measurer = new SimulatedMeasurer();

describe('engine — typesetDocument', () => {
  it('מייצר יותר מעמוד אחד לטקסט ארוך', () => {
    const doc = parseDocument(TEXT_LONG, defaultSettings);
    const result = typesetDocument(doc, defaultSettings, measurer);
    expect(result.pages.length).toBeGreaterThan(1);
  });

  it('מייצר עמוד שער ראשי כעמוד 1', () => {
    const doc = parseDocument(TEXT_WITH_FOOTNOTES, defaultSettings);
    const result = typesetDocument(doc, defaultSettings, measurer);
    expect(result.pages[0]?.pageType).toBe('main-shaar');
  });

  it('מייצר עמוד שער אחורי כעמוד 2', () => {
    const doc = parseDocument(TEXT_WITH_FOOTNOTES, defaultSettings);
    const result = typesetDocument(doc, defaultSettings, measurer);
    expect(result.pages[1]?.pageType).toBe('back-shaar');
  });

  it('H2 פותח עמוד chapter-opener', () => {
    const doc = parseDocument(TEXT_LONG, defaultSettings);
    const result = typesetDocument(doc, defaultSettings, measurer);
    const chapterPages = result.pages.filter(p => p.pageType === 'chapter-opener');
    expect(chapterPages.length).toBeGreaterThan(0);
  });

  it('מייצר hash דטרמיניסטי', () => {
    const doc = parseDocument(TEXT_WITH_FOOTNOTES, defaultSettings);
    const r1 = typesetDocument(doc, defaultSettings, measurer);
    const r2 = typesetDocument(doc, defaultSettings, measurer);
    const h1 = fnv1a32(r1.pages.map(p => p.html).join(''));
    const h2 = fnv1a32(r2.pages.map(p => p.html).join(''));
    expect(h1).toBe(h2);
  });

  it('ללא metadata — אין עמוד שער', () => {
    const doc = parseDocument(TEXT_NO_METADATA, defaultSettings);
    const result = typesetDocument(doc, defaultSettings, measurer);
    const shaarPages = result.pages.filter(p =>
      p.pageType === 'main-shaar' || p.pageType === 'back-shaar'
    );
    expect(shaarPages.length).toBe(0);
  });

  it('פלט HTML אינו ריק', () => {
    const doc = parseDocument(TEXT_WITH_FOOTNOTES, defaultSettings);
    const result = typesetDocument(doc, defaultSettings, measurer);
    for (const page of result.pages) {
      // עמודי שער עשויים להיות קצרים, אבל עמודי תוכן חייבים תוכן
      if (page.pageType === 'regular' || page.pageType === 'chapter-opener') {
        expect(page.html.length).toBeGreaterThan(50);
      }
    }
  });

  it('הערות שוליים מזוהות בעמודים', () => {
    const doc = parseDocument(TEXT_WITH_FOOTNOTES, defaultSettings);
    expect(doc.footnotes.length).toBeGreaterThan(0);
  });

  it('שינוי גודל גופן משנה את מספר העמודים או נשאר דטרמיניסטי', () => {
    const doc = parseDocument(TEXT_LONG, defaultSettings);
    const r1 = typesetDocument(doc, defaultSettings, measurer);

    const bigFontSettings: Settings = {
      ...defaultSettings,
      typography: {
        ...defaultSettings.typography,
        bodyFont: { ...defaultSettings.typography.bodyFont, size: 16 },
      },
    };
    const r2 = typesetDocument(doc, bigFontSettings, measurer);

    // גופן גדול יותר → פחות טקסט בכל עמוד → יותר עמודים (או שווה)
    expect(r2.pages.length).toBeGreaterThanOrEqual(r1.pages.length);

    // כל אחד דטרמיניסטי בפני עצמו
    const h1 = fnv1a32(r1.pages.map(p => p.html).join(''));
    const h1b = fnv1a32(typesetDocument(doc, defaultSettings, measurer).pages.map(p => p.html).join(''));
    expect(h1).toBe(h1b);
  });
});
