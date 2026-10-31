/**
 * legacy-parser.differential.test.ts — מבחן differential מלא: הפרסר הישן המוחזק
 * (React lock @ 0c7b9927, מאומת ביט-ביט ב־manifest.json) מול הפרסר החדש (שלב 17).
 *
 * אסמכתא: תכנית שלב 17 — "קורפוס legacy נפרסר לאותו מבנה סמנטי; מבחן
 * differential לכל קובץ בקורפוס" · "אין הבדל מבני בלתי מוסבר מול הבייסליין".
 *
 * שיטה:
 *   1. השוואת ניתוב שורות (line-routing parity): הרצת שלבי הפרסר הישן
 *      המוחזקים אחד-לאחד, וגזירת הניתוב של כל שורה גולמית (metadata/
 *      sidenote/endnote/custom/heading/body + הטקסט שנותר אחרי חלוץ) — מול
 *      הניתוב הנגזר מהפלט החדש. הפרש מותר אך ורק אם השורה מתאימה לתבנית
 *      הגמישה של Orange (הבייסליין) ולא לתבנית React — כמתועד ברשומת
 *      heading-line במרשם המזהים.
 *   2. שוויון מבני (רצף צמתי root מוקרם) בקבצים ללא הפרשים כלל.
 *   3. הוכחת כיסוי (אין אטום אבוד) לכל קובץ.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// הפרסר הישן המוחזק — עותק מילולי מ־React @ 0c7b9927
import { parseMetadata } from '../legacy/react-lock/src/parser/metadata-parser.ts';
import { parseEditorialNotes } from '../legacy/react-lock/src/parser/editorial-note-parser.ts';
import { parseSidenotes } from '../legacy/react-lock/src/parser/sidenote-parser.ts';
import { parseEndnotes } from '../legacy/react-lock/src/parser/endnote-parser.ts';
import { parseFootnotes } from '../legacy/react-lock/src/parser/footnote-parser.ts';
import { applyCustomStyles } from '../legacy/react-lock/src/parser/custom-style-parser.ts';
import { parseHeading } from '../legacy/react-lock/src/parser/header-parser.ts';
// הפרסר החדש (dist — כמו שאר המאמתים)
import { parseSourceText } from '../../content-model/dist/index.js';
import type { ParseResult, SyntaxSpan } from '../../content-model/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '..');
const SENTINEL_STRIP = /\u0001[^\u0002]*\u0002/g;
const REF_TOKEN = '\u0001REF\u0002';

// ── תבניות להסברת הפרשים (מרשם המזהים, רשומת heading-line) ──
const REACT_HEADING_RE =
  /^כותרת\s+(\d+)(?:\s+מספר\s+(\d+)(?:\s*\((\d+)\))?)?(?:\s*[-–—]\s*|\s*–\s*|\s*—\s*|\s*-\s*)(.+)$/;
const ORANGE_LAX_RE = /^כותרת\s*(\d+).*?[-–—]\s*(.*)$/;

export const isLaxOnly = (trimmedLine: string): boolean => {
  if (!trimmedLine.startsWith('כותרת')) return false;
  const react = REACT_HEADING_RE.exec(trimmedLine);
  if (react !== null && parseInt(react[1] as string, 10) <= 7) return false;
  const orange = ORANGE_LAX_RE.exec(trimmedLine);
  return orange !== null && parseInt(orange[1] as string, 10) <= 7 && (orange[2] ?? '').trim().length > 0;
};

// ── ניתוב הישן: הרצת שלבי הפרסר הישן המוחזקים אחד-לאחד ──
export interface OldRoute {
  route: 'metadata' | 'sidenote' | 'endnote' | 'custom' | 'heading' | 'body';
  text: string;
  level?: number;
  simanNumber?: number;
  styleId?: string;
}

interface OldResult {
  routes: (OldRoute | null)[];
  groups: { from: number; to: number; route: OldRoute & { textRaw?: string; empty?: boolean } }[];
  footnotes: { text: string }[];
  endnotes: { text: string }[];
  sidenotes: { text: string }[];
  metadata: Record<string, string>;
}

export function oldRouting(raw: string): OldResult {
  const lines = raw.split('\n');
  const { metadata, lines: postMeta } = parseMetadata(lines);
  const metaEnd = lines.length - postMeta.length;
  const metaValueByKey: Record<string, string> = {};
  for (const [field, value] of Object.entries(metadata)) {
    if (typeof value === 'string' && value.length > 0) metaValueByKey[field] = value;
  }
  const postEd = parseEditorialNotes(postMeta);
  const { lines: postSide, sidenotes } = parseSidenotes(postEd);
  const { lines: postEnd, endnotes } = parseEndnotes(postSide, 'הערת סיום -');

  // ── העתקת סריקת הסוגריים של הישן עם מיפוי קואורדינטות ──
  // ההערה עשויה לחצות שורות: התוכן (כולל \n) מוחלף ב-placeholder בטקסט
  // המחובר — ולכן מספר השורות אחרי החילוץ קטן! בונים joined עם מיפוי
  // char→postSide-index, מריצים את האלגוריתם הישן מילה במילה, ומניבים
  // "שורות סופיות" שכל אחת עוטפת טווח שורות postSide.
  const joinedPieces: string[] = [];
  const lineOfJoinedChar: number[] = [];
  postEnd.forEach((line, idx) => { // postEnd: הערות סיום כבר הוחלפו ב-placeholder — כמו הצינור הישן
    if (idx > 0) { joinedPieces.push('\n'); lineOfJoinedChar.push(idx - 1); }
    for (const ch of line) { joinedPieces.push(ch); lineOfJoinedChar.push(idx); }
  });
  const joined = joinedPieces.join('');
  const lineAt = (joinedIdx: number): number => lineOfJoinedChar[joinedIdx] ?? -1;
  const removals: { start: number; end: number }[] = [];
  let pos = 0;
  while (pos < joined.length) {
    const openIdx = joined.indexOf('[', pos);
    if (openIdx === -1) break;
    let depth = 1;
    let closeIdx = -1;
    for (let i = openIdx + 1; i < joined.length; i = i + 1) {
      const ch = joined[i] as string;
      if (ch === '[') depth = depth + 1;
      else if (ch === ']') { depth = depth - 1; if (depth === 0) { closeIdx = i; break; } }
    }
    if (closeIdx === -1) break; // כמו בישן: ההמשך מילולי
    removals.push({ start: openIdx, end: closeIdx + 1 });
    pos = closeIdx + 1;
  }
  // בניית השורות הסופיות (placeholder במקום הטווח שהוצא) + טווחי postSide של כל שורה
  const { lines: finalLines, lineRanges } = buildFinalLines(joined, removals, lineAt);
  // sanity: הפלט של ההעתקה זהה לפלט של parseFootnotes הישן עצמו
  const vendoredFn = parseFootnotes(joined, ['[', ']']);
  const replicaFootnotes: { text: string }[] = [];
  for (const r of removals) replicaFootnotes.push({ text: joined.slice(r.start + 1, r.end - 1) });
  if (vendoredFn.footnotes.length !== replicaFootnotes.length) {
    throw new Error(`שגיאת העתקה: ${vendoredFn.footnotes.length} הערות בישן מול ${replicaFootnotes.length} בהעתקה`);
  }

  // ── מיפוי postSide → שורה גולמית ──
  const removedH7 = new Set<number>(); // אינדקסים ב-postEd
  for (let j = 0; j < postEd.length; j = j + 1) {
    const h = parseHeading((postEd[j] ?? '').trim());
    if (h !== null && h.level === 7) removedH7.add(j);
  }
  const rawOfPostSide: number[] = [];
  {
    let rIdx = metaEnd;
    for (let j = 0; j < postEd.length; j = j + 1) {
      if (!removedH7.has(j)) rawOfPostSide.push(rIdx);
      rIdx = rIdx + 1; // השורה הגולמית קיימת גם כשהוסרה מהזרימה
    }
  }

  // ── ניתוב לפי שורה גולמית ──
  interface Route { route: OldRoute['route']; text: string; textRaw?: string; level?: number; simanNumber?: number; styleId?: string; empty?: boolean }
  const routes: (Route | null)[] = lines.map(() => null);
  const groups: { from: number; to: number; route: Route }[] = [];
  for (let i = 0; i < metaEnd; i = i + 1) {
    const trimmed = (lines[i] ?? '').trim();
    routes[i] = trimmed.length > 0 ? { route: 'metadata', text: trimmed } : null;
  }
  // שורות H7 ← הערות צד
  {
    let edIdx = 0;
    let rIdx = metaEnd;
    for (const line of postEd) {
      if (removedH7.has(edIdx)) {
        const h = parseHeading(line.trim());
        routes[rIdx] = h !== null ? { route: 'sidenote', text: h.text, level: 7 } : null;
      }
      edIdx = edIdx + 1;
      rIdx = rIdx + 1;
    }
  }
  // שורות הערות סיום (באינדקסים של postSide)
  postSide.forEach((line, idx) => {
    if (line.trim().startsWith('הערת סיום -')) {
      const rawLine = rawOfPostSide[idx] as number;
      routes[rawLine] = { route: 'endnote', text: line.trim().slice('הערת סיום -'.length).trim() };
    }
  });
  // שורות סופיות: heading/custom/body — כל שורה סופית עוטפת טווח שורות גולמיות
  const { lines: customLines, matches } = applyCustomStyles(finalLines, []);
  const customByLine = new Map<number, { styleId: string; text: string }>();
  for (const m of matches) customByLine.set(m.line, { styleId: m.styleId, text: m.text });
  for (let j = 0; j < customLines.length; j = j + 1) {
    const ps = (lineRanges[j] as { from: number; to: number }) ?? { from: 0, to: 0 };
    const rawFrom = rawOfPostSide[ps.from] as number;
    const rawTo = rawOfPostSide[ps.to] as number;
    const line = (customLines[j] ?? '').trim();
    if (line.length === 0) {
      // שורה ריקה — מפריד פסקאות (אין ניתוב לשורה, אבל ההרכבה המבנית זקוק לו)
      groups.push({ from: rawFrom, to: rawTo, route: { route: 'body', text: '', textRaw: '', empty: true } });
      continue;
    }
    const custom = customByLine.get(j);
    let route: Route;
    if (custom !== undefined) {
      route = { route: 'custom', text: custom.text, textRaw: custom.text, styleId: custom.styleId };
    } else {
      const h = parseHeading(line);
      if (h !== null) {
        route = { route: 'heading', text: h.text, textRaw: h.text, level: h.level, simanNumber: h.simanNumber };
      } else {
        route = { route: 'body', text: line.replace(SENTINEL_STRIP, ''), textRaw: line };
      }
    }
    if (routes[rawFrom] === null || routes[rawFrom] === undefined) routes[rawFrom] = route; // אל דרוס ניתוב שלב מוקדם (endnote)
    groups.push({ from: rawFrom, to: rawTo, route });
    // שורות שנבלעו בשורה סופית אחת (הערה חוצת שורות) — הניתוב שלהן זהה
    for (let r = rawFrom + 1; r <= rawTo; r = r + 1) {
      if (routes[r] === null || routes[r] === undefined) routes[r] = { ...route, text: '' };
    }
  }
  return {
    routes,
    groups,
    footnotes: vendoredFn.footnotes.map((f) => ({ text: f.text })),
    endnotes: endnotes.map((e) => ({ text: e.text })),
    sidenotes: sidenotes.map((s) => ({ text: s.text })),
    metadata: metaValueByKey,
  };
}

/** בניית השורות אחרי החלפת ההערות ב-placeholder — עם טווח postSide לכל שורה. */
function buildFinalLines(
  joined: string,
  removals: { start: number; end: number }[],
  lineAt: (idx: number) => number,
): { lines: string[]; lineRanges: { from: number; to: number }[] } {
  const PLACEHOLDER = '\u0001FN\u0002';
  const out: string[] = [];
  const ranges: { from: number; to: number }[] = [];
  let piece = '';
  let from = -1;
  let to = -1;
  const pushChar = (ch: string, lineIdx: number): void => {
    if (ch === '\n') {
      out.push(piece);
      ranges.push({ from: from === -1 ? lineIdx : from, to: to === -1 ? lineIdx : to });
      piece = '';
      from = -1;
      to = -1;
      return;
    }
    if (from === -1) from = lineIdx;
    to = lineIdx;
    piece = piece + ch;
  };
  let pos = 0;
  let remIdx = 0;
  while (pos < joined.length) {
    const rem = removals[remIdx];
    if (rem !== undefined && pos === rem.start) {
      // ה-placeholder נכנס לשורה שבה נפתח הסוגר; השורות שנבלעו מתווספות לטווח
      if (from === -1) from = lineAt(pos);
      to = lineAt(rem.end - 1);
      piece = piece + PLACEHOLDER;
      pos = rem.end;
      remIdx = remIdx + 1;
      continue;
    }
    pushChar(joined[pos] as string, lineAt(pos));
    pos = pos + 1;
  }
  if (piece.length > 0 || from !== -1) {
    out.push(piece);
    ranges.push({ from: from === -1 ? 0 : from, to: to === -1 ? 0 : to });
  }
  return { lines: out, lineRanges: ranges };
}

