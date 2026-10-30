/**
 * בדיקות סכמת fixture וכלי golden (שלב 13).
 * הרצת דוגמה מהקורפוס של שלב 4 דרך הסכמה + מחזור golden מלא.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGolden, compareGolden, parseGolden, validateFixture, validateRegistry } from '../src/index.js';

const registry = JSON.parse(
  readFileSync(join(__dirname, '..', 'registry.json'), 'utf8'),
) as { fixtures: unknown[] };

/** פונקציית גיבוב מוזרקת לדוגמה — SHA-256 פשוט על JSON (המנוע יזריק את layoutHash האמיתי). */
const demoHash = (ir: unknown): string => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(JSON.stringify(ir)).digest('hex');
};

describe('סכמת fixture — כל 26 הפריטים משלב 4 עוברים', () => {
  it('הרישום כולו תקין (0 בעיות)', () => {
    const issues = validateRegistry(registry);
    expect(issues).toEqual([]);
  });

  it('דוגמה בודדת: canonical-long-document', () => {
    const sample = registry.fixtures.find((f) => (f as { id: string }).id === 'canonical-long-document');
    expect(sample).toBeDefined();
    expect(validateFixture(sample)).toEqual([]);
    const e = sample as { fontManifestSha256: string; expected: { invariants: string[]; goldenLayoutSha256: null } };
    expect(e.fontManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(e.expected.invariants).toContain('TEXT_COMPLETE');
    expect(e.expected.goldenLayoutSha256).toBeNull(); // עד להיווצרות המנוע
  });

  it('רשומה פגומה נדחית עם פירוט שדות', () => {
    const issues = validateFixture({ id: 'x', schemaVersion: 1 });
    expect(issues.length).toBeGreaterThan(5);
    expect(issues.some((i) => i.field === 'corpusFile')).toBe(true);
    expect(issues.some((i) => i.field === 'fontManifestSha256')).toBe(true);
  });
});

describe('כלי golden — מחזור מלא', () => {
  const sampleIr = { schemaVersion: 1, pages: [{ id: 'p1', n: 1 }, { id: 'p2', n: 2 }] };

  it('בנייה ← פרסור ← השוואה: שווה', () => {
    const golden = buildGolden(sampleIr, demoHash);
    const text = JSON.stringify(golden);
    const parsed = parseGolden(text);
    const result = compareGolden(sampleIr, parsed, demoHash);
    expect(result.equal).toBe(true);
    expect(result.diffReport).toBe('');
  });

  it('שינוי תוכן → השוואה נכשלת עם דו"ח diff קריא', () => {
    const golden = buildGolden(sampleIr, demoHash);
    const modified = { ...sampleIr, pages: [{ id: 'p1', n: 999 }, { id: 'p2', n: 2 }] };
    const result = compareGolden(modified, golden, demoHash);
    expect(result.equal).toBe(false);
    expect(result.diffReport).toContain('golden mismatch');
    expect(result.diffReport).toContain('expected');
    expect(result.diffReport).toContain('999');
  });

  it('parseGolden דוחה קובץ שאינו golden', () => {
    expect(() => parseGolden('{"schemaVersion":9,"kind":"other"}')).toThrowError(/golden/);
  });
});

describe('golden מחויב — tests/golden/demo.golden.json (עדכון אסור אוטומטית)', () => {
  it('ההשוואה מול הקובץ המחויב עוברת', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { layoutHash } = await import('@tora/layout-api');
    const goldenPath = join(__dirname, '..', '..', '..', 'tests', 'golden', 'demo.golden.json');
    const golden = parseGolden(readFileSync(goldenPath, 'utf8'));
    const demoIr = {
      schemaVersion: 1,
      demo: true,
      note: 'golden הדגמה משלב 13 — מוחלף בפלט מנוע אמיתי בשלבים 33+',
      pages: [
        { id: 'p1', columns: [{ x: 0, width: 1000 }, { x: 1100, width: 1000 }] },
        { id: 'p2', columns: [{ x: 0, width: 1000 }, { x: 1100, width: 1000 }] },
      ],
    };
    const result = compareGolden(demoIr, golden, layoutHash);
    expect(result.equal).toBe(true);
  });
});
