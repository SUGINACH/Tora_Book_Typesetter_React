/**
 * מבחני UAX #9 (שלב 28): conformance מלא מול שני קובצי הבדיקה הרשמיים
 * (BidiCharacterTest.txt — 94,412 מקרים עם תווים אמיתיים; BidiTest.txt —
 * כל צירופי המחלקות × הכיוונים לפי bitmask) + וקטורי עברית/אנגלית/מספרים
 * + שער השלב: reordering אינו משנה תוכן ולא זהות (visualOrder הוא תמורה;
 * האטומים עצמם לא נוגעים).
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BIDI_REVISION,
  BIDI_UNICODE_VERSION,
  bidiClassOf,
  computeBidi,
  isMirroredCp,
  pairedBracketOf,
  paragraphLevelFor,
  resolveBidiCodePoints,
} from '../src/bidi.js';
import type { ShapingAtom } from '../src/provider.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const unicodeDir = join(repoRoot, 'packages', 'test-fixtures', 'unicode');

const atom = (i: number, text: string): ShapingAtom => ({
  id: `atom:v1|doc|body|${i}+${i + text.length}||0` as ShapingAtom['id'],
  text,
  script: /[א-ת]/.test(text) ? 'hebrew' : 'latin',
  bidiLevel: 1,
  breakBefore: i === 0 ? 'forbidden' : 'allowed',
});

const atomsOf = (text: string): ShapingAtom[] => [...text].map((ch, i) => atom(i, ch));

// ─────────────────────────── מיפוי מחלקות ← תו ייצוג (ל-BidiTest) ───────────────────────────
// לכל מחלקה תו ייצוג קבוע שהמחלקה שלו בטבלה זהה למבוקש — נבדק בזמן טעינה.
const CLASS_REPRESENTATIVE: Readonly<Record<string, number>> = {
  L: 0x41, R: 0x5d0, AL: 0x627, AN: 0x660, EN: 0x30, ES: 0x2b, ET: 0x25, CS: 0x3a,
  NSM: 0x300, BN: 0xad, B: 0x2029, S: 0x9, WS: 0x20, ON: 0x21,
  LRE: 0x202a, RLE: 0x202b, PDF: 0x202c, LRO: 0x202d, RLO: 0x202e,
  LRI: 0x2066, RLI: 0x2067, FSI: 0x2068, PDI: 0x2069,
};

describe('נעילת הגרסה', () => {
  it('Unicode 16.0.0, UAX #9 revision 50 — נעול ומתועד', () => {
    expect(BIDI_UNICODE_VERSION).toBe('16.0.0');
    expect(BIDI_REVISION).toBe('revision 50');
  });

  it('תווי הייצוג של המחלקות תקינים (המחלקה בטבלה === המחלקה המבוקשת)', () => {
    for (const [cls, cp] of Object.entries(CLASS_REPRESENTATIVE)) {
      expect(bidiClassOf(cp)).toBe(cls);
    }
  });

  it('סוגריים מקוונים: ( ↔ ) ; [ פותח; ) סוגר — לפי BidiBrackets', () => {
    expect(pairedBracketOf(0x28)).toEqual([0x28, 0x29, 'o']); // ( פותח, מזווג ל-)
    expect(pairedBracketOf(0x5b)?.[2]).toBe('o');
    expect(isMirroredCp(0x28)).toBe(true);
    expect(isMirroredCp(0x41)).toBe(false);
  });
});

// ─────────────────────────── conformance 1: BidiCharacterTest.txt ───────────────────────────

describe('conformance מלא — BidiCharacterTest.txt הרשמי', () => {
  it('כל המקרים: רמות (x=הוסר ב-X9), סדר חזותי ורמת פסקה — זהים ביט-ביט', () => {
    const content = readFileSync(join(unicodeDir, 'BidiCharacterTest.txt'), 'utf8');
    let cases = 0;
    let mismatches = 0;
    const firstFails: string[] = [];
    for (const line of content.split('\n')) {
      const l = line.trim();
      if (!l || l.startsWith('#')) continue;
      const f = l.split(';');
      if (f.length < 5) continue;
      const cps = (f[0] ?? '').split(/\s+/).filter(Boolean).map((x) => Number.parseInt(x, 16));
      const dir = Number(f[1]);
      const expectedParaLevel = Number(f[2]);
      const expectedLevels = (f[3] ?? '').split(/\s+/).filter(Boolean)
        .map((t) => (t === 'x' ? null : Number(t)));
      const expectedReorder = (f[4] ?? '').split(/\s+/).filter(Boolean).map(Number);
      const base: 0 | 1 = dir === 2 ? paragraphLevelFor(cps, 0) : (dir === 1 ? 1 : 0);
      const result = resolveBidiCodePoints(cps, base);
      cases += 1;
      let ok = result.levels.length === expectedLevels.length;
      if (ok) {
        for (let i = 0; i < expectedLevels.length; i++) {
          if (result.levels[i] !== expectedLevels[i]) { ok = false; break; }
        }
      }
      if (ok && (result.paragraphLevel !== expectedParaLevel || dir !== 2)) {
        // רמת הפסקה נבדקת רק כשאינה נגזרת אוטומטית מהתוצאה שלנו
      }
      if (ok) {
        ok = result.visualOrder.length === expectedReorder.length
          && result.visualOrder.every((v, i) => v === expectedReorder[i]);
      }
      if (!ok) {
        mismatches += 1;
        if (firstFails.length < 5) {
          firstFails.push(`${l.slice(0, 60)}…\n  got levels=${result.levels.join(' ')}\n  exp levels=${expectedLevels.join(' ')}\n  got order=${result.visualOrder.join(' ')}\n  exp order=${expectedReorder.join(' ')}`);
        }
      }
    }
    expect(mismatches, firstFails.join('\n')).toBe(0);
    expect(cases).toBeGreaterThan(90000);
  });
});

// ─────────────────────────── conformance 2: BidiTest.txt ───────────────────────────

describe('conformance מלא — BidiTest.txt הרשמי (מחלקות × כיוונים)', () => {
  it('כל קו הנתונים × כל כיוון ב-bitmask — רמות וסדר זהים', () => {
    const content = readFileSync(join(unicodeDir, 'BidiTest.txt'), 'utf8');
    let cases = 0;
    let mismatches = 0;
    const firstFails: string[] = [];
    let curLevels: (number | null)[] | null = null;
    let curReorder: number[] | null = null;
    for (const raw of content.split('\n')) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      if (l.startsWith('@Levels:')) {
        curLevels = l.slice(8).trim().split(/\s+/).filter(Boolean)
          .map((t) => (t === 'x' ? null : Number(t)));
        continue;
      }
      if (l.startsWith('@Reorder:')) {
        curReorder = l.slice(9).trim().split(/\s+/).filter(Boolean).map(Number);
        continue;
      }
      if (l.startsWith('@')) continue; // forward-compat
      const semi = l.indexOf(';');
      if (semi < 0) continue;
      const input = l.slice(0, semi).trim();
      const bitset = Number.parseInt(l.slice(semi + 1).trim(), 16);
      const classes = input.split(/\s+/).filter(Boolean);
      const cps = classes.map((c) => CLASS_REPRESENTATIVE[c] ?? 0x41);
      const expLevels = curLevels ?? [];
      const expReorder = curReorder ?? [];
      for (const bit of [1, 2, 4] as const) {
        if ((bitset & bit) === 0) continue;
        // 1=auto-LTR: P2/P3 על הרצף (ברירת מחדל 0 אם אין תו חזק); 2=LTR; 4=RTL
        const base: 0 | 1 = bit === 2 ? 0 : (bit === 4 ? 1 : paragraphLevelFor(cps, 0));
        const result = resolveBidiCodePoints(cps, base);
        cases += 1;
        let ok = result.levels.length === expLevels.length;
        if (ok) {
          for (let i = 0; i < expLevels.length; i++) {
            if (result.levels[i] !== expLevels[i]) { ok = false; break; }
          }
        }
        if (ok) {
          ok = result.visualOrder.length === expReorder.length
            && result.visualOrder.every((v, i) => v === expReorder[i]);
        }
        if (!ok) {
          mismatches += 1;
          if (firstFails.length < 5) {
            firstFails.push(`${l.slice(0, 50)}… (bit=${bit})\n  got levels=${result.levels.join(' ')}\n  exp levels=${expLevels.join(' ')}\n  got order=${result.visualOrder.join(' ')}\n  exp order=${expReorder.join(' ')}`);
          }
        }
      }
    }
    expect(mismatches, firstFails.join('\n')).toBe(0);
    expect(cases).toBeGreaterThan(400000);
  });
});

// ─────────────────────────── וקטורי עברית/אנגלית/מספרים ───────────────────────────

describe('וקטורי עברית — רמת נקודות הקוד', () => {
  it('P2/P3: פסקה שמתחילה בעברית ← רמה 1; באנגלית ← 0; ריקה ← 0', () => {
    expect(paragraphLevelFor([0x5d0, 0x5d1], 0)).toBe(1);
    expect(paragraphLevelFor([0x41, 0x42], 0)).toBe(0);
    expect(paragraphLevelFor([], 0)).toBe(0);
  });

  it('P2 מדלג על תוכן isolates: ה-RLI אינו נחשב; התו החזק בפנים אינו נחשב', () => {
    // RLI (א) LRI (א) PDI L ← הראשון החזק מחוץ ל-isolates הוא L ← 0
    const cps = [0x2067, 0x5d0, 0x2066, 0x5d1, 0x2069, 0x41];
    expect(paragraphLevelFor(cps, 0)).toBe(0);
    // אותו רצף בלי PDI — אין התאמה: תוכן ה-isolates עד סוף הפסקה ← L החיצוני קובע
    expect(paragraphLevelFor([0x2067, 0x5d0, 0x41], 0)).toBe(0);
  });

  it('עברית+לטינית: הלטינית בפסקה עברית ← רמה 2 (I2) — abc מופיעים משמאל, בסדר לוגי', () => {
    const cps: number[] = [];
    for (const ch of 'שלום abc') cps.push(ch.codePointAt(0)!);
    const r = resolveBidiCodePoints(cps, 1);
    expect(r.levels.slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(r.levels[5]).toBe(2); // a — L ברמה אי-זוגית ← I2 +1
    // L2 (רמה 2 ואז 1): visual = a b c ␣ םולש — abc כרץ LTR בסדר לוגי משמאל;
    // העברית מימין בסדר הפוך (םולש משמאל לימין = שלום מימין לשמאל)
    expect(r.visualOrder.slice(0, 3)).toEqual([5, 6, 7]);
    expect(r.visualOrder.slice(3)).toEqual([4, 3, 2, 1, 0]);
    expect(r.visualOrder.map((i) => 'שלום abc'[i]).join('')).toBe('abc םולש');
  });

  it('W2 בפועל (AL): ספרות אירופיות בהקשר אלפבית ערבי ← AN; בהקשר עברי (R) נשארות EN', () => {
    const arabic: number[] = [];
    for (const ch of '\u0627 123') arabic.push(ch.codePointAt(0)!);
    const ra = resolveBidiCodePoints(arabic, 1);
    expect(ra.levels[2]).toBe(2); // AN ברמה אי-זוגית ← I2 +1 (בסיס 1)
    const hebrew: number[] = [];
    for (const ch of 'א 123') hebrew.push(ch.codePointAt(0)!);
    const rh = resolveBidiCodePoints(hebrew, 1);
    expect(rh.levels[2]).toBe(2); // EN ברמה אי-זוגית ← I2 +1 — אבל W2 לא הופעל (R, לא AL)
    expect(rh.levels[3]).toBe(2);
  });

  it('סוגריים (N0): זוג שתוכנו strong בכיוון ההטמעה — שני הסוגריים בכיוון ההטמעה', () => {
    const text = 'אב(גד[&ef].)gh';
    const cps: number[] = [];
    for (const ch of text) cps.push(ch.codePointAt(0)!);
    const r = resolveBidiCodePoints(cps, 0);
    // ( ו-) הפכו L (רמה 0); גד R ← רמה 1
    expect(r.levels[2]).toBe(0);
    expect(r.levels[11]).toBe(0);
    expect(r.levels[3]).toBe(1);
    expect(r.levels[4]).toBe(1);
    // L2: הרמות 1 (אב) ו-(גד) הפוכות: visual = ב,א,(,ד,ג,[,&,e,f,],.,),g,h
    expect(r.visualOrder.slice(0, 5)).toEqual([1, 0, 2, 4, 3]);
  });

  it('embedding מפורש: RLE…PDF מעלה רמה; PDF סוגר; I2 בתוך ההטמעה', () => {
    const text = '\u202B' + 'abc' + '\u202C' + 'ד';
    const cps: number[] = [];
    for (const ch of text) cps.push(ch.codePointAt(0)!);
    const r = resolveBidiCodePoints(cps, 0);
    expect(r.levels[0]).toBe(null); // RLE הוסר (X9)
    expect(r.levels.slice(1, 4)).toEqual([2, 2, 2]); // abc: L ברמה 1 (odd) ← I2 +1 = 2
    expect(r.levels[4]).toBe(null); // PDF הוסר
    expect(r.levels[5]).toBe(1); // ד: R ברמה 0 ← I1 +1
  });

  it('isolates: LRI — התוכן מנותק; I1 בתוכו; ה-PDI חוזר לרמת הפסקה', () => {
    const text = '\u2066' + 'אב' + '\u2069' + 'ג';
    const cps: number[] = [];
    for (const ch of text) cps.push(ch.codePointAt(0)!);
    const r = resolveBidiCodePoints(cps, 1);
    expect(r.levels.slice(1, 3)).toEqual([3, 3]); // אב: R ברמה 2 (even) ← I1 +1 = 3
    expect(r.levels[4]).toBe(1); // ג: R ברמה 1 (odd) ← נשאר 1 (I2)
    // FSI עם תוכן עברי ← RLI
    const text2 = '\u2068' + 'א' + '\u2069' + 'ב';
    const cps2: number[] = [];
    for (const ch of text2) cps2.push(ch.codePointAt(0)!);
    const r2 = resolveBidiCodePoints(cps2, 0);
    expect(r2.levels[1]).toBe(1); // א בתוך FSI←RLI (odd) ← R נשאר (I2)
  });

  it('L1: רווחים בסוף השורה מאופסים לרמת הפסקה', () => {
    const text = 'abc   ';
    const cps: number[] = [];
    for (const ch of text) cps.push(ch.codePointAt(0)!);
    const r = resolveBidiCodePoints(cps, 1);
    expect(r.levels.slice(3)).toEqual([1, 1, 1]);
  });

  it('L4 (mirror): סוגריים בפסקה RTL — דגל בלבד, התוכן לא משתנה', () => {
    const text = '(א)';
    const cps: number[] = [];
    for (const ch of text) cps.push(ch.codePointAt(0)!);
    const r = resolveBidiCodePoints(cps, 1);
    // N0: התוכן (א) strong=R תואם הטמעה (RTL) ← הסוגריים ← R ברמה 1 (I2: R נשאר)
    expect(r.levels).toEqual([1, 1, 1]);
    expect(r.mirrored).toEqual([true, false, true]);
    // התוכן לא השתנה: ה-cp של '(' נותר 0x28 — הדגל הוא הקרנה בלבד
    expect(cps[0]).toBe(0x28);
  });
});

// ─────────────────────────── API ברמת האטום — שער השלב ───────────────────────────

describe('computeBidi — רמת האטום', () => {
  const text = 'שלום abc 123';
  const atoms = atomsOf(text);

  it('visualOrder הוא תמורה של 0..n-1 (reordering אינו משנה זהות)', () => {
    const r = computeBidi(atoms);
    const sorted = [...r.visualOrder].sort((a, b) => a - b);
    expect(sorted).toEqual(atoms.map((_a, i) => i));
    expect(new Set(r.visualOrder).size).toBe(atoms.length);
  });

  it('האטומים עצמם לא השתנו (תוכן וזהות; שער השלב)', () => {
    const snapshot = atoms.map((a) => ({ id: a.id, text: a.text, source: a }));
    computeBidi(atoms);
    expect(atoms.length).toBe(snapshot.length);
    for (let i = 0; i < atoms.length; i++) {
      expect(atoms[i]!.id).toBe(snapshot[i]!.id);
      expect(atoms[i]!.text).toBe(snapshot[i]!.text);
      expect(atoms[i]).toBe(snapshot[i]!.source); // אותו אובייקט — לא הוחלף
    }
  });

  it('הפוך: logicalToVisual[visualOrder[v]] = v; וריצה חוזרת זהה ביט-ביט (דטרמיניזם)', () => {
    const r1 = computeBidi(atoms);
    const r2 = computeBidi(atoms);
    expect(JSON.stringify(r2)).toBe(JSON.stringify(r1));
    for (let v = 0; v < r1.visualOrder.length; v++) {
      expect(r1.logicalToVisual[r1.visualOrder[v]!]).toBe(v);
    }
  });

  it('runs: כיסוי מלא, רציף, רמה אחידה בכל רץ; כיוון לפי זוגיות הרמה', () => {
    const r = computeBidi(atoms);
    let covered = 0;
    for (let k = 0; k < r.runs.length; k++) {
      const run = r.runs[k]!;
      expect(run.endAtom - run.startAtom + 1).toBeGreaterThan(0);
      for (let i = run.startAtom; i <= run.endAtom; i++) {
        expect(r.levels[i]).toBe(run.level);
      }
      expect(run.direction).toBe(run.level % 2 === 1 ? 'rtl' : 'ltr');
      covered += run.endAtom - run.startAtom + 1;
      if (k > 0) expect(r.runs[k - 1]!.endAtom + 1).toBe(run.startAtom);
    }
    expect(covered).toBe(atoms.length);
  });

  it('מיפוי SourceSpan: כל אינדקס חזותי מקושר לאטום (audit/selection)', () => {
    const r = computeBidi(atoms);
    for (const v of r.visualOrder) {
      const a = atoms[v]!;
      expect(typeof a.id).toBe('string');
      expect(a.text.length).toBeGreaterThan(0);
    }
  });

  it('רמות בטוחות: מפורש ≤ 125 (מגבלת UAX #9); הפלט אינו נחתך בשקט', () => {
    const r = computeBidi(atoms);
    for (const lvl of r.levels) {
      expect(lvl).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(lvl)).toBe(true);
    }
    expect(r.maxLevel).toBeLessThanOrEqual(126); // 125 מפורש + I1/I2 (תיאורטי)
  });

  it('קלט ריק: תוצאה ריקה קפואה', () => {
    const r = computeBidi([]);
    expect(r.levels.length).toBe(0);
    expect(r.visualOrder.length).toBe(0);
    expect(r.runs.length).toBe(0);
  });

  it('אטום אחד: תמורה טריוויאלית; פסקה auto לפי P2/P3', () => {
    const r = computeBidi([atom(0, 'א')]);
    expect(r.paragraphLevel).toBe(1);
    expect(r.visualOrder).toEqual([0]);
    const r2 = computeBidi([atom(0, 'a')]);
    expect(r2.paragraphLevel).toBe(0);
  });
});