// ── ניתוב החדש: נגזר מה-syntax spans, מהבלוקים ומהאטומים ──
export interface NewRoute {
  route: 'metadata' | 'sidenote' | 'endnote' | 'custom' | 'heading' | 'body';
  text: string;
  level?: number;
  styleId?: string;
}

type AnyBlock = {
  role: string;
  source: { startUtf16: number; endUtf16: number };
  inline: { kind: string; atoms?: { text: string; source: { startUtf16: number } }[] }[];
  children?: AnyBlock[];
};

const inlineText = (block: AnyBlock, raw?: string): string =>
  block.inline
    .map((it) =>
      it.kind === 'text'
        ? (it.atoms ?? []).map((a) => a.text).join('')
        : it.kind === 'explicit-break'
          ? // נרמול כמו הישן: גוף ההערה הישן נחתך מהטקסט המחובר המקוצץ — הפער = \n בלבד
            '\n'.repeat(
              raw !== undefined
                ? (raw.slice((it as unknown as { source: { startUtf16: number; endUtf16: number } }).source.startUtf16, (it as unknown as { source: { startUtf16: number; endUtf16: number } }).source.endUtf16).match(/\n/g) ?? []).length
                : 1,
            )
          : '',
    )
    .join('');

export function newRouting(res: ParseResult, raw: string): { routes: (NewRoute | null)[] } {
  const lines: { start: number; end: number }[] = [];
  let lineStart = 0;
  for (let i = 0; i <= raw.length; i = i + 1) {
    if (i === raw.length || raw.charCodeAt(i) === 0x0a) {
      lines.push({ start: lineStart, end: i });
      lineStart = i + 1;
    }
  }
  const lineOf = (offset: number): number => {
    let lo = 0;
    let hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lines[mid] as { start: number }).start <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const syntaxByLine = new Map<number, SyntaxSpan[]>();
  for (const s of res.syntax) {
    const li = lineOf(s.start);
    const list = syntaxByLine.get(li) ?? [];
    list.push(s);
    syntaxByLine.set(li, list);
  }
  // אטומי הגוף (בלוקים שאינם גופי הערות) לפי שורה + כיסוי בלוקי גוף
  const atomTextByLine = new Map<number, string[]>();
  const bodyLineSet = new Set<number>();
  const walk = (block: AnyBlock): void => {
    const isBodyBlock = block.role === 'body' || block.role === 'custom' || (block.role === 'heading' && block.headingLevel !== undefined && (block as unknown as { headingLevel?: number }).headingLevel !== 7);
    if (isBodyBlock) {
      for (let off = block.source.startUtf16; off < block.source.endUtf16; off = off + 1) bodyLineSet.add(lineOf(off));
      for (const item of block.inline) {
        if (item.kind !== 'text') continue;
        for (const atom of item.atoms ?? []) {
          if (atom.source.startUtf16 === atom.source.endUtf16) continue; // אטום החדרה (חיבור שורות) — לא תו של השורה
          const li = lineOf(atom.source.startUtf16);
          const list = atomTextByLine.get(li) ?? [];
          list.push(atom.text);
          atomTextByLine.set(li, list);
        }
      }
    }
    for (const c of block.children ?? []) walk(c);
  };
  for (const part of res.doc.parts as unknown as { simanim: { blocks: AnyBlock[] }[] }[]) {
    for (const siman of part.simanim) for (const b of siman.blocks) walk(b);
  }
  const routes: (NewRoute | null)[] = lines.map(() => null);
  const noteBlockText = (notes: unknown[], line: { start: number; end: number }): string => {
    const found = (notes as { block: AnyBlock }[]).find(
      (n) => n.block.source.startUtf16 >= line.start && n.block.source.endUtf16 <= line.end,
    );
    return found !== undefined ? inlineText(found.block) : '';
  };
  lines.forEach((line, li) => {
    const spans = syntaxByLine.get(li) ?? [];
    const metaSpan = spans.find((s) => s.recordId.startsWith('metadata-key:'));
    const sideSpan = spans.find((s) => s.recordId === 'sidenote-h7');
    const endSpan = spans.find((s) => s.recordId === 'endnote-prefix');
    const customSpan = spans.find((s) => s.recordId === 'custom-style-linePrefix');
    const headingSpan = spans.find((s) => s.recordId === 'heading-line');
    const atoms = (atomTextByLine.get(li) ?? []).join('');
    if (metaSpan !== undefined) {
      const meta = (res.doc.metadata as unknown as { key: string; value: string; source: { startUtf16: number; endUtf16: number } }[])
        .find((m) => m.source.startUtf16 >= line.start && m.source.endUtf16 <= line.end);
      routes[li] = meta !== undefined ? { route: 'metadata', text: `${meta.key} - ${meta.value}` } : null;
    } else if (sideSpan !== undefined) {
      routes[li] = { route: 'sidenote', text: noteBlockText(res.doc.notes.sidenotes, line) };
    } else if (endSpan !== undefined) {
      routes[li] = { route: 'endnote', text: noteBlockText(res.doc.notes.endnotes, line) };
    } else if (customSpan !== undefined) {
      routes[li] = { route: 'custom', text: atoms, styleId: String(customSpan.detail).replace('style:', '') };
    } else if (headingSpan !== undefined) {
      routes[li] = { route: 'heading', text: atoms, level: Number(String(headingSpan.detail).slice(1)) };
    } else if (atoms.length > 0 || bodyLineSet.has(li)) {
      routes[li] = { route: 'body', text: atoms };
    }
  });
  return { routes };
}

