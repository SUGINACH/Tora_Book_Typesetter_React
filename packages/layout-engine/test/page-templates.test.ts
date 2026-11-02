/**
 * page-templates.test.ts — בדיקות שלב 50: תבניות עמוד, parity ובניית
 * אזורים (אפיון §9.3, §5, §11.1, §11.2, §6.1; פרק ז/M6).
 *
 * מה מוכח כאן:
 *   1. **סט מלא**: 12 תבניות (6 סוגים × recto/verso); מזהים קנוניים;
 *      for() בוחר לפי parity שנגזר מהאינדקס (אי-זוגי=recto).
 *   2. **מבנה recto/verso**: תבנית body — header למעלה, שני טורים
 *      (ימין 0 ואז שמאל 1; §9.3#3), footer, עוגן הערות; הכלה בעמוד;
 *      אין חפיפות בין אזורים סטטיים; הגאומטריה תואמת את נוסחאות v0
 *      הנעולות (A4, 25mm, 5% gap).
 *   3. **same_as_even**: verso גאומטרית זהה (פוליו מרכזי, בלי הערות צד)
 *      ⇒ sameAs מתועד; פוליו-חוץ או אזור חיצוני ⇒ אין sameAs (הבדל
 *      אמיתי).
 *   4. **עמודי שער**: העמוד כולו ornament+custom-box; הנכס מקושר לפי
 *      מזהה ו־sha256 (§11.2); אין פוליו.
 *   5. **אזורי notes**: עוגן ההערות — מלבן המיקום המרבי בתחתית התוכן,
 *      טורי fn-columns; הוא אינו אזור סטטי (גובהו נקבע בחיפוש — §9.3#5).
 *   6. **חפיפות**: pageTemplateIssues תופס אזורים חופפים, מחוץ לעמוד,
 *      columnIndex כפול, id לא-קנוני.
 *   7. **הצבה על עמוד פיזי**: מזהים קנוניים תואמי v0 (page:{N}:col:0,
 *      page:{N}:notes); initialRemainingByRegion נותן מלוא הגובה לכל
 *      אזור + תקציב עוגן ההערות; תואם לחוזה של PaginationState (שלב 49).
 *   8. **אין תבנית בלתי-מדודה**: גבהי header/footer לא-חיוביים ⇒ שגיאה
 *      מקוטלגת; אין ברירת מחדל שקטה.
 *   9. **צד חיצוני לפי parity** (RTL): recto=שמאל, verso=ימין — אזור
 *      ההערות החיצוני ממוקם בהתאם כשמוגדר רוחב.
 *  10. דטרמיניזם: בנייה כפולה ⇐ אותם מלבנים בדיוק.
 */
import { describe, expect, test } from 'vitest';
import { asLu, mmToLu, A4, type LayoutUnit } from '@tora/layout-api';
import { readV0Settings } from '../src/v0/v0-settings.js';
import { LayoutEngineError } from '../src/errors.js';
import {
  buildPageTemplateSet,
  initialRemainingByRegion,
  instantiatePageRegions,
  notesRegionIdOf,
  outerSideOf,
  pageTemplateIssues,
  templateShowsFolio,
  type PageTemplateSet,
  type TemplateSetInput,
} from '../src/pagination/templates.js';
import { initialPaginationState } from '../src/pagination/state.js';

// הגדרות אפקטיביות מינימליות — readV0Settings קורא מפתחות המנוע הנעולים
function baseSettings(): Record<string, unknown> {
  return {
    'size-body': 16,
    'line-height-body': 1.5,
    'note-marker-size': 11,
    'prop-margin': 7.5,
    'fn-reset-mode': 'page',
    'page-num-format': 'gematria',
    'page-num-initial-value': 1,
    'note-marker-type': 'super',
  };
}

const HEADER_LU = asLu(30000); // ~0.46pt שורת כותרת מדודה (קלט מדוד — לא קבוע של תבנית)
const FOOTER_LU = asLu(26000);

function templateInput(overrides: Partial<TemplateSetInput> = {}): TemplateSetInput {
  const v0 = readV0Settings({ values: baseSettings(), configHash: '0'.repeat(64) } as never);
  return {
    geometry: v0.geometry,
    headerHeightLu: HEADER_LU,
    footerHeightLu: FOOTER_LU,
    columns: 2,
    footnoteColumns: 1,
    folioPosition: 'bottom_center',
    showFolio: true,
    sidenoteWidthLu: null,
    ...overrides,
  };
}

