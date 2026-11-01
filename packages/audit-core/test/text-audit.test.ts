/**
 * text-audit.test.ts — בדיקות Text Audit v1 (שלב 21, שער M2).
 *
 * אסמכתא: אפיון §14.1–14.3 · §18-M2 ("round-trip של כל fixtures מוכיח 100%
 * atom coverage") · תכנית שלב 21: "100% source atoms מכוסים או מסומני
 * suppression/insertion מוצהרים".
 *
 * שיטה: קלטים תקינים ← דוח ok; זיופים מבוקרים (השמטת אטום, שכפול,
 * יתומה, sentinel, ספר שבור) ← הממצא הנכון נתפס עם מיקום. הביקורת
 * מחושבת מהמסמך בלי לסמוך על הוכחת הפרסר (§14 "בלתי תלוי").
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTextAudit, TEXT_AUDIT_FINDING_CODES, isRegisteredAuditErrorKey } from '../src/text-audit.js';
import { parseSourceText, splitAtom } from '@tora/content-model';
import type { ParseResult, TorahDocument } from '@tora/content-model';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '..', '..', 'test-fixtures');
const corpusRoot = join(fixturesRoot, 'corpus');

const SAMPLE = [
  'שם הספר: ספר הבדיקות',
  'כותרת 1 - חלק ראשון',
  'כותרת 2 - סימן ראשון',
  'פסקה ראשונה עם [הערת שוליים] בפנים וגם (סוגריים) רגילים',
  'כותרת 7 - הערת צד',
  'פסקה מוצמדת להערת הצד',
  '-- הערת סיום אחת',
  'לפני ## הערת עורך להסרה ## אחרי',
  'פסקה אחרונה',
].join('\n');

function parseSample(): { raw: string; result: ParseResult } {
  const raw = SAMPLE;
  const result = parseSourceText(raw, { documentId: 'audit-sample' });
  return { raw, result };
}

/** החלפת האטום המקורי בשני ילדיו (סימולציית פיצול run של DOCX). */
function replaceAtomInDoc(doc: TorahDocument, atomId: string, replacement: readonly unknown[]): TorahDocument {
  const clone = structuredClone(doc) as TorahDocument;
  interface MutableInline { kind: string; atoms?: readonly { id: string }[] }
  interface MutableBlock { inline: MutableInline[]; children?: MutableBlock[] }
  const walk = (blocks: MutableBlock[]): boolean => {
    for (const block of blocks) {
      for (const item of block.inline) {
        if (item.kind !== 'text') continue;
        const at = (item.atoms ?? []).findIndex((a) => a.id === atomId);
        if (at >= 0) {
          const arr = [...(item.atoms ?? [])];
          arr.splice(at, 1, ...(replacement as never));
          (item as { atoms: unknown[] }).atoms = arr;
          return true;
        }
      }
      if (block.children !== undefined && walk(block.children)) return true;
    }
    return false;
  };
  for (const part of clone.parts) {
    for (const siman of part.simanim) {
      if (walk(siman.blocks as unknown as MutableBlock[])) return clone;
    }
  }
  for (const key of ['footnotes', 'endnotes', 'sidenotes', 'editorial'] as const) {
    for (const note of clone.notes[key]) {
      if (walk([note.block] as unknown as MutableBlock[])) return clone;
    }
  }
  return clone;
}