// ── הקורפוס ──
interface CorpusEntry { readonly id: string; readonly path: string; readonly raw: string }
function loadCorpus(): CorpusEntry[] {
  const registry = JSON.parse(readFileSync(join(fixturesRoot, 'registry.json'), 'utf8'));
  const items = Array.isArray(registry) ? registry : (registry.fixtures ?? []);
  return items
    .filter((it: { kind?: string; corpusFile?: { path?: string } }) => it.kind === 'document' && it.corpusFile?.path)
    .map((it: { id: string; corpusFile: { path: string } }) => ({
      id: it.id,
      path: it.corpusFile.path,
      raw: readFileSync(join(fixturesRoot, it.corpusFile.path), 'utf8'),
    }));
}

const corpus = loadCorpus();

const hasLaxDivergence = (raw: string): boolean => raw.split('\n').some((l) => isLaxOnly(l.trim()));

describe('differential מלא — הפרסר הישן המוחזק מול החדש', () => {
  it('הקורפוס נטען (26 מסמכים)', () => {
    expect(corpus.length).toBe(26);
  });

  for (const entry of corpus) {
    it(`${entry.id} (${entry.path}): ניתוב שורות זהה + הערות זהות + כיסוי מלא`, () => {
      const res = parseSourceText(entry.raw, {
        documentId: entry.id,
        sourceHash: createHash('sha256').update(entry.raw).digest('hex'),
      });
      expect(res.coverage.ok, `coverage gaps: ${JSON.stringify(res.coverage.gaps.slice(0, 3))}`).toBe(true);

      const oldR = oldRouting(entry.raw);
      const newR = newRouting(res, entry.raw);
      const lines = entry.raw.split('\n');
      let explainedSidenotes = 0;
      for (let i = 0; i < lines.length; i = i + 1) {
        const o = oldR.routes[i] ?? null;
        const n = newR.routes[i] ?? null;
        const trimmed = (lines[i] ?? '').trim();
        const lax = isLaxOnly(trimmed);
        if (lax && o !== null && o.route === 'body' && n !== null && (n.route === 'sidenote' || n.route === 'heading')) {
          explainedSidenotes = explainedSidenotes + (n.route === 'sidenote' ? 1 : 0);
          continue; // הפרש מוסבר: התבנית הגמישה של Orange (הבייסליין) — מתועד במרשם
        }
        if (o !== null && o.route === 'body' && o.text.length === 0 && n === null) {
          continue; // שורה שנבלעה בשורה סופית אחת (הערה חוצת שורות) — אין תוכן בשני הצדדים
        }
        if (o === null && n === null) continue;
        expect(o, `שורה ${i} (${JSON.stringify(trimmed.slice(0, 50))}): ניתוב ישן מול חדש`).toEqual(
          n === null ? null : expect.objectContaining({ route: n.route }),
        );
        if (o === null || n === null) continue;
        expect(o.route).toBe(n.route);
        if (o.route === 'heading') expect(o.level, `שורה ${i}: רמת כותרת`).toBe(n.level);
        const inOldGroup = oldR.groups.some((g) => g.from < i && i <= g.to);
        if (inOldGroup) continue; // שורה שנבלעה בשורה סופית אחת — הטקסט נבדק בראש הקבוצה
        if (o.text.length === 0 && n.text.length === 0) continue;
        // טקסט: בצד הישן — שורה סופית אחת שעוטפת קבוצת שורות גולמיות; בצד החדש — האטומים של אותה קבוצה
        const group = oldR.groups.find((g) => g.from === i);
        if (group !== undefined && group.to > group.from) {
          let combined = '';
          for (let r = group.from; r <= group.to; r = r + 1) combined = combined + (newR.routes[r]?.text ?? '');
          expect(o.text, `שורה ${i} (קבוצה ${group.from}-${group.to}): טקסט ${o.route}`).toBe(combined);
        } else {
          expect(o.text, `שורה ${i} (${JSON.stringify(trimmed.slice(0, 50))}): טקסט ${o.route}`).toBe(n.text);
        }
      }
      // הערות שוליים וסיום — טקסט וכמות בדיוק
      expect(res.doc.notes.footnotes.map((x) => inlineText(x.block as unknown as AnyBlock, entry.raw))).toEqual(oldR.footnotes.map((f) => f.text));
      expect(res.doc.notes.endnotes.map((x) => inlineText(x.block as unknown as AnyBlock, entry.raw))).toEqual(oldR.endnotes.map((e) => e.text));
      // הערות צד: החדש כולל את הישן במלואו + בדיוק הפרשי Orange המוסברים
      const newSnTexts = res.doc.notes.sidenotes.map((x) => inlineText(x.block as unknown as AnyBlock, entry.raw));
      for (const t of oldR.sidenotes.map((x) => x.text)) expect(newSnTexts).toContain(t);
      expect(newSnTexts.length - oldR.sidenotes.length).toBe(explainedSidenotes);
      // metadata: כל ערך ישן נשמר
      for (const [field, value] of Object.entries(oldR.metadata)) {
        expect(res.doc.metadata.some((m) => m.value === value), `metadata ${field}=${value}`).toBe(true);
      }
    });
  }
});

