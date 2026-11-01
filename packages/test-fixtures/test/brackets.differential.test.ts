/**
 * brackets.differential.test.ts — differential עץ סוגריים מול הישן (שלב 19).
 *
 * אסמכתא: אפיון §10.4 · תכנית שלב 19. ה־oracle: ‎findMatchingCloseBracket‎
 * מה־react-lock המוחזק (@ 0c7b9927, מאומת מול manifest.json) — זיווג
 * פר־סוג בספירת עומק, אותו אלגוריתמם של ‎hasOpenBracket/protectParens‎
 * מ־src/worker/engine/paren-protector.ts הקפוא.
 *
 * נגזרת ה־oracle לפי בלוק: ‎hasOpenBracket(text)‎ (עומק > 0 בסוף, עם
 * איפוס עגול לשליליים) שקול לקיום פתיחה שלא נסגרה לפי המאפיין —
 * ‎∃i: text[i]=='[' ∧ findMatchingCloseBracket(text,i,'[',']') == -1‎.
 * השקילות נבדקה מול הקוד הקפוא (חמשת הווקטורים בבדיקת העשן).
 *
 * ההשוואה רצה על כל קובצי הקורפוס (‎*.txt‎) — לכל זרימה (גוף + הערות):
 *   · לכל זוג בעץ החדש — ה־oracle מוצא את אותה סגירה על טקסט התוכן (או ‎-1‎).
 *   · לכל בלוק — פתיחה מרובעת שלא נסגרה ⟺ יציאה עם מרובע פתוח (בדיוק
 *     התנאי ש־protectParens הישן הגן עליו בהעברת בלוקים בין טורים).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMatchingCloseBracket } from '../legacy/react-lock/src/parser/nested-bracket-matcher.ts';
import { scanBrackets, parseSourceText, allBlocks } from '../../content-model/dist/index.js';
import type { BracketScan, ContentBlock, TorahDocument } from '../../content-model/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '..');
const corpusRoot = join(fixturesRoot, 'corpus');
const corpusFiles: string[] = [];
(function walk(dir: string): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.txt')) corpusFiles.push(p);
  }
})(corpusRoot);

/** hasOpenBracket הישן — נגזר מה־oracle הנעול (ראש דוקומנטציה). */
function legacyHasOpenBracket(text: string): boolean {
  for (let i = 0; i < text.length; i = i + 1) {
    if (text[i] === '[' && findMatchingCloseBracket(text, i, '[', ']') === -1) return true;
  }
  return false;
}

/** בלוקי הזרימה בסדר הסריקה — אותו סדר כמו scanBrackets. */
function flowBlocks(scan: BracketScan, doc: TorahDocument): readonly ContentBlock[] {
  const out: ContentBlock[] = [];
  const walk = (list: readonly ContentBlock[]): void => {
    for (const b of list) {
      out.push(b);
      if (b.children !== undefined) walk(b.children);
    }
  };
  if (scan.noteId === undefined) {
    for (const part of doc.parts) for (const siman of part.simanim) walk(siman.blocks);
  } else {
    for (const key of ['footnotes', 'endnotes', 'sidenotes', 'editorial'] as const) {
      for (const note of doc.notes[key]) {
        if (note.noteId === scan.noteId) walk([note.block]);
      }
    }
  }
  return out;
}

/** טקסט התוכן של זרימה + מיפוי עמדת־תוכן → היסט מקור. */
function contentText(scan: BracketScan, doc: TorahDocument): { text: string; toSource: readonly number[] } {
  let text = '';
  const toSource: number[] = [];
  for (const block of flowBlocks(scan, doc)) {
    for (const item of block.inline) {
      if (item.kind !== 'text') continue;
      for (const atom of item.atoms) {
        text = text + atom.text;
        for (let i = 0; i < atom.text.length; i = i + 1) toSource.push(atom.source.startUtf16 + i);
      }
    }
  }
  return { text, toSource };
}

function blockText(block: ContentBlock): string {
  let text = '';
  for (const item of block.inline) {
    if (item.kind !== 'text') continue;
    for (const atom of item.atoms) text = text + atom.text;
  }
  return text;
}

