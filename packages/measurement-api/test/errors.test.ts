/**
 * בדיקות קטלוג השגיאות ותשתית ה־i18n לשגיאות (שלב 12).
 * השער: אין שגיאה ללא קוד ומפתח; כל שגיאה שנזרקת מהליבה עוברת דרך הקטלוג.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EngineError, ERROR_CATALOG, ValidationIssue, isRegisteredErrorKey,
} from '../src/errors.js';
import { UnitsError, mmToLu } from '../src/units.js';

describe('ERROR_CATALOG — מבנה ותקינות', () => {
  it('כל רשומה כוללת מפתח i18n תואם למזהה, פרמטרים וחומרה', () => {
    for (const [key, entry] of Object.entries(ERROR_CATALOG)) {
      expect(entry.i18nKey, key).toBe(key); // המפתח הקטלוגי הוא עצמו מפתח ה־i18n
      expect(entry.i18nKey, key).toMatch(/^errors\.[a-z]+\.[A-Z][A-Z0-9_]*$/);
      expect(Array.isArray(entry.params), key).toBe(true);
      expect(['fatal', 'error', 'warning'], key).toContain(entry.severity);
    }
  });

  it('שלושת קודי היסוד רשומים (שלב 12)', () => {
    expect(isRegisteredErrorKey('errors.font.MISSING_FONT')).toBe(true);
    expect(isRegisteredErrorKey('errors.font.FONT_HASH_MISMATCH')).toBe(true);
    expect(isRegisteredErrorKey('errors.measurement.MEASUREMENT_UNAVAILABLE')).toBe(true);
  });

  it('כל קודי היחידות והגיבוב רשומים', () => {
    for (const code of ['UNSAFE_INTEGER', 'INVALID_DENOMINATOR', 'NON_FINITE_MM',
      'NON_FINITE_PT', 'INVALID_UNITS_PER_EM', 'UNSAFE_ADD', 'UNSAFE_SUB',
      'UNSAFE_MUL', 'NON_FINITE_COST']) {
      expect(isRegisteredErrorKey(`errors.units.${code}`), code).toBe(true);
    }
    for (const code of ['UNSUPPORTED_TYPE', 'NON_FINITE_NUMBER', 'INVALID_LENGTH']) {
      expect(isRegisteredErrorKey(`errors.hash.${code}`), code).toBe(true);
    }
  });
});

describe('EngineError — אכיפה בזמן ריצה', () => {
  it('מפתח לא רשום נדחה בעת יצירת השגיאה', () => {
    expect(() => new EngineError('errors.font.NOT_REGISTERED')).toThrowError(/UNREGISTERED_ERROR_KEY/);
  });

  it('נושא מפתח קטלוגי ופרמטרים; ההודעה הגולמית מיועדת ללוג פיתוח', () => {
    const e = new EngineError('errors.font.MISSING_FONT', { family: 'Frank Ruhl Libre', file: 'x.woff2' });
    expect(e.catalogKey).toBe('errors.font.MISSING_FONT');
    expect(e.params).toEqual({ family: 'Frank Ruhl Libre', file: 'x.woff2' });
    expect(e.name).toBe('EngineError');
    expect(e.message).toContain('errors.font.MISSING_FONT'); // ללוג פיתוח
  });

  it('UnitsError עוברת דרך הקטלוג ושומרת את שמה', () => {
    let caught: unknown;
    try {
      mmToLu(Number.NaN);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnitsError);
    expect(caught).toBeInstanceOf(EngineError);
    expect((caught as UnitsError).catalogKey).toBe('errors.units.NON_FINITE_MM');
    expect((caught as UnitsError).name).toBe('UnitsError');
  });
});

describe('סריקה: כל קוד שנזרק בקוד המקור רשום בקטלוג', () => {
  /** אוסף את כל המחרוזות המילוליות של UnitsError/EngineError/CanonicalHashError בקוד המקור. */
  it('בכל קבצי ה־src של החבילות — אין קוד שגיאה לא רשום', () => {
    const repoRoot = join(__dirname, '..', '..', '..');
    const pkgsDir = join(repoRoot, 'packages');
    const srcFiles: string[] = [];
    const scan = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) scan(p);
        else if (e.name.endsWith('.ts') && p.includes(`${join('', 'src')}${e.name ? '' : ''}`) && p.includes('/src/')) srcFiles.push(p);
      }
    };
    scan(pkgsDir);
    expect(srcFiles.length).toBeGreaterThan(5);
    // קודים מילוליים: new UnitsError('X' / CanonicalHashError('X' — מפתח מורכב errors.<domain>.<X>
    for (const f of srcFiles) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/new (UnitsError|CanonicalHashError)\(\s*'([A-Z0-9_]+)'/g)) {
        const domain = m[1] === 'UnitsError' ? 'units' : 'hash';
        const key = `errors.${domain}.${m[2]}`;
        expect(isRegisteredErrorKey(key), `${f}: ${key}`).toBe(true);
      }
      for (const m of text.matchAll(/new EngineError\(\s*'(errors\.[a-z]+\.[A-Z0-9_]+)'/g)) {
        expect(isRegisteredErrorKey(m[1]), `${f}: ${m[1]}`).toBe(true);
      }
    }
  });
});

describe('ValidationIssue — מבנה משותף', () => {
  it('נושא מפתח, חומרה, פרמטרים ומיקום אופציונלי', () => {
    const issue: ValidationIssue = {
      key: 'errors.settings.INVALID_VALUE',
      severity: 'error',
      params: { setting: 'page-width-mm', value: -1 },
      path: 'page.widthMm',
      devNote: 'שלילי',
    };
    expect(issue.key).toMatch(/^errors\./);
    expect(issue.severity).toBe('error');
  });
});