let set: PageTemplateSet = buildPageTemplateSet(templateInput());

describe('שלב 50 — תבניות עמוד, parity ובניית אזורים (§9.3)', () => {
  test('סט מלא: 12 תבניות (6 סוגים × 2 parity); מזהים קנוניים; for() לפי אינדקס', () => {
    expect(set.byId.size).toBe(12);
    for (const kind of ['main-shaar', 'back-shaar', 'sub-shaar', 'toc', 'body', 'notes'] as const) {
      for (const parity of ['recto', 'verso'] as const) {
        const t = set.byId.get(`tpl:${kind}:${parity}`);
        expect(t, `tpl:${kind}:${parity}`).toBeDefined();
        expect(t!.kind).toBe(kind);
        expect(t!.parity).toBe(parity);
      }
    }
    // parity נגזר מהאינדקס: אי-זוגי=recto, זוגי=verso (IR §6.5)
    expect(set.for('body', 1).parity).toBe('recto');
    expect(set.for('body', 2).parity).toBe('verso');
    expect(set.for('body', 7).parity).toBe('recto');
    expect(() => set.for('body', 0)).toThrow(LayoutEngineError);
    expect(() => set.for('nope' as never, 1)).toThrow(LayoutEngineError);
  });

  test('מבנה תבנית body: header, שני טורים (ימין 0 ואז שמאל 1), footer, עוגן הערות; גאומטריית v0', () => {
    const v0 = readV0Settings({ values: baseSettings(), configHash: '0'.repeat(64) } as never);
    const g = v0.geometry;
    const t = set.for('body', 1);
    const roles = t.regions.map((r) => r.role);
    expect(roles).toEqual(['header', 'body-column', 'body-column', 'footer']);
    // טור ימין (0) שמאלי מטור שמאל (1)? — RTL: טור 0 = הקצה הימני של האזור
    const col0 = t.regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!;
    const col1 = t.regions.find((r) => r.role === 'body-column' && r.columnIndex === 1)!;
    expect(col0.rect.x).toBe(g.mainX + g.columnWidth + g.columnGap); // ימין
    expect(col1.rect.x).toBe(g.mainX); // שמאל
    expect(col0.rect.width).toBe(g.columnWidth);
    expect(col0.rect.y).toBe(g.contentTop + HEADER_LU);
    expect(col0.rect.height).toBe(g.contentBottom - FOOTER_LU - (g.contentTop + HEADER_LU));
    // header בראש התוכן, footer בתחתיתו — גבהים מדודים שהוזרקו
    const header = t.regions.find((r) => r.role === 'header')!;
    const footer = t.regions.find((r) => r.role === 'footer')!;
    expect(header.rect.height).toBe(HEADER_LU);
    expect(footer.rect.height).toBe(FOOTER_LU);
    expect(footer.rect.y + footer.rect.height).toBe(g.contentBottom);
    // עוגן ההערות: מלוא התוכן — ההערות צומחות מלמטה בחיפוש (§9.3#5)
    expect(t.footnoteAnchor).toBeDefined();
    expect(t.footnoteAnchor!.rect.y).toBe(g.contentTop + HEADER_LU);
    expect(t.footnoteAnchor!.rect.height).toBe(col0.rect.height);
    expect(t.footnoteAnchor!.columns).toBe(1);
    // כל האזורים בתוך העמוד ואין חפיפות
    expect(pageTemplateIssues(t)).toEqual([]);
    // הפוליו מוצג בעמודי תוכן
    expect(templateShowsFolio(t)).toBe(true);
  });

  test('same_as_even: verso ראי כשאין הבדל גאומטרי; הבדל אמיתי ⇒ אין sameAs', () => {
    const mirrored = set.for('body', 2);
    expect(mirrored.sameAs).toBe('tpl:body:recto');
    // אותם מלבנים בדיוק (ראי גאומטרי)
    const recto = set.for('body', 1);
    expect(mirrored.regions.map((r) => r.rect)).toEqual(recto.regions.map((r) => r.rect));
    // פוליו-חוץ ⇒ הבדל פוטנציאלי ⇒ אין sameAs
    const outerSet = buildPageTemplateSet(templateInput({ folioPosition: 'bottom_outer' }));
    expect(outerSet.for('body', 2).sameAs).toBeUndefined();
    // הערות צד ⇒ אזור חיצוני בצד שונה ⇒ אין sameAs
    const sideSet = buildPageTemplateSet(templateInput({ sidenoteWidthLu: asLu(50000) }));
    expect(sideSet.for('body', 2).sameAs).toBeUndefined();
    expect(sideSet.for('body', 1).sameAs).toBeUndefined();
    // notes/shaar תמיד ראי (סימטריים גאומטרית)
    expect(set.for('notes', 2).sameAs).toBe('tpl:notes:recto');
    expect(set.for('main-shaar', 2).sameAs).toBe('tpl:main-shaar:recto');
  });

  test('עמודי שער: העמוד כולו ornament+custom-box; נכס לפי מזהה ו־sha256; אין פוליו', () => {
    const asset = {
      assetId: 'ext_1____________svg',
      sha256: 'e'.repeat(64),
      viewBox: { width: 2000, height: 2880 },
    };
    const shaarSet = buildPageTemplateSet(templateInput({
      shaarAssets: { 'main-shaar': asset, 'back-shaar': asset, 'sub-shaar': asset },
    }));
    const t = shaarSet.for('main-shaar', 1);
    const roles = t.regions.map((r) => r.role).sort();
    expect(roles).toEqual(['custom-box', 'ornament']);
    const ornament = t.regions.find((r) => r.role === 'ornament')!;
    expect(ornament.rect.width).toBe(A4.width);
    expect(ornament.rect.height).toBe(A4.height);
    expect(t.asset).toEqual(asset);
    expect(templateShowsFolio(t)).toBe(false);
    // בלי נכס — תבנית חוקית עם תיעוד ההיעדר (הנכס מקושר ב-M8 שלב 68)
    const noAsset = set.for('back-shaar', 1);
    expect(noAsset.asset).toBeUndefined();
    expect(pageTemplateIssues(noAsset)).toEqual([]);
  });

  test('אזור הערות: עוגן בלבד (לא אזור סטטי); fn-columns נישא; טורי הערות במילוי החיפוש', () => {
    const twoCols = buildPageTemplateSet(templateInput({ footnoteColumns: 2 }));
    expect(twoCols.for('body', 1).footnoteAnchor!.columns).toBe(2);
    expect(set.for('body', 1).footnoteAnchor!.columns).toBe(1);
    // העוגן אינו חלק מהאזורים הסטטיים — אסור חפיפה סטטית; הכרעת הפיצול בחיפוש
    const t = set.for('body', 1);
    expect(t.regions.some((r) => r.role === 'footnotes')).toBe(false);
    // notes pages — אין עוגן הערות (הן עצמן תוכן)
    expect(set.for('notes', 1).footnoteAnchor).toBeUndefined();
  });

  test('חפיפות ואימות: pageTemplateIssues תופס פגמים מבניים', () => {
    const good = set.for('body', 1);
    expect(pageTemplateIssues(good)).toEqual([]);
    const base = () => JSON.parse(JSON.stringify(good)) as typeof good;
    // אזורים חופפים
    const overlapping = base();
    (overlapping.regions[1] as { rect: { x: number } }).rect.x = overlapping.regions[2]!.rect.x;
    expect(pageTemplateIssues(overlapping).some((i) => i.startsWith('overlap:'))).toBe(true);
    // מחוץ לעמוד
    const outside = base();
    (outside.regions[1] as { rect: { x: number } }).rect.x = A4.width;
    expect(pageTemplateIssues(outside)).toContain('regions[1].rect:outside-page');
    // columnIndex כפול
    const dupCol = base();
    (dupCol.regions[2] as unknown as { columnIndex: number }).columnIndex = 0;
    expect(pageTemplateIssues(dupCol)).toContain('regions[2].columnIndex:duplicate');
    // id לא-קנוני
    const badId = base();
    (badId as { id: string }).id = 'tpl:weird:recto';
    expect(pageTemplateIssues(badId)).toContain('id');
    // גובה לא-חוקי
    const badRect = base();
    (badRect.regions[0] as { rect: { height: number } }).rect.height = 0;
    expect(pageTemplateIssues(badRect)).toContain('regions[0].rect.height');
    // עוגן הערות בסוג לא-תוכן
    const badAnchor = JSON.parse(JSON.stringify(set.for('notes', 1))) as typeof good & { footnoteAnchor?: unknown };
    badAnchor.footnoteAnchor = { rect: { x: 1, y: 1, width: 100, height: 100 }, columns: 1 };
    expect(pageTemplateIssues(badAnchor)).toContain('footnoteAnchor:not-content-kind');
    // makeTemplate דוחה בזמן בנייה
    expect(() => buildPageTemplateSet(templateInput({ headerHeightLu: asLu(-1) }))).toThrow(LayoutEngineError);
    expect(() => buildPageTemplateSet(templateInput({ columns: 3 as never }))).toThrow(LayoutEngineError);
    expect(() => buildPageTemplateSet(templateInput({ footnoteColumns: 0 as never }))).toThrow(LayoutEngineError);
    expect(() => buildPageTemplateSet(templateInput({ sidenoteWidthLu: asLu(-5) }))).toThrow(LayoutEngineError);
  });

  test('הצבה על עמוד פיזי: מזהים קנוניים תואמי v0; הזרמה ל-PaginationState', () => {
    const t = set.for('body', 3);
    const regions = instantiatePageRegions(t, 3);
    const ids = regions.map((r) => r.id);
    expect(ids).toEqual(['page:3:header', 'page:3:col:0', 'page:3:col:1', 'page:3:footer']);
    // המלבנים זהים לתבנית; המזהים קנוניים; הצבה כפולה ⇐ אותה תוצאה
    expect(instantiatePageRegions(t, 3)).toEqual(regions);
    expect(() => instantiatePageRegions(t, 0)).toThrow(LayoutEngineError);
    // נותרים: מלוא הגובה לכל אזור + תקציב עוגן ההערות תחת page:N:notes
    const remaining = initialRemainingByRegion(t, 3);
    expect(Object.keys(remaining).sort()).toEqual(['page:3:col:0', 'page:3:col:1', 'page:3:footer', 'page:3:header', 'page:3:notes'].sort());
    expect(remaining['page:3:notes']).toBe(t.footnoteAnchor!.rect.height);
    expect(remaining['page:3:col:0']).toBe(t.regions.find((r) => r.columnIndex === 0)!.rect.height);
    // הזרמה ל-PaginationState של שלב 49 — החוזה מתחבר: אותם מזהי אזורים
    const state = initialPaginationState({
      firstBlockId: 'body|1|para',
      remainingByRegion: remaining,
    });
    expect(state.physicalPageIndex).toBe(1);
    expect(Object.keys(state.remainingByRegion)).toEqual(Object.keys(remaining));
    expect(() => notesRegionIdOf(0)).toThrow(LayoutEngineError);
    expect(notesRegionIdOf(7)).toBe('page:7:notes');
  });

  test('צד חיצוני לפי parity (RTL): recto=שמאל, verso=ימין; אזור הערות החיצוני בהתאם', () => {
    expect(outerSideOf('recto')).toBe('left');
    expect(outerSideOf('verso')).toBe('right');
    const v0 = readV0Settings({ values: baseSettings(), configHash: '0'.repeat(64) } as never);
    const g = v0.geometry;
    const w = asLu(mmToLu(12)); // רוחב מדוד לאזור הערות החיצוני
    const sideSet = buildPageTemplateSet(templateInput({ sidenoteWidthLu: w }));
    const recto = sideSet.for('body', 1);
    const verso = sideSet.for('body', 2);
    const rectoOuter = recto.regions.find((r) => r.role === 'outer-notes')!;
    const versoOuter = verso.regions.find((r) => r.role === 'outer-notes')!;
    expect(rectoOuter.rect.x).toBe(g.mainX - w); // שמאל = מתחיל בקצה השמאלי של השוליים הפנימיים
    expect(versoOuter.rect.x).toBe(g.mainX + g.mainWidth); // ימין = מיד אחרי אזור הטורים
    expect(rectoOuter.rect.width).toBe(w);
    expect(versoOuter.rect.width).toBe(w);
    // אין חפיפה עם הטורים
    expect(pageTemplateIssues(recto)).toEqual([]);
    expect(pageTemplateIssues(verso)).toEqual([]);
    // רוחב חיצוני גדול מהשוליים — האזור מושמט במפורש (החוזה: רק מה שנכנס)
    const tooWide = buildPageTemplateSet(templateInput({ sidenoteWidthLu: asLu(g.mainX + 1) }));
    expect(tooWide.for('body', 1).regions.some((r) => r.role === 'outer-notes')).toBe(false);
  });

  test('עמודי notes: טור בודד ברוחב מלא כמו v0; header מדוד-אפס ⇒ אין אזור header', () => {
    const t = set.for('notes', 1);
    const col = t.regions.find((r) => r.role === 'body-column')!;
    expect(t.columns).toBe(1);
    expect(col.rect.x).toBe(t.regions.find((r) => r.role === 'header')!.rect.x);
    const v0 = readV0Settings({ values: baseSettings(), configHash: '0'.repeat(64) } as never);
    expect(col.rect.width).toBe(v0.geometry.mainWidth);
    expect(col.rect.y).toBe(v0.geometry.contentTop + HEADER_LU);
    // headerHeight=0 — מדוד-אפס לגיטימי: אין אזור header, התוכן מתחיל בראש האזור
    const noHeader = buildPageTemplateSet(templateInput({ headerHeightLu: asLu(0) }));
    expect(noHeader.for('notes', 1).regions.some((r) => r.role === 'header')).toBe(false);
    const noHeaderCol = noHeader.for('notes', 1).regions.find((r) => r.role === 'body-column')!;
    expect(noHeaderCol.rect.y).toBe(v0.geometry.contentTop);
    const t2 = buildPageTemplateSet(templateInput({ headerHeightLu: asLu(1) }));
    expect(t2.for('notes', 1).regions.some((r) => r.role === 'header')).toBe(true);
  });

  test('פוליו מוסתר: showFolio=false ⇒ אין footer ואין פוליו; עמודי שער תמיד בלי', () => {
    const noFolio = buildPageTemplateSet(templateInput({ showFolio: false }));
    const body = noFolio.for('body', 1);
    expect(body.regions.some((r) => r.role === 'footer')).toBe(false);
    expect(templateShowsFolio(body)).toBe(false);
    // הטורים מתפרשים עד תחתית התוכן (בלי שמירת פוטר)
    const v0 = readV0Settings({ values: baseSettings(), configHash: '0'.repeat(64) } as never);
    const col0 = body.regions.find((r) => r.columnIndex === 0)!;
    expect(col0.rect.y + col0.rect.height).toBe(v0.geometry.contentBottom);
  });

  test('טור בודד (columns=1): אזור גוף אחד ברוחב מלא', () => {
    const oneCol = buildPageTemplateSet(templateInput({ columns: 1 }));
    const t = oneCol.for('body', 1);
    const cols = t.regions.filter((r) => r.role === 'body-column');
    expect(cols.length).toBe(1);
    expect(cols[0]!.columnIndex).toBe(0);
    const v0 = readV0Settings({ values: baseSettings(), configHash: '0'.repeat(64) } as never);
    expect(cols[0]!.rect.width).toBe(v0.geometry.mainWidth);
  });

  test('דטרמיניזם: בנייה כפולה ⇐ אותן תבניות בדיוק (10 ריצות)', () => {
    const first = buildPageTemplateSet(templateInput());
    for (let i = 0; i < 10; i++) {
      const again = buildPageTemplateSet(templateInput());
      expect([...again.byId.keys()].sort()).toEqual([...first.byId.keys()].sort());
      for (const [id, t] of first.byId) {
        expect(again.byId.get(id)).toEqual(t);
      }
    }
  });

  test('אין תבנית בלתי-מדודה: כל גובה מוזרק ומאומת; גאומטריה מנוסחאות נעולות בלבד', () => {
    // A4 נעול
    const t = set.for('body', 1);
    expect(t.size.width).toBe(A4.width);
    expect(t.size.height).toBe(A4.height);
    // שוליים 25mm נעולים של הישן
    const v0 = readV0Settings({ values: baseSettings(), configHash: '0'.repeat(64) } as never);
    expect(v0.geometry.margin).toBe(mmToLu(25));
    // גבהי header/footer שלא נמדדו כראוי ⇒ דחייה מקוטלגת (לא ברירת מחדל שקטה).
    // 0.5/NaN עוקפים את asLu בכוונה — יחידות שלמות נאכפות גם כאן (שכבת כפולה).
    for (const bad of [-1, 0.5, Number.NaN] as number[]) {
      expect(() => buildPageTemplateSet(templateInput({ headerHeightLu: asLu(bad) as LayoutUnit }))).toThrow();
      expect(() => buildPageTemplateSet(templateInput({ footerHeightLu: asLu(bad) as LayoutUnit }))).toThrow();
    }
    // שלילי נדחה במקוטלג של המנוע (asLu מעביר שלם שלילי; התבניות דוחות)
    expect(() => buildPageTemplateSet(templateInput({ headerHeightLu: asLu(-30000) }))).toThrow(LayoutEngineError);
  });
});
