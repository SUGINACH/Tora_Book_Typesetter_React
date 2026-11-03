/**
 * assets.test.ts — בדיקות מניפסטי הנכסים החזותיים v2 (שלב 68; אפיון §7, §13; M8).
 *
 * מה מוכח כאן:
 *   1. הקבועים הנעולים: גרסת סכמה, עמוד A4 פיזי, סוגי שערים, ציורים מובנים.
 *   2. parseViewBox — null-safe (אין/שגוי ⇒ null; תקין ⇒ ממדים).
 *   3. תיבות טקסט: חלוקה מדויקת לשברי-עמוד ללא עיגול (ADR-001); קלט שלילי/
 *      לא-סופי ⇒ TEXTBOX_OUT_OF_PAGE; עוגנים בקואורדינטות RTL (tl.x = 1−left);
 *      המרה למ"מ פיזיים דרך עוגן A4 יחיד.
 *   4. מזהים קנוניים נגזרי-תוכן + דחיית קלט שגוי (INVALID_ASSET_ID_INPUT).
 *   5. 27 חריצי תפקיד מובנים (17 סגנון + 10 ממד) וברירות Orange (spear/star/gray).
 *   6. פרסור מבני (MANIFEST_INVALID) ובעיות סמנטיות (not-derived, duplicate,
 *      out-of-page, count, not-for-file, builtinSlots:count).
 *   7. assetsIdentity — דטרמיניסטית ורגישה לשינוי.
 */
import { describe, expect, it } from 'vitest';
import {
  ASSETS_MANIFEST_SCHEMA_VERSION,
  BUILTIN_DRAWINGS,
  BUILTIN_ROLE_SLOTS,
  ORNAMENT_FILE_ROLES,
  SHAAR_FILE_KINDS,
  SHAAR_KINDS,
  SHAAR_PHYSICAL_PAGE_MM,
  assetsIdentity,
  legacyPercentBoxOf,
  ornamentAssetId,
  ornamentsManifestIssues,
  pageFractionsToMm,
  parseOrnamentsManifest,
  parseViewBox,
  parseShaarManifest,
  safeAreaOf,
  shaarAssetId,
  shaarManifestIssues,
  textBoxAnchorsOf,
  textBoxToPageFractions,
} from '../src/assets.js';
import { isRegisteredContentModelErrorKey } from '../src/errors.js';

const SVG = (w: number, h: number) =>
  `<svg class="custom-bg-img" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}"></svg>`;

const FILE_SHA = '4ac3285bbd68337f25a9cdcc157a36efaac1448e0d6ce9ede963f2b0c3acda5b';
const ORN_SHA = 'bfd0e08a47af0af6f027114c57c45db83e590e31d6d2bc433c916fd9ca8923a7';

/** מניפסט שערים מינימלי תקין — קובץ אחד, שני עיצובים (אחד עם תיבה, אחד בלי). */
function minimalShaarManifest(): unknown {
  const fractions = textBoxToPageFractions({ left: 43.6, top: 20.6, right: 43.8, bottom: 16.6 });
  return {
    schemaVersion: ASSETS_MANIFEST_SCHEMA_VERSION,
    kind: 'shaar',
    source: { repo: 'SUGINACH/Tora_Book_Typesetter_Orange', commit: '93ad1e5704405fb2806a126ea1b519a35a87f378' },
    license: { status: 'source-undocumented', inventoryCategory: 'shaar-ornaments' },
    files: [{ file: 'shaar_main.json', sha256: FILE_SHA, bytes: 213809, kind: 'main', count: 2 }],
    designs: [
      {
        id: shaarAssetId('main', FILE_SHA, 0),
        legacyId: 'ext_1____________svg',
        file: 'shaar_main.json',
        index: 0,
        kind: 'main',
        name: '1   שער ראשי',
        svgSha256: 'eedd3403bc937104d2eb77ba33660a969a88116b1673e7ac223ec2e2e40ee971',
        viewBox: { width: 2000, height: 2880 },
        textBox: fractions,
        anchors: textBoxAnchorsOf(fractions),
      },
      {
        id: shaarAssetId('main', FILE_SHA, 1),
        legacyId: 'ext_2____________svg',
        file: 'shaar_main.json',
        index: 1,
        kind: 'main',
        name: '2   שער ראשי',
        svgSha256: '70d506f1bf01ff2538de87c1367b9dc022ad2cdda1345f83bcfe12940c73426d',
        viewBox: { width: 210, height: 297 },
        textBox: null,
        anchors: null,
      },
    ],
  };
}