describe('runTextAudit — קלטים תקינים', () => {
  it('מסמך מלא (כל סוגי התחביר) — ok, אפס ממצאים, כיסוי 100%', () => {
    const { raw, result } = parseSample();
    const report = runTextAudit(raw, result);
    expect(report.ok).toBe(true);
    expect(report.highCount).toBe(0);
    expect(report.mediumCount).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.independentCoverage.missing).toBe(0);
    expect(report.independentCoverage.duplicated).toBe(0);
    // הסרת הערת העורך מוצהרת בספר; החדרות חיבור פסקאות נספרות
    expect(report.suppressedRecords).toBe(1);
    expect(report.insertedAtomCount).toBeGreaterThan(0);
  });

  it('דוח דטרמיניסטי — שלוש ריצות זהות (§17.2#1)', () => {
    const { raw, result } = parseSample();
    const r1 = runTextAudit(raw, result);
    const r2 = runTextAudit(raw, result);
    const r3 = runTextAudit(raw, result);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it('קובץ קורפוס אמיתי — ok על הקנוני', () => {
    const raw = readFileSync(join(corpusRoot, 'canonical', 'very_long_test_text.txt'), 'utf8');
    const result = parseSourceText(raw, { documentId: 'audit-canonical' });
    const report = runTextAudit(raw, result);
    expect(report.ok).toBe(true);
    expect(report.independentCoverage.missing).toBe(0);
    expect(report.independentCoverage.duplicated).toBe(0);
    expect(report.atomCount).toBeGreaterThan(100000);
  });

  it('כל 11 קודי הממצא רשומים; קלט שגוי נדחה', () => {
    expect(TEXT_AUDIT_FINDING_CODES.length).toBe(11);
    expect(isRegisteredAuditErrorKey('errors.audit.INVALID_INPUT')).toBe(true);
    const { result } = parseSample();
    expect(() => runTextAudit(null as never, result)).toThrowError(/errors.audit.INVALID_INPUT/);
    expect(() => runTextAudit(SAMPLE, null as never)).toThrowError(/errors.audit.INVALID_INPUT/);
  });
});

describe('runTextAudit — זיופים מבוקרים (הממצא הנכון נתפס)', () => {
  it('אטום מושמט — MISSING_ATOM עם מיקום מדויק + חילוקי דעות עם הפרסר', () => {
    const { raw, result } = parseSample();
    const doc = structuredClone(result.doc) as TorahDocument;
    let removed = false;
    for (const part of doc.parts) {
      for (const siman of part.simanim) {
        for (const block of siman.blocks) {
          for (const item of block.inline) {
            if (item.kind === 'text' && item.atoms.length > 2 && !removed) {
              (item as { atoms: unknown[] }).atoms = item.atoms.slice(0, -1);
              removed = true;
            }
          }
        }
      }
    }
    expect(removed).toBe(true);
    const report = runTextAudit(raw, { doc, syntax: result.syntax, transforms: result.transforms, coverage: result.coverage });
    expect(report.ok).toBe(false);
    const finding = report.findings.find((f) => f.code === 'audit.text.MISSING_ATOM');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('HIGH');
    expect(finding!.sourceSpans[0]!.startUtf16).toBeGreaterThan(0);
    // בדיקה צולבת: הפרסר אמר ok, הביקורת העצמאית תפסה — חילוקי דעות מדווחים
    expect(report.findings.some((f) => f.code === 'audit.text.COVERAGE_DISAGREEMENT')).toBe(true);
  });

  it('אטום משוכפל — DUPLICATE_ATOM + DUPLICATE_ATOM_ID', () => {
    const { raw, result } = parseSample();
    const doc = structuredClone(result.doc) as TorahDocument;
    outer: for (const part of doc.parts) {
      for (const siman of part.simanim) {
        for (const block of siman.blocks) {
          for (const item of block.inline) {
            if (item.kind === 'text' && item.atoms.length > 1) {
              const dup = structuredClone(item.atoms[0]);
              (item as { atoms: unknown[] }).atoms = [dup, ...item.atoms];
              break outer;
            }
          }
        }
      }
    }
    const report = runTextAudit(raw, { doc, syntax: result.syntax, transforms: result.transforms });
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.code === 'audit.text.DUPLICATE_ATOM')).toBe(true);
    expect(report.findings.some((f) => f.code === 'audit.text.DUPLICATE_ATOM_ID')).toBe(true);
    expect(report.independentCoverage.duplicated).toBeGreaterThan(0);
  });

  it('הערת שוליים יתומה (הפניה הוסרה) — ORPHAN_NOTE בדרגת MEDIUM; הטקסט לא אבד', () => {
    const { raw, result } = parseSample();
    const doc = structuredClone(result.doc) as TorahDocument;
    let removedCount = 0;
    const stripRefs = (blocks: readonly { inline: readonly { kind: string; noteId?: string }[]; children?: readonly unknown[] }[]): void => {
      for (const block of blocks) {
        const before = block.inline.length;
        (block as { inline: unknown[] }).inline = block.inline.filter((i) => !(i.kind === 'note-reference' && (i.noteId ?? '').startsWith('fn-')));
        removedCount += before - block.inline.length;
        if (block.children !== undefined) stripRefs(block.children as never);
      }
    };
    for (const part of doc.parts) {
      for (const siman of part.simanim) stripRefs(siman.blocks as never);
    }
    expect(removedCount).toBeGreaterThan(0); // ההפניה באמת הוסרה (כולל בילדי כותרות)
    const report = runTextAudit(raw, { doc, syntax: result.syntax, transforms: result.transforms });
    // הסרת הפניה אינה מאבדת טקסט — התוחמים מכוסים על ידי תחביר; הקישוריות נשברת
    expect(report.independentCoverage.missing).toBe(0);
    expect(report.findings.some((f) => f.code === 'audit.text.ORPHAN_NOTE' && f.severity === 'MEDIUM')).toBe(true);
  });

  it('ספר טרנספורמציות שבור — LEDGER_ISSUE בדרגת HIGH', () => {
    const { raw, result } = parseSample();
    const forged = [...result.transforms, {
      kind: 'suppress' as const,
      from: ['atom:v1|nowhere|body|999+1000|src|0'] as never,
      to: [] as never,
      reason: 'forged-for-test',
    }];
    const report = runTextAudit(raw, { doc: result.doc, syntax: result.syntax, transforms: forged });
    expect(report.findings.some((f) => f.code === 'audit.text.LEDGER_ISSUE' && f.severity === 'HIGH')).toBe(true);
  });

  it('HTML מילולי באטומים — ממצא LOW (איכות קלט, לא איבוד)', () => {
    const raw = 'כותרת 2 x\n\nפסקה עם <b>bold</b> מילולי';
    const result = parseSourceText(raw, { documentId: 'audit-html' });
    const report = runTextAudit(raw, result);
    expect(report.ok).toBe(true); // LOW אינו פוסל
    expect(report.findings.some((f) => f.code === 'audit.text.HTML_IN_ATOMS' && f.severity === 'LOW')).toBe(true);
  });
});