describe('differential מבני — רצף צמתים (הרכבת AST ישן מול בלוקים חדשים)', () => {
  const cleanEntries = corpus.filter((e) => !hasLaxDivergence(e.raw));
  it(`קבצים ללא הפרשי Orange: ${cleanEntries.length} מתוך ${corpus.length} (בשאר — הפרש מוסבר אחד, מתועד במרשם)`, () => {
    expect(cleanEntries.length).toBeGreaterThan(0);
  });
  for (const entry of cleanEntries) {
    it(`${entry.id}: רצף צמתים שקול לחלוטין`, () => {
      const res = parseSourceText(entry.raw, { documentId: entry.id });
      const oldNodes = oldAstNodes(entry.raw);
      const newNodes = newAstNodes(res);
      expect(newNodes.length).toBe(oldNodes.length);
      for (let k = 0; k < oldNodes.length; k = k + 1) {
        const o = oldNodes[k] as { type: string; level?: number; text: string; styleId?: string };
        const n = newNodes[k] as { type: string; level?: number; text: string; styleId?: string };
        expect({ type: n.type, level: n.level, styleId: n.styleId, text: n.text }).toEqual({
          type: o.type,
          level: o.level,
          styleId: o.styleId,
          text: o.text,
        });
      }
    });
  }
});

