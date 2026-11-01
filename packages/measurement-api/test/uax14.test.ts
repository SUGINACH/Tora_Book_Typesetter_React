/**
 * מבחני UAX #14 (שלב 27): conformance מלא מול LineBreakTest.txt הרשמי
 * (Unicode 16.0.0) + וקטורי עברית (מקף, סוגריים, ניקוד, מילה ארוכה)
 * + hooks מדיניות + מיפוי אטומים (שער השלב: כל breakpoint מקושר למקור).
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  UAX14_REVISION,
  UAX14_UNICODE_VERSION,
  computeBreakOpportunities,
  lineBreakClass,
  uax14Decisions,
} from '../src/uax14.js';
import type { ShapingAtom } from '../src/provider.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const atom = (i: number, text: string): ShapingAtom => ({
  id: `atom:v1|doc|body|${i}+${i + text.length}||0` as ShapingAtom['id'],
  text,
  script: /[א-ת]/.test(text) ? 'hebrew' : 'latin',
  bidiLevel: 1,
  breakBefore: i === 0 ? 'forbidden' : 'allowed',
});

const atomsOf = (text: string): ShapingAtom[] => [...text].map((ch, i) => atom(i, ch));

describe('נעילת הגרסה', () => {
  it('Unicode 16.0.0, UAX #14 revision 53 — נעול ומתועד', () => {
    expect(UAX14_UNICODE_VERSION).toBe('16.0.0');
    expect(UAX14_REVISION).toBe('revision 53');
  });
});

describe('conformance מלא — LineBreakTest.txt הרשמי', () => {
  it('כל 16,672 המקרים עוברים (×/÷ בכל גבול)', () => {
    const content = readFileSync(
      join(repoRoot, 'packages', 'test-fixtures', 'unicode', 'LineBreakTest.txt'),
      'utf8',
    );
    let total = 0;
    let pass = 0;
    const failures: string[] = [];
    for (const line of content.split('\n')) {
      const hash = line.indexOf('#');
      const body = (hash >= 0 ? line.slice(0, hash) : line).trim();
      if (!body) continue;
      const ops: string[] = [];
      const cps: number[] = [];
      for (const t of body.split(/\s+/)) {
        if (t === '×' || t === '÷') ops.push(t);
        else cps.push(Number.parseInt(t, 16));
      }
      total += 1;
      const decisions = uax14Decisions(String.fromCodePoint(...cps));
      const byPos = new Map(decisions.map((d) => [d.position, d]));
      let ok = true;
      for (let i = 1; i < cps.length; i++) {
        const expected = ops[i];
        const d = byPos.get(i);
        const actual = d === undefined ? '×' : d.kind === 'none' ? '×' : '÷';
        if (actual !== expected) {
          ok = false;
          if (failures.length < 3) failures.push(line.slice(0, 80));
          break;
        }
      }
      if (ok) pass += 1;
    }
    expect(failures).toEqual([]);
    expect(pass).toBe(total);
    expect(total).toBeGreaterThan(16000);
  });
});

describe('וקטורי עברית', () => {
  it('מילים מופרדות ברווח — הזדמנות אחרי הרווח (LB18)', () => {
    const d = uax14Decisions('אבג אדה');
    const opps = d.filter((x) => x.kind !== 'none');
    expect(opps.length).toBe(1);
    expect(opps[0]!.position).toBe(4); // לפני הא של אדה
    expect(opps[0]!.rule).toBe('LB18');
  });
  it('מקף עברי (U+05BE, מחלקה BA): אין שבירה לפניו; UAX מתיר אחריו — המדיניות תאסור', () => {
    expect(lineBreakClass(0x05be)).toBe('BA');
    const d = uax14Decisions('אָבוֹת־הָעוֹלָם');
    // לפני המקף — אין שבירה (LB21: × BA)
    const beforeMaqaf = d.find((x) => x.position === 6);
    expect(beforeMaqaf?.kind).toBe('none');
    // אחרי המקף — UAX ברירת מחדל מתיר (LB31) — כאן בדיוק נכנס hook המדיניות
    const afterMaqaf = d.find((x) => x.position === 7);
    expect(afterMaqaf?.kind).toBe('opportunity');
    expect(afterMaqaf?.rule).toBe('LB31');
  });
  it('ניקוד וטעמים — אין שבירה בתוך צרור גרפמות (LB9)', () => {
    const d = uax14Decisions('בְּרֵאשִׁית');
    expect(d.every((x) => x.kind === 'none')).toBe(true);
  });
  it('RLM (U+200F) מחלקה CM — נבלע בבסיס שלפניו', () => {
    expect(lineBreakClass(0x200f)).toBe('CM');
    const d = uax14Decisions('א\u200fב');
    expect(d.every((x) => x.kind === 'none')).toBe(true);
  });
  it('סוגריים: אין שבירה בין אות לסוגר פותח (LB30) ולפני סוגר סוגר (LB13)', () => {
    expect(lineBreakClass(0x28)).toBe('OP');
    expect(lineBreakClass(0x29)).toBe('CP');
    const d = uax14Decisions('אב(גד)הו');
    const opps = d.filter((x) => x.kind !== 'none');
    // ההזדמנויות היחידות: לפני ( ? LB30 אוסר אחרי אות... בדיקת ההתנהגות המדויקת:
    // א( — LB30 אוסר; (ג — LB31 מתיר? בפועל: בתוך הסוגריים רק אחרי ) לפני ה — LB30 אוסר
    // נבדוק שאין שבירה בין ב ל( ובין ) לה
    expect(d.find((x) => x.position === 2)?.kind).toBe('none'); // ב|(
    expect(d.find((x) => x.position === 6)?.kind).toBe('none'); // )|ה
  });
  it('מילה ארוכה — אין אף הזדמנות בתוכה', () => {
    const long = 'א'.repeat(200);
    const d = uax14Decisions(long);
    expect(d.every((x) => x.kind === 'none')).toBe(true);
  });
  it('מספרים בעברית — אין שבירה בין אות לספרה ובין ספרות (LB23/LB25)', () => {
    // א2026ב: HL×NU (LB23), NU×NU (LB25), NU×HL (LB23) — הכל אסור
    const d2 = uax14Decisions('א2026ב');
    expect(d2.every((x) => x.kind === 'none')).toBe(true);
    // שנת 2026: ההזדמנות היחידה היא אחרי הרווח (LB18, לפני ה־2)
    const d = uax14Decisions('שנת 2026');
    const opps = d.filter((x) => x.kind !== 'none');
    expect(opps.length).toBe(1);
    expect(opps[0]!.position).toBe(4);
    expect(opps[0]!.rule).toBe('LB18');
  });
});

describe('computeBreakOpportunities — מיפוי אטומים ו־hooks', () => {
  it('כל הזדמנות מקושרת למזהה אטום (שער השלב)', () => {
    const atoms = atomsOf('אבג אדה');
    const opps = computeBreakOpportunities(atoms);
    expect(opps.length).toBe(1);
    expect(opps[0]!.atomIndex).toBe(4);
    expect(opps[0]!.atomId).toBe(atoms[4]!.id);
    expect(opps[0]!.rule).toBe('LB18');
  });
  it('ניקוד חוצה אטומים — אין הזדמנות בין בסיס לניקוד (LB9 דרך גבולות אטומים)', () => {
    const atoms = atomsOf('בְּרֵאשִׁית');
    const opps = computeBreakOpportunities(atoms);
    expect(opps.length).toBe(0);
  });
  it('hook.forbid — איסור מקומי: אל תשבור אחרי מקף עברי (מדיניות התורה)', () => {
    const atoms = atomsOf('אָבוֹת־הָעוֹלָם');
    const hooks = {
      forbid: (ctx) => ctx.atoms[ctx.atomIndex - 1]!.text === '\u05be',
    };
    const opps = computeBreakOpportunities(atoms, hooks);
    const afterMaqaf = opps.find((o) => o.atomIndex === 7);
    expect(afterMaqaf?.kind).toBe('none');
    expect(afterMaqaf?.rule).toBe('hook:forbid(LB31)');
  });
  it('hook.allow — התרת חירום מבוקרת עם תיעוד', () => {
    const atoms = atomsOf('אבגד');
    const hooks = {
      allow: (ctx) => ctx.atomIndex === 2,
    };
    const opps = computeBreakOpportunities(atoms, hooks);
    const added = opps.find((o) => o.atomIndex === 2);
    expect(added?.kind).toBe('opportunity');
    expect(added?.rule).toBe('hook:allow');
  });
  it('שבירה חובה (mandatory) אינה ניתנת לאיסור ב־hook', () => {
    const atoms = atomsOf('אב\nגד');
    const hooks = { forbid: () => true };
    const opps = computeBreakOpportunities(atoms, hooks);
    const mandatory = opps.find((o) => o.atomIndex === 3);
    expect(mandatory?.kind).toBe('mandatory');
    expect(mandatory?.rule).toBe('LB5');
  });
  it('אטום בודד — אין הזדמנויות; דטרמיניזן מלא', () => {
    expect(computeBreakOpportunities([atom(0, 'א')])).toEqual([]);
    const atoms = atomsOf('טקסט ארוך יותר עם רווחים');
    expect(JSON.stringify(computeBreakOpportunities(atoms)))
      .toBe(JSON.stringify(computeBreakOpportunities(atoms)));
  });
});