/** מניפסט עיטורים מינימלי תקין — קובץ אחד, עיצוב אחד, 27 החריצים. */
function minimalOrnamentsManifest(): unknown {
  return {
    schemaVersion: ASSETS_MANIFEST_SCHEMA_VERSION,
    kind: 'ornaments',
    source: { repo: 'SUGINACH/Tora_Book_Typesetter_Orange', commit: '93ad1e5704405fb2806a126ea1b519a35a87f378' },
    license: { status: 'source-undocumented', inventoryCategory: 'shaar-ornaments' },
    files: [{ file: 'header_ornaments.json', sha256: ORN_SHA, bytes: 28830, kind: 'header', count: 1 }],
    designs: [
      {
        id: ornamentAssetId('header_ornaments.json', ORN_SHA, 0),
        legacyId: 'ext_h1____________svg',
        file: 'header_ornaments.json',
        index: 0,
        name: 'עיטור כותרת',
        svgSha256: '0000000000000000000000000000000000000000000000000000000000000001',
        viewBox: { width: 800, height: 1200 },
      },
    ],
    builtinSlots: BUILTIN_ROLE_SLOTS.map((s) => ({ key: s.key, kind: s.kind, defaultValue: s.defaultValue, role: s.role })),
  };
}

describe('שלב 68: assets — מניפסטי נכסים חזותיים v2', () => {
  it('קבועים נעולים: גרסת סכמה 2, עמוד A4, סוגי שערים, ציורים מובנים', () => {
    expect(ASSETS_MANIFEST_SCHEMA_VERSION).toBe(2);
    expect(SHAAR_PHYSICAL_PAGE_MM.width).toBe(210);
    expect(SHAAR_PHYSICAL_PAGE_MM.height).toBe(297);
    expect([...SHAAR_KINDS]).toEqual(['main', 'back', 'sub']);
    expect([...BUILTIN_DRAWINGS]).toEqual(['none', 'spear', 'plain', 'star', 'gray']);
    expect(SHAAR_FILE_KINDS['shaar_main.json']).toBe('main');
    expect(SHAAR_FILE_KINDS['shaar_back.json']).toBe('back');
    expect(SHAAR_FILE_KINDS['shaar_sub.json']).toBe('sub');
  });

  it('parseViewBox — תקין ⇒ ממדים; חסר/שגוי/לא-ספרות ⇒ null (null-safe)', () => {
    expect(parseViewBox(SVG(2000, 2880))).toEqual({ width: 2000, height: 2880 });
    expect(parseViewBox('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull();
    expect(parseViewBox('<svg viewBox="0 0 2000"></svg>')).toBeNull();
    expect(parseViewBox('<svg viewBox="0 0 0 100"></svg>')).toBeNull();
    expect(parseViewBox('')).toBeNull();
    expect(parseViewBox('<svg viewBox="0 0 12.5 30.25"></svg>')).toEqual({ width: 12.5, height: 30.25 });
  });

  it('textBoxToPageFractions — חלוקה מדויקת ב-100 ללא עיגול (ADR-001)', () => {
    const f = textBoxToPageFractions({ left: 43.6, top: 20.6, right: 43.8, bottom: 16.6 });
    expect(f.left).toBe(43.6 / 100);
    expect(f.top).toBe(20.6 / 100);
    expect(f.right).toBe(43.8 / 100);
    expect(f.bottom).toBe(16.6 / 100);
    const half = textBoxToPageFractions({ left: 50, top: 25, right: 12.5, bottom: 0 });
    expect(half.left).toBe(0.5);
    expect(half.top).toBe(0.25);
    expect(half.right).toBe(0.125);
    expect(half.bottom).toBe(0);
  });

  it('textBoxToPageFractions — קלט שלילי ⇒ TEXTBOX_OUT_OF_PAGE מהקטלוג', () => {
    try {
      textBoxToPageFractions({ left: -5, top: 0, right: 0, bottom: 0 });
      expect.unreachable('היה צריך לזרוק');
    } catch (e) {
      expect((e as { catalogKey?: string }).catalogKey).toBe('errors.assets.TEXTBOX_OUT_OF_PAGE');
      expect(isRegisteredContentModelErrorKey('errors.assets.TEXTBOX_OUT_OF_PAGE')).toBe(true);
    }
  });

  it('textBoxToPageFractions — ערכים חורגים חוקיים ונרשמים נאמנה (עד 127% — דף-כפול וירטואלי)', () => {
    const f = textBoxToPageFractions({ left: 123.5, top: 97.2, right: 29, bottom: 20.6 });
    expect(f.left).toBe(123.5 / 100);
    expect(f.top).toBe(97.2 / 100);
    expect(f.right).toBe(29 / 100);
    expect(f.bottom).toBe(20.6 / 100);
    expect(f.left).toBeGreaterThan(1);
  });

  it('textBoxToPageFractions — שדה לא-סופי ⇒ TEXTBOX_OUT_OF_PAGE', () => {
    expect(() => textBoxToPageFractions({ left: Number.NaN, top: 0, right: 0, bottom: 0 })).toThrowError(/סופי/);
  });

  it('textBoxAnchorsOf — פינות בקואורדינטות RTL: tl.x = 1−left, tr.x = right', () => {
    const a = textBoxAnchorsOf({ left: 0.25, top: 0.1, right: 0.15, bottom: 0.2 });
    expect(a.tl).toEqual({ x: 0.75, y: 0.1 });
    expect(a.tr).toEqual({ x: 0.15, y: 0.1 });
    expect(a.bl).toEqual({ x: 0.75, y: 0.8 });
    expect(a.br).toEqual({ x: 0.15, y: 0.8 });
  });

  it('textBoxAnchorsOf — עמוד מלא (כל השוליים 0) ⇒ הפינות בדיוק 0/1', () => {
    const a = textBoxAnchorsOf({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(a.tl).toEqual({ x: 1, y: 0 });
    expect(a.tr).toEqual({ x: 0, y: 0 });
    expect(a.bl).toEqual({ x: 1, y: 1 });
    expect(a.br).toEqual({ x: 0, y: 1 });
  });

  it('pageFractionsToMm — עוגן A4 יחיד: שברים ← מ"מ פיזיים מדויקים', () => {
    const mm = pageFractionsToMm({ left: 0.5, top: 0.25, right: 0.125, bottom: 0.1 });
    expect(mm.leftMm).toBe(0.5 * 210);
    expect(mm.topMm).toBe(0.25 * 297);
    expect(mm.rightMm).toBe(0.125 * 210);
    expect(mm.bottomMm).toBe(0.1 * 297);
  });

  it('safeAreaOf — תיבה חתוכה לעמוד: תיבה פנימית [left, 1−right]×[top, 1−bottom] (שלב 69)', () => {
    expect(safeAreaOf({ left: 0.25, top: 0.2, right: 0.15, bottom: 0.1 })).toEqual({
      left: 0.25, top: 0.2, width: 0.6, height: 0.7,
    });
    // חריגה מתחת למקור — נחתכת לתחום העמוד (נאמן, לא דחייה)
    expect(safeAreaOf({ left: -0.2, top: 0.1, right: 0.1, bottom: -0.1 })).toEqual({
      left: 0, top: 0.1, width: 0.9, height: 0.9,
    });
  });

  it('safeAreaOf — תיבה מנוונת/פרושה (חיתוך ריק) או חסרה ⇒ null — הצרכן נופל לברירת המחדל המתועדת', () => {
    // דף-כפול וירטואלי: left=1.235, right=0.29 ⇒ [1.235, 0.71] — הפוך
    expect(safeAreaOf({ left: 1.235, top: 0.206, right: 0.29, bottom: 0.206 })).toBeNull();
    // left+right > 1 בתוך העמוד — מנוונת
    expect(safeAreaOf({ left: 0.7, top: 0.2, right: 0.7, bottom: 0.2 })).toBeNull();
    // אנכית מנוונת
    expect(safeAreaOf({ left: 0.1, top: 0.6, right: 0.1, bottom: 0.6 })).toBeNull();
    // אין תיבה כלל (4 העיצובים בלי)
    expect(safeAreaOf(null)).toBeNull();
  });

  it('safeAreaOf — עמוד מלא (שוליים 0) ⇒ העמוד כולו; שוליים סימטריים קטנים', () => {
    expect(safeAreaOf({ left: 0, top: 0, right: 0, bottom: 0 })).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(safeAreaOf({ left: 0.1, top: 0.1, right: 0.1, bottom: 0.1 })).toEqual({ left: 0.1, top: 0.1, width: 0.8, height: 0.8 });
  });

  it('shaarAssetId — נגזר מהתוכן: shaar:v2|{סוג}|{sha16}#{אינדקס}', () => {
    expect(shaarAssetId('main', FILE_SHA, 0)).toBe(`shaar:v2|main|${FILE_SHA.slice(0, 16)}#0`);
    expect(shaarAssetId('sub', FILE_SHA, 26)).toBe(`shaar:v2|sub|${FILE_SHA.slice(0, 16)}#26`);
    expect(shaarAssetId('main', FILE_SHA, 0)).not.toBe(shaarAssetId('back', FILE_SHA, 0));
    expect(shaarAssetId('main', FILE_SHA, 0)).not.toBe(shaarAssetId('main', FILE_SHA, 1));
  });

  it('shaarAssetId — קלט שגוי ⇒ INVALID_ASSET_ID_INPUT', () => {
    for (const bad of [
      () => shaarAssetId('bogus', FILE_SHA, 0),
      () => shaarAssetId('main', 'not-hex', 0),
      () => shaarAssetId('main', FILE_SHA, -1),
      () => shaarAssetId('main', FILE_SHA, 1.5),
    ]) {
      try {
        bad();
        expect.unreachable('היה צריך לזרוק');
      } catch (e) {
        expect((e as { catalogKey?: string }).catalogKey).toBe('errors.assets.INVALID_ASSET_ID_INPUT');
      }
    }
    expect(isRegisteredContentModelErrorKey('errors.assets.INVALID_ASSET_ID_INPUT')).toBe(true);
  });

  it('ornamentAssetId — נגזר מהתוכן: orn:v2|{קובץ}|{sha16}#{אינדקס}', () => {
    expect(ornamentAssetId('section_dividers.json', ORN_SHA, 100)).toBe(`orn:v2|section_dividers.json|${ORN_SHA.slice(0, 16)}#100`);
    expect(ornamentAssetId('note_rules.json', ORN_SHA, 3)).not.toBe(ornamentAssetId('note_rules.json', ORN_SHA, 4));
  });

  it('ornamentAssetId — שם קובץ עם | או # / hash שגוי / אינדקק שגוי ⇒ זריקה', () => {
    expect(() => ornamentAssetId('a|b.json', ORN_SHA, 0)).toThrowError();
    expect(() => ornamentAssetId('a#b.json', ORN_SHA, 0)).toThrowError();
    expect(() => ornamentAssetId('', ORN_SHA, 0)).toThrowError();
    expect(() => ornamentAssetId('ok.json', 'xyz', 0)).toThrowError();
    expect(() => ornamentAssetId('ok.json', ORN_SHA, -3)).toThrowError();
  });

  it('ORNAMENT_FILE_ROLES — חמישה קבצים עם תפקיד וסוג', () => {
    expect(Object.keys(ORNAMENT_FILE_ROLES).sort()).toEqual([
      'header_ornaments.json', 'note_rules.json', 'ornaments_left_right.json', 'ornaments_up_down.json', 'section_dividers.json',
    ].sort());
    expect(ORNAMENT_FILE_ROLES['ornaments_up_down.json'].kind).toBe('up-down');
    expect(ORNAMENT_FILE_ROLES['section_dividers.json'].kind).toBe('section-divider');
    expect(ORNAMENT_FILE_ROLES['note_rules.json'].kind).toBe('note-rules');
    for (const v of Object.values(ORNAMENT_FILE_ROLES)) expect(v.role.length).toBeGreaterThan(0);
  });

  it('BUILTIN_ROLE_SLOTS — 27 חריצים: 17 סגנון + 10 ממד, סדר קנוני קפוא', () => {
    expect(BUILTIN_ROLE_SLOTS.length).toBe(27);
    expect(BUILTIN_ROLE_SLOTS.filter((s) => s.kind === 'style').length).toBe(17);
    expect(BUILTIN_ROLE_SLOTS.filter((s) => s.kind === 'dimension').length).toBe(10);
  });

  it('BUILTIN_ROLE_SLOTS — מפתחות ייחודיים', () => {
    const keys = BUILTIN_ROLE_SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(27);
  });

  it('BUILTIN_ROLE_SLOTS — ברירות סגנון מתוך הציורים המובנים בלבד', () => {
    for (const s of BUILTIN_ROLE_SLOTS) {
      if (s.kind === 'style') expect(BUILTIN_DRAWINGS).toContain(s.defaultValue);
    }
  });

  it('BUILTIN_ROLE_SLOTS — ברירות Orange הפעילות נעולות: spear/star/gray', () => {
    const by = new Map(BUILTIN_ROLE_SLOTS.map((s) => [s.key, s.defaultValue]));
    expect(by.get('section-divider-style')).toBe('spear');
    expect(by.get('note-rule-style')).toBe('star');
    expect(by.get('hdr-divider-style')).toBe('gray');
  });

  it('BUILTIN_ROLE_SLOTS — ממדים עם יחידה (em|px|%) ותפקיד בעברית', () => {
    for (const s of BUILTIN_ROLE_SLOTS) {
      if (s.kind === 'dimension') {
        expect(s.defaultValue).toMatch(/^\d+(\.\d+)?(em|px|%)$/);
        expect(s.role.length).toBeGreaterThan(0);
      }
    }
    const dims = new Map(BUILTIN_ROLE_SLOTS.filter((s) => s.kind === 'dimension').map((s) => [s.key, s.defaultValue]));
    expect(dims.get('dim-h2-top-h')).toBe('1.25em');
    expect(dims.get('dim-h3-side-w')).toBe('50px');
    expect(dims.get('dim-note-side-w')).toBe('40px');
  });

  it('legacyPercentBoxOf — מחרוזות מספריות ומספרים; צורה שגויה ⇒ MANIFEST_INVALID', () => {
    expect(legacyPercentBoxOf({ left: '43.6', top: '20.6', right: '43.8', bottom: '16.6' })).toEqual({
      left: 43.6, top: 20.6, right: 43.8, bottom: 16.6,
    });
    expect(legacyPercentBoxOf({ left: 10, top: 0, right: 0, bottom: 0 })).toEqual({ left: 10, top: 0, right: 0, bottom: 0 });
    expect(() => legacyPercentBoxOf({ left: 'abc', top: 0, right: 0, bottom: 0 })).toThrowError();
    try {
      legacyPercentBoxOf({ top: 0, right: 0, bottom: 0 } as unknown as Record<string, unknown>);
      expect.unreachable('היה צריך לזרוק');
    } catch (e) {
      expect((e as { catalogKey?: string }).catalogKey).toBe('errors.assets.MANIFEST_INVALID');
    }
  });

  it('parseShaarManifest — מניפסט מינימלי תקין נפרס במלואו', () => {
    const m = parseShaarManifest(minimalShaarManifest());
    expect(m.schemaVersion).toBe(2);
    expect(m.kind).toBe('shaar');
    expect(m.files.length).toBe(1);
    expect(m.designs.length).toBe(2);
    expect(m.designs[0]?.textBox).not.toBeNull();
    expect(m.designs[0]?.anchors).not.toBeNull();
    expect(m.designs[1]?.textBox).toBeNull();
    expect(m.designs[1]?.anchors).toBeNull();
  });

  it('parseShaarManifest — schemaVersion שגוי ⇒ MANIFEST_INVALID (fatal)', () => {
    const raw = minimalShaarManifest() as Record<string, unknown>;
    try {
      parseShaarManifest({ ...raw, schemaVersion: 1 });
      expect.unreachable('היה צריך לזרוק');
    } catch (e) {
      expect((e as { catalogKey?: string }).catalogKey).toBe('errors.assets.MANIFEST_INVALID');
      expect(isRegisteredContentModelErrorKey('errors.assets.MANIFEST_INVALID')).toBe(true);
    }
  });

  it('parseShaarManifest — textBox בלי anchors (או להפך) ⇒ MANIFEST_INVALID', () => {
    const raw = JSON.parse(JSON.stringify(minimalShaarManifest())) as { designs: Array<Record<string, unknown>> };
    delete raw.designs[0]!.anchors;
    expect(() => parseShaarManifest(raw)).toThrowError(/יחד/);
  });

  it('shaarManifestIssues — מניפסט מינימלי תקין ⇒ אפס בעיות', () => {
    expect(shaarManifestIssues(parseShaarManifest(minimalShaarManifest()))).toEqual([]);
  });

  it('shaarManifestIssues — מזהה שאינו נגזר מהתוכן ⇒ not-derived', () => {
    const raw = JSON.parse(JSON.stringify(minimalShaarManifest())) as { designs: Array<Record<string, unknown>> };
    raw.designs[0]!.id = 'shaar:v2|main|deadbeefdeadbeef#0';
    const issues = shaarManifestIssues(parseShaarManifest(raw));
    expect(issues.some((s) => s.startsWith('not-derived:'))).toBe(true);
  });

  it('shaarManifestIssues — מזהה קנוני כפול ⇒ duplicate', () => {
    const raw = JSON.parse(JSON.stringify(minimalShaarManifest())) as { designs: Array<Record<string, unknown>> };
    raw.designs[1]!.id = raw.designs[0]!.id;
    const issues = shaarManifestIssues(parseShaarManifest(raw));
    expect(issues.some((s) => s.startsWith('duplicate:'))).toBe(true);
  });

  it('shaarManifestIssues — שבר שלילי ⇒ out-of-page', () => {
    const raw = JSON.parse(JSON.stringify(minimalShaarManifest())) as {
      designs: Array<Record<string, unknown>>;
    };
    (raw.designs[0]!.textBox as Record<string, unknown>).left = -0.5;
    const issues = shaarManifestIssues(parseShaarManifest(raw));
    expect(issues.some((s) => s.startsWith('out-of-page:'))).toBe(true);
  });

  it('shaarManifestIssues — ספירת קובץ אינה תואמת ⇒ count:{file}', () => {
    const raw = JSON.parse(JSON.stringify(minimalShaarManifest())) as { files: Array<Record<string, unknown>> };
    raw.files[0]!.count = 5;
    const issues = shaarManifestIssues(parseShaarManifest(raw));
    expect(issues.some((s) => s.startsWith('count:shaar_main.json'))).toBe(true);
  });

  it('ornamentsManifestIssues — מניפסט מינימלי תקין ⇒ אפס בעיות', () => {
    expect(ornamentsManifestIssues(parseOrnamentsManifest(minimalOrnamentsManifest()))).toEqual([]);
  });

  it('ornamentsManifestIssues — עיצוב לקובץ זר ⇒ not-for-file', () => {
    const raw = JSON.parse(JSON.stringify(minimalOrnamentsManifest())) as { designs: Array<Record<string, unknown>> };
    raw.designs[0]!.file = 'shaar_main.json';
    const issues = ornamentsManifestIssues(parseOrnamentsManifest(raw));
    expect(issues.some((s) => s.startsWith('not-for-file:'))).toBe(true);
  });

  it('ornamentsManifestIssues — חריצים שגויים במספר ובתוכן ⇒ builtinSlots:count', () => {
    const short = JSON.parse(JSON.stringify(minimalOrnamentsManifest())) as { builtinSlots: unknown[] };
    short.builtinSlots.pop();
    expect(ornamentsManifestIssues(parseOrnamentsManifest(short)).some((s) => s.startsWith('builtinSlots:count'))).toBe(true);
    const mutated = JSON.parse(JSON.stringify(minimalOrnamentsManifest())) as { builtinSlots: Array<Record<string, unknown>> };
    mutated.builtinSlots[0]!.defaultValue = 'spear';
    expect(ornamentsManifestIssues(parseOrnamentsManifest(mutated)).some((s) => s.startsWith('builtinSlots:count'))).toBe(true);
  });

  it('assetsIdentity — דטרמיניסטית ורגישה לשינוי (מזהה/תיבה/חריץ)', () => {
    const shaar = parseShaarManifest(minimalShaarManifest());
    const orn = parseOrnamentsManifest(minimalOrnamentsManifest());
    const i1 = JSON.stringify(assetsIdentity(shaar, orn));
    const i2 = JSON.stringify(assetsIdentity(parseShaarManifest(minimalShaarManifest()), parseOrnamentsManifest(minimalOrnamentsManifest())));
    expect(i1).toBe(i2);
    const rawS = JSON.parse(JSON.stringify(minimalShaarManifest())) as { designs: Array<Record<string, unknown>> };
    rawS.designs[0]!.id = 'shaar:v2|main|deadbeefdeadbeef#0';
    expect(JSON.stringify(assetsIdentity(parseShaarManifest(rawS), orn))).not.toBe(i1);
    const rawS2 = JSON.parse(JSON.stringify(minimalShaarManifest())) as { designs: Array<Record<string, unknown>> };
    (rawS2.designs[0]!.textBox as Record<string, unknown>).left = 0.999;
    expect(JSON.stringify(assetsIdentity(parseShaarManifest(rawS2), orn))).not.toBe(i1);
    const rawO = JSON.parse(JSON.stringify(minimalOrnamentsManifest())) as { builtinSlots: Array<Record<string, unknown>> };
    rawO.builtinSlots[0]!.defaultValue = 'gray';
    expect(JSON.stringify(assetsIdentity(shaar, parseOrnamentsManifest(rawO)))).not.toBe(i1);
    // ערכים סדירים בלבד — סבב JSON יציב (ה-CLI מגבב canonicalJson+sha256)
    expect(JSON.stringify(JSON.parse(i1))).toBe(i1);
  });
});