describe('differential סוגריים מול הישן — כל קורפוס הבדיקה (שלב 19)', () => {
  it('ה־oracle הנעול באמת רץ — וקטורים מהקוד הקפוא (nested-bracket-matcher)', () => {
    // הדוגמה המילולית מהקובץ הנעול: findMatchingCloseBracket("[outer [inner] still]", 0, "[", "]") === 20
    expect(findMatchingCloseBracket('[outer [inner] still]', 0, '[', ']')).toBe(20);
    expect(findMatchingCloseBracket('[unclosed', 0, '[', ']')).toBe(-1);
    // נגזרת hasOpenBracket מול התנהגות paren-protector הקפוא (חמישה וקטורים)
    expect(legacyHasOpenBracket('מילה [פתוחה')).toBe(true);
    expect(legacyHasOpenBracket('מילה [סגורה] רגילה')).toBe(false);
    expect(legacyHasOpenBracket('סתם ] עזוב')).toBe(false); // סגירה עזובה מתאפסת — לא פותחת
    expect(legacyHasOpenBracket('] [ עזובה ואז פתוחה')).toBe(true);
    expect(legacyHasOpenBracket('[ [ פנימי ] עוד פתוח')).toBe(true);
    expect(legacyHasOpenBracket('')).toBe(false);
  });

  it('לכל קובץ: הזיווג זהה ל־findMatchingCloseBracket הישן', () => {
    expect(corpusFiles.length).toBeGreaterThan(50);
    let pairChecks = 0;
    const mismatches: string[] = [];
    for (const file of corpusFiles) {
      const raw = readFileSync(file, 'utf8');
      const rel = file.slice(corpusRoot.length + 1);
      const result = parseSourceText(raw, { documentId: `diff-19/${rel}` });
      for (const scan of [result.brackets.body, ...result.brackets.notes.map((n) => n.scan)]) {
        const { text, toSource } = contentText(scan, result.doc);
        const sourceToContent = new Map<number, number>();
        for (let i = 0; i < toSource.length; i = i + 1) sourceToContent.set(toSource[i] as number, i);
        for (const pair of scan.pairs) {
          const openChar = pair.kind === 'round' ? '(' : '[';
          const closeChar = pair.kind === 'round' ? ')' : ']';
          const openIdx = sourceToContent.get(pair.openSpan.startUtf16);
          if (openIdx === undefined) {
            mismatches.push(`${rel}: פתיחה ללא עמדת תוכן`);
            continue;
          }
          const legacyClose = findMatchingCloseBracket(text, openIdx, openChar, closeChar);
          pairChecks += 1;
          if (pair.closeSpan !== undefined) {
            const mineIdx = sourceToContent.get(pair.closeSpan.startUtf16);
            if (legacyClose !== mineIdx) {
              mismatches.push(`${rel}: זיווג שונה (ישן ${legacyClose}, חדש ${mineIdx})`);
            }
          } else if (legacyClose !== -1) {
            mismatches.push(`${rel}: הישן סוגר ב־${legacyClose}, החדש מדווח לא-סגור`);
          }
        }
      }
    }
    expect(pairChecks).toBeGreaterThan(100);
    expect(mismatches).toEqual([]);
  });

  it('parity של protectParens: hasOpenBracket(בלוק) ⟺ יציאה עם מרובע פתוח', () => {
    let blockChecks = 0;
    const mismatches: string[] = [];
    for (const file of corpusFiles) {
      const raw = readFileSync(file, 'utf8');
      const rel = file.slice(corpusRoot.length + 1);
      const result = parseSourceText(raw, { documentId: `diff-19b/${rel}` });
      for (const scan of [result.brackets.body, ...result.brackets.notes.map((n) => n.scan)]) {
        const blocks = flowBlocks(scan, result.doc);
        for (let i = 0; i < scan.blockStates.length; i = i + 1) {
          const state = scan.blockStates[i] as { blockId: string; openAtEnd: readonly string[] };
          const block = blocks[i];
          if (block === undefined || block.id !== state.blockId) continue;
          const legacyOpen = legacyHasOpenBracket(blockText(block));
          const mineOpen = state.openAtEnd.some((id) => scan.pairs.find((p) => p.id === id)?.kind === 'square');
          blockChecks += 1;
          if (legacyOpen !== mineOpen) mismatches.push(`${rel}#${state.blockId.slice(0, 40)}: ישן=${legacyOpen} חדש=${mineOpen}`);
        }
      }
    }
    expect(blockChecks).toBeGreaterThan(500);
    expect(mismatches).toEqual([]);
  });

  it('עשן מבני: סריקה עצמאית שווה לזו שבתוצאת הפרסור; זוגות חוצי בלוקים בקורפוס', () => {
    const raw = readFileSync(join(corpusRoot, 'canonical', 'very_long_test_text.txt'), 'utf8');
    const result = parseSourceText(raw, { documentId: 'diff-19-determinism' });
    const again = scanBrackets(result.doc);
    expect(again).toEqual(result.brackets);
    expect(result.brackets.body.pairs.length).toBeGreaterThan(1000);
    // זוגות חוצי בלוקים קיימים בקורפוס בפועל (long_test_text_2) — המקרה שהמנוע חייב להכיר
    const raw2 = readFileSync(join(corpusRoot, 'long', 'long_test_text_2.txt'), 'utf8');
    const result2 = parseSourceText(raw2, { documentId: 'diff-19-crossing' });
    expect(result2.brackets.body.pairs.filter((p) => p.blockIds.length > 1).length).toBeGreaterThan(0);
    // הקנוני: כל 2,508 הזוגות בתוך בלוקים בודדים (עגולים בלבד) — 3 בעיות מדווחות
    expect(result.brackets.body.pairs.every((p) => p.kind === 'round')).toBe(true);
    expect(result.brackets.body.issues.length).toBe(3);
  });
});