/** הרכבת צמתי AST ישנים מהשורות הסופיות — העתקה של ast-builder הישן (join(' '), flush לפי ריק/כותרת; custom לא עוצר פסקה). */
function oldAstNodes(raw: string): { type: string; level?: number; text: string; styleId?: string }[] {
  const replay = oldRouting(raw);
  const nodes: { type: string; level?: number; text: string; styleId?: string }[] = [];
  let acc: string[] = [];
  const flush = (): void => {
    if (acc.length === 0) return;
    const text = acc.join(' ').trim().replace(SENTINEL_STRIP, REF_TOKEN);
    if (text.length > 0) nodes.push({ type: 'body', text });
    acc = [];
  };
  for (const g of replay.groups) {
    if (g.route.route === 'heading') {
      flush();
      nodes.push({ type: 'heading', level: g.route.level, text: g.route.textRaw });
      continue;
    }
    if (g.route.route === 'custom') {
      nodes.push({ type: 'custom', styleId: g.route.styleId, text: g.route.textRaw });
      continue; // הסנטינל לא עצר את הפסקה בישן
    }
    if (g.route.empty === true) {
      flush();
      continue;
    }
    acc.push(g.route.textRaw ?? g.route.text);
  }
  flush();
  return nodes;
}

/** רצף הצמתים של המסמך החדש — מיושר ומנורמל (הפניות → ⟦REF⟧). */
function newAstNodes(res: ParseResult): { type: string; level?: number; text: string; styleId?: string }[] {
  const nodes: { type: string; level?: number; text: string; styleId?: string }[] = [];
  const walk = (b: AnyBlock): void => {
    if (b.role === 'heading') {
      const level = (b as unknown as { headingLevel?: number }).headingLevel;
      if (level === 7) return; // סמן הערת צד — תוספת חדשה מתועדת, אין מקבילה בישן
      nodes.push({ type: 'heading', level, text: inlineTextNormalized(b) });
      for (const c of b.children ?? []) walk(c);
      return;
    }
    if (b.role === 'custom') {
      nodes.push({ type: 'custom', styleId: (b as unknown as { styleId?: string }).styleId, text: inlineTextNormalized(b) });
      return;
    }
    nodes.push({ type: 'body', text: inlineTextNormalized(b) });
  };
  for (const part of res.doc.parts as unknown as { simanim: { blocks: AnyBlock[] }[] }[]) {
    for (const siman of part.simanim) for (const b of siman.blocks) walk(b);
  }
  return nodes;
}

const inlineTextNormalized = (block: AnyBlock): string =>
  block.inline
    .map((it) =>
      it.kind === 'text'
        ? (it.atoms ?? []).map((a) => a.text).join('')
        : it.kind === 'note-reference'
          ? REF_TOKEN
          : it.kind === 'explicit-break'
            ? '\n'
            : '',
    )
    .join('');