describe('runTextAudit — טרנספורמציות מוצהרות (פיצול runs של DOCX, §17.2#6)', () => {
  it('פיצול אטום מקור במקום שאינו משנה טקסט — הביקורת עדיין ok; הספר מתעד', () => {
    const { raw, result } = parseSample();
    let atomObj: { id: string; text: string } | undefined;
    outer: for (const part of result.doc.parts) {
      for (const siman of part.simanim) {
        for (const block of siman.blocks) {
          for (const item of block.inline) {
            if (item.kind !== 'text') continue;
            for (const atom of item.atoms) {
              if (atom.origin === undefined && atom.text.length >= 4) { atomObj = atom; break outer; }
            }
          }
        }
      }
    }
    expect(atomObj).toBeDefined();
    const split = splitAtom(atomObj as never, 2, { reason: 'docx-run-split-test' });
    expect(split.left.text + split.right.text).toBe((atomObj as { text: string }).text);
    const doc2 = replaceAtomInDoc(result.doc, (atomObj as { id: string }).id, [split.left, split.right]);
    // presentedAtomIds — אטומי המקור שהוגשו לפני הפיצול (האטום שנצרך + כל היתר)
    const presented = collectAtomIds(result.doc);
    const report = runTextAudit(raw, {
      doc: doc2,
      syntax: result.syntax,
      transforms: [...result.transforms, split.record],
      presentedAtomIds: presented,
    });
    expect(report.ok).toBe(true);
    expect(report.independentCoverage.missing).toBe(0);
    expect(report.independentCoverage.duplicated).toBe(0);
    expect(report.splitRecords).toBe(1);
    // הטקסט הסמנטי של הבלוק לא השתנה — פיצול שאינו משנה טקסט אינו משנה AST סמנטי (§17.2#6)
    expect(blockTexts(doc2)).toEqual(blockTexts(result.doc));
  });
});

/** מזהי כל האטומים במסמך. */
function collectAtomIds(doc: TorahDocument): string[] {
  const ids: string[] = [];
  const walk = (blocks: readonly { inline: readonly { kind: string; atoms?: readonly { id: string }[] }[]; children?: readonly unknown[] }[]): void => {
    for (const block of blocks) {
      for (const item of block.inline) {
        if (item.kind !== 'text') continue;
        for (const atom of item.atoms ?? []) ids.push(atom.id);
      }
      if (block.children !== undefined) walk(block.children as never);
    }
  };
  for (const part of doc.parts) for (const siman of part.simanim) walk(siman.blocks);
  for (const key of ['footnotes', 'endnotes', 'sidenotes', 'editorial'] as const) {
    for (const note of doc.notes[key]) walk([note.block] as never);
  }
  return ids;
}

/** הטקסט הסמנטי של כל בלוקי הגוף — להשוואת AST סמנטי. */
function blockTexts(doc: TorahDocument): string[] {
  const out: string[] = [];
  const walk = (blocks: readonly { inline: readonly { kind: string; atoms?: readonly { text: string }[] }[]; children?: readonly unknown[] }[]): void => {
    for (const block of blocks) {
      let text = '';
      for (const item of block.inline) {
        if (item.kind !== 'text') continue;
        for (const atom of item.atoms ?? []) text = text + atom.text;
      }
      out.push(text);
      if (block.children !== undefined) walk(block.children as never);
    }
  };
  for (const part of doc.parts) for (const siman of part.simanim) walk(siman.blocks);
  return out;
}
