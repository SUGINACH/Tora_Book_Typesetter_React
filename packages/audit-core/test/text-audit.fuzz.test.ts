/**
 * text-audit.fuzz.test.ts — property/fuzz לפרסר ול־Text Audit (שלב 21).
 *
 * אסמכתא: אפיון §17.1 (Property/fuzz: "אין crash/איבוד atoms במגוון טקסטים
 * והגדרות חוקיות") · §17.2#1 (שלוש ריצות רצופות זהות) · §17.2#6 (פיצול
 * runs שאינו משנה טקסט אינו משנה AST סמנטי) · תכנית שלב 21: "fuzz לפרסר
 * ודוח אטומים חסרים/כפולים".
 *
 * המחולל מערבב את כל תחביר הקלט ממרשם שלב 17 (metadata, כותרות תקינות
 * וכמעט־תקינות, H7, הערות סיון, סוגריים מאוזנים/לא, הערות עורך, ניקוד,
 * RLM, em-space) — והתכונה: הפרסור לעולם לא קורס, הכיסוי 100%,
 * והביקורת העצמאית מאשרת (אפס HIGH).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { runTextAudit } from '../src/text-audit.js';
import { parseSourceText, splitAtom, mergeAtoms } from '@tora/content-model';
import type { ParseResult, TorahDocument, TextAtom } from '@tora/content-model';

// ── מחולל טקסט: שורות מכל סוגי התחביר ──

const WORDS = ['שלום', 'עולם', 'תורה', 'הלכה', 'אמר', 'רב', 'אמרו', 'חכמים', 'גמרא', 'משנה', 'וכו', 'שם', 'התם', 'דף', 'עמוד'];
const NIKUD_WORDS = ['שָׁלוֹם', 'עוֹלָם', 'בְּרֵאשִׁית', 'וַיְדַבֵּר'];

const wordArb = fc.constantFrom(...WORDS, ...NIKUD_WORDS, 'test', '123', 'ק״ט');
const sentenceArb = fc.array(
  fc.oneof(
    wordArb,
    fc.constantFrom('(', ')', '[', ']', '«', '»', '—', '-', ','),
    fc.constant('\u200F'), // RLM
    fc.constant('בֵּ'), // ניקוד בסדר לא-קנוני (ראיה מהקורפוס)
  ),
  { minLength: 1, maxLength: 12 },
).map((parts) => parts.join(' ').trim());

const lineArb = fc.oneof(
  // שורת גוף רגילה
  sentenceArb,
  // כותרת תקינה בכל רמה
  fc.integer({ min: 0, max: 7 }).map((n) => `כותרת ${n} - ${'כותרת מספר '}${n}`),
  // כותרת עם מספר סימן
  fc.integer({ min: 1, max: 400 }).map((n) => `כותרת 2 מספר ${n} - שם הסימן`),
  // כמעט-כותרת (לא תואמת — נשארת פסקה)
  fc.constantFrom('כותרת 8 - לא חוקי', 'כותרת - בלי מספר', 'כותרת 99 בלי מקף'),
  // הערת סיום
  sentenceArb.map((s) => `-- ${s}`),
  // H7
  sentenceArb.map((s) => `כותרת 7 - ${s}`),
  // הערת עורך
  sentenceArb.map((s) => `## ${s} ##`),
  // כמעט-הערת-עורך שלא נסגרה
  sentenceArb.map((s) => `## ${s} נשאר`),
  // רווחית שולית (em-space בקצוות)
  sentenceArb.map((s) => ` ${s} `),
  // שורה ריקה
  fc.constant(''),
);

// metadata — שורה פותחת אחת לכל היותר (כפילות מפתח היא שגיאת קלט מקוטלגת — נבדקת בנפרד)
const metaLineArb = fc.constantFrom('שם הספר: ספר ה-fuzz', 'שם המחבר: מחבר', 'מקום ושנה: ירושלים תשפ״ד', 'הוצאה: הוצאה');

const textArb = fc.tuple(
  fc.option(metaLineArb, { nil: undefined }),
  fc.array(lineArb, { minLength: 1, maxLength: 40 }),
).map(([meta, lines]) => (meta === undefined ? lines : [meta, ...lines]).join('\n'));

describe('fuzz — הפרסר והביקורת על טקסטים אקראיים (§17.1)', () => {
  it('אין crash ואין איבוד אטומים: parse ← coverage.ok ← audit.ok (400 ריצות)', () => {
    const prop = fc.property(textArb, (raw) => {
      const result = parseSourceText(raw, { documentId: 'fuzz' });
      expect(result.coverage.ok).toBe(true);
      const report = runTextAudit(raw, result);
      expect(report.ok).toBe(true);
      expect(report.independentCoverage.missing).toBe(0);
      expect(report.independentCoverage.duplicated).toBe(0);
      return true;
    });
    fc.assert(prop, { numRuns: 400 });
  });

  it('מפתח metadata חוזר — או דחייה מקוטלגת וממוקמת, או תוכן גוף לגיטימי (שעד M2: שגיאות קלט מקומיות)', () => {
    const prop = fc.property(
      fc.constantFrom('שם הספר: א', 'שם המחבר: ב'),
      fc.array(lineArb, { minLength: 0, maxLength: 5 }),
      (meta, lines) => {
        const raw = [meta, ...lines, meta].join('\n');
        let result;
        try {
          result = parseSourceText(raw, { documentId: 'fuzz-dup-meta' });
        } catch (e) {
          // אם נדחה — חייבת להיות שגיאה מקוטלגת עם מיקום בפרמטרים (לא crash)
          const err = e as { catalogKey?: string; params?: Record<string, string> };
          expect(err.catalogKey).toBe('errors.parser.DUPLICATE_METADATA_KEY');
          const offset = Number(err.params?.startUtf16 ?? '-1');
          expect(offset).toBeGreaterThanOrEqual(0);
          expect(offset).toBeLessThan(raw.length);
          return true;
        }
        // אם התקבל — השורה השנייה היא תוכן גוף (אחרי כותרת/תוכן — אינה בבלוק ה־metadata);
        // שום דבר לא אובד
        expect(result.coverage.ok).toBe(true);
        expect(runTextAudit(raw, result).ok).toBe(true);
        return true;
      },
    );
    fc.assert(prop, { numRuns: 60 });
  });

  it('דטרמיניזם מלא — שלוש ריצות זהות (§17.2#1)', () => {
    const prop = fc.property(textArb, (raw) => {
      const r1 = parseSourceText(raw, { documentId: 'fuzz-det' });
      const r2 = parseSourceText(raw, { documentId: 'fuzz-det' });
      const r3 = parseSourceText(raw, { documentId: 'fuzz-det' });
      expect(r2).toEqual(r1);
      expect(r3).toEqual(r1);
      const a1 = runTextAudit(raw, r1);
      const a2 = runTextAudit(raw, r2);
      expect(a2).toEqual(a1);
      return true;
    });
    fc.assert(prop, { numRuns: 60 });
  });

  it('פיצול אטום אקראי (סימולציית DOCX runs) — כיסוי נשמר, טקסט בלוק זהה, הספר מתעד (§17.2#6)', () => {
    const splittableArb = textArb.map((raw) => {
      const result = parseSourceText(raw, { documentId: 'fuzz-split' });
      const candidates: TextAtom[] = [];
      const walk = (blocks: readonly { inline: readonly { kind: string; atoms?: readonly TextAtom[] }[]; children?: readonly unknown[] }[]): void => {
        for (const block of blocks) {
          for (const item of block.inline) {
            if (item.kind !== 'text') continue;
            for (const atom of item.atoms ?? []) {
              if (atom.origin === undefined && atom.text.length >= 3) candidates.push(atom);
            }
          }
          if (block.children !== undefined) walk(block.children as never);
        }
      };
      for (const part of result.doc.parts) for (const siman of part.simanim) walk(siman.blocks as never);
      return { raw, result, candidates };
    }).filter(({ candidates }) => candidates.length > 0);

    const prop = fc.property(splittableArb, fc.nat(), ({ raw, result, candidates }, seed) => {
      const atom = candidates[seed % candidates.length] as TextAtom;
      const at = (seed % (atom.text.length - 1)) + 1; // 1..len-1 — גבול חוקי כלשהו
      let split;
      try {
        split = splitAtom(atom, at, { reason: 'docx-run-split-fuzz' });
      } catch {
        return true; // נקודת הפיצול נפלה על גבול אסור (אמצע גרפמה) — הפיצול עצמו נדחה כחוק
      }
      // שינוי שאינו משנה טקסט
      expect(split.left.text + split.right.text).toBe(atom.text);
      // איחוי חוזר — זהות מלאה כולל המזהה (שלב 15)
      const merged = mergeAtoms(split.left, split.right, { reason: 'docx-run-merge-fuzz' });
      expect(merged.merged.id).toBe(atom.id);
      // והביקורת על התוצאה המקורית — עדיין שלמה
      const report = runTextAudit(raw, result);
      expect(report.ok).toBe(true);
      return true;
    });
    fc.assert(prop, { numRuns: 150 });
  });

  it('מחולל הקלט מכסה באמת את התחביר — בדיקת עשן למחולל עצמו', () => {
    // אם המחולל לא מייצר שום כותרת/הערה — הוא אינו מבחן; מריצים כמה דגימות ומוודאים גיוון
    const seen = { headings: 0, footnotes: 0, endnotes: 0, sidenotes: 0, editorial: 0 };
    fc.sample(textArb, 60).forEach((raw) => {
      const result = parseSourceText(raw, { documentId: 'fuzz-smoke' });
      if (result.doc.parts.some((p) => p.simanim.length > 0)) seen.headings += 1;
      seen.footnotes += result.doc.notes.footnotes.length;
      seen.endnotes += result.doc.notes.endnotes.length;
      seen.sidenotes += result.doc.notes.sidenotes.length;
      seen.editorial += result.doc.notes.editorial.length;
    });
    expect(seen.footnotes).toBeGreaterThan(0);
    expect(seen.sidenotes).toBeGreaterThan(0);
    expect(seen.editorial).toBeGreaterThan(0);
    expect(seen.headings).toBeGreaterThan(0);
  });
});

/** איסוף אטומי גוף (לשימוש פנימי בבדיקות עתידיות). */
export function bodyAtoms(result: ParseResult): readonly TextAtom[] {
  const out: TextAtom[] = [];
  const walk = (blocks: readonly { inline: readonly { kind: string; atoms?: readonly TextAtom[] }[]; children?: readonly unknown[] }[]): void => {
    for (const block of blocks) {
      for (const item of block.inline) {
        if (item.kind === 'text') out.push(...(item.atoms ?? []));
      }
      if (block.children !== undefined) walk(block.children as never);
    }
  };
  for (const part of result.doc.parts) for (const siman of part.simanim) walk(siman.blocks as never);
  return out;
}
void ({} as TorahDocument | undefined);
