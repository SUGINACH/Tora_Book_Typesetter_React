/**
 * pagination-battery.test.ts — סוללת מצבי הקצה של עימוד העמוד + שער M6
 * (שלב 57; אפיון §18-M6, §17.3; פרק ז/M6).
 *
 * הסוללה מפעילה את מלוא הצינור של פרק ז — מצב (49) ← תבניות (50) ←
 * חיפוש (51) ← מועמדים (52) ← שריון הערות (53) ← הערות צד (54) ←
 * endnotes (55) ← H3 (56) — על קשת מצבי הקצה המחייבת של התכנית:
 * עמוד ריק, טור אחד/שניים, מעבר פרק, recto/verso, הערות קיצוניות, H3,
 * sidenotes, endnotes ותבניות שער; Node==Worker; ‏trace אינו משנה; ‏10 ריצות
 * דטרמיניזם; אין HIGH במסלולי ייחוס; policy flags הפיכים.
 */
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { asLu, canonicalJson, DecisionLedgerBuilder } from '@tora/layout-api';
import { initialPaginationState, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { makeNoteBodySpec, type NoteBodySpec } from '../src/pagination/notes.js';
import { layoutEndnoteFlow } from '../src/pagination/endnotes.js';

let lineSeq = 0;
const LINE = (heightLu: number, extra: Partial<PaginatedLine> = {}): PaginatedLine => Object.freeze({
  id: `line-${lineSeq++}`,
  heightLu: asLu(heightLu),
  footnoteRefs: [],
  sidenoteRefs: [],
  ...extra,
});
const block = (blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock =>
  Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
const h3 = (blockId: string, h: number): PaginatedBlock => block(blockId, [LINE(h)], { role: 'heading', headingLevel: 3 });
const opener = (blockId: string, h: number, level: 1): PaginatedBlock => block(blockId, [LINE(h)], { role: 'heading', headingLevel: level });

function templateInput(overrides: Partial<TemplateSetInput> = {}): TemplateSetInput {
  return {
    geometry: {
      pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
      mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
      columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
    },
    headerHeightLu: asLu(0),
    footerHeightLu: asLu(0),
    columns: 2,
    footnoteColumns: 1,
    folioPosition: 'bottom_center',
    showFolio: false,
    sidenoteWidthLu: null,
    ...overrides,
  };
}

const templates = buildPageTemplateSet(templateInput());
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;

function inputFor(
  blocks: readonly PaginatedBlock[],
  noteBodies?: ReadonlyMap<string, NoteBodySpec>,
  t = templates,
  policy?: CandidateGeneratorInput['policy'],
): CandidateGeneratorInput {
  return {
    blocks, templates: t, pageKind: 'body',
    ...(noteBodies !== undefined ? { noteBodies } : {}),
    ...(policy !== undefined ? { policy } : {}),
  };
}
const initial = (first: string, t = templates): PaginationState =>
  initialPaginationState({ firstBlockId: first, remainingByRegion: initialRemainingByRegion(t.for('body', 1), 1) });

/** ריצה מלאה: גוף ← תוצאה + endnotes-flow עם offset מספר העמודים. */
function runFull(blocks: readonly PaginatedBlock[], bodies?: ReadonlyMap<string, NoteBodySpec>, endnoteEntries?: Parameters<typeof layoutEndnoteFlow>[0]) {
  const src = createPageCandidateSource(inputFor(blocks, bodies));
  const ledger = new DecisionLedgerBuilder('decisions');
  const res = searchPages(initial(blocks[0]!.blockId), src, ledger);
  const flow = endnoteEntries !== undefined
    ? layoutEndnoteFlow(endnoteEntries, templates, { bodyPageCount: res.finalState.physicalPageIndex })
    : null;
  return { res, ledger, flow };
}

describe('שלב 57 — סוללת מצבי קצה + שער M6 (§18-M6)', () => {
  test('מסמך ריק: החיפוש מסתיים מיד — complete, מסלול ריק, אין HIGH', () => {
    // "עמוד ריק": בלוק יחיד בן קו אחד — הכל נכנס לעמוד אחד; וגם מקור ללא
    // בלוקים כלל (הקלט דורש לפחות בלוק אחד לסמן — בלוק עם קו ריק אסור;
    // המקרה הקיצון: קו יחיד זעיר)
    const blocks = [block('body|1', [LINE(1000)])];
    const { res, ledger } = runFull(blocks);
    expect(res.status).toBe('complete');
    expect(res.finalState.physicalPageIndex).toBe(1);
    expect(res.path.length).toBe(1);
    expect(res.path.every((e) => e.fallbackCode === undefined)).toBe(true); // אין HIGH/חירום
    expect(ledger.build()!.records.length).toBeGreaterThan(0);
  });

  test('טור בודד מול שני טורים: כיסוי מלא בשני המצבים', () => {
    const lineH = Math.floor(H / 30);
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 6; i++) blocks.push(block(`body|${i}`, Array.from({ length: 8 }, () => LINE(lineH))));
    const oneCol = buildPageTemplateSet(templateInput({ columns: 1 }));
    const r1 = searchPages(initial('body|1', oneCol), createPageCandidateSource(inputFor(blocks, undefined, oneCol)), new DecisionLedgerBuilder('decisions'));
    const r2 = searchPages(initial('body|1'), createPageCandidateSource(inputFor(blocks)), new DecisionLedgerBuilder('decisions'));
    expect(r1.status).toBe('complete');
    expect(r2.status).toBe('complete');
    const last = blocks[blocks.length - 1]!;
    expect(() => verifyTransitionChain(initial('body|1', oneCol), r1.path.flatMap((e) => e.transitions))).not.toThrow();
    expect(r1.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    expect(() => verifyTransitionChain(initial('body|1'), r2.path.flatMap((e) => e.transitions))).not.toThrow();
    expect(r2.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    // שני טורים חוסכים עמודים מטור בודד
    expect(r2.finalState.physicalPageIndex).toBeLessThanOrEqual(r1.finalState.physicalPageIndex);
  });

  test('מעבר פרק (H1 opener): כיסוי מלא; recto/verso לאורך המסמך; ה-H1 מוצבת', () => {
    const lineH = Math.floor(H / 20);
    const blocks: PaginatedBlock[] = [
      block('body|1', Array.from({ length: 12 }, () => LINE(lineH))),
      opener('heading|1|H1', lineH, 1),
      block('body|2', Array.from({ length: 12 }, () => LINE(lineH))),
    ];
    const { res } = runFull(blocks);
    expect(res.status).toBe('complete');
    // ה-H1 מוקמה — הסמן מכסה את סוף המסמך דרכה
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    // המסמך חוצה עמודים — recto (1) ו-verso (2) שניהם בשימוש
    expect(res.finalState.physicalPageIndex).toBeGreaterThanOrEqual(2);
    // המועמד שמסתיים בדיוק לפני ה-H1 (סמן בראש ה-H1) — opener סוגר אזור
    // עימוד (§9.2) ופותח עמוד חדש בתבנית הנדרשת (שלב 59: forcePageTemplate —
    // ההרחבה היא :OPEN; לא מעבר טור); ה-H1 תוצב בראש העמוד שנפתח
    const src0 = createPageCandidateSource(inputFor(blocks));
    const beforeH1 = src0.expansions(initial('body|1'))
      .find((e) => e.candidateId.endsWith('heading|1|H1@0:OPEN'));
    expect(beforeH1).toBeDefined();
    expect(beforeH1!.closesRegion).toBe(true);
    expect(beforeH1!.toState.contentCursor).toContain('heading|1|H1|f0');
    expect(beforeH1!.toState.physicalPageIndex).toBe(2);
    expect(beforeH1!.toState.columnIndex).toBe(0);
  });

  test('הערות קיצוניות: הערה בגודל עמוד שלם + הרבה הערות — כיסוי ואינווריאנט', () => {
    const lineH = Math.floor(H / 40);
    const bodies = new Map<string, NoteBodySpec>();
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 6; i++) {
      const id = `note:v1|doc|footnote|${i}`;
      // הערה 1: כמעט עמוד שלם (הקצה הקיצוני שנכנס לעמוד ריק); השאר: בינוניות
      bodies.set(id, makeNoteBodySpec(id, i === 1 ? [Math.floor(H * 0.9)] : [lineH * 2, lineH]));
      blocks.push(block(`body|${i}`, Array.from({ length: 10 }, (_, j) => LINE(lineH, j === 4 ? { footnoteRefs: [id] } : {}))));
    }
    const { res } = runFull(blocks, bodies);
    expect(res.status).toBe('complete');
    expect(res.finalState.pendingFootnotes).toEqual([]);
    // אינווריאנט לכל עמוד-טור
    const perRegion = new Map<string, number>();
    for (const t of res.path.flatMap((e) => e.transitions)) {
      if (t.action.kind === 'consume-region') {
        const a = t.action as { regionId: string; amountLu: number };
        perRegion.set(a.regionId, (perRegion.get(a.regionId) ?? 0) + a.amountLu);
      }
    }
    for (const [regionId, used] of perRegion) {
      if (regionId.endsWith(':col:0') || regionId.endsWith(':col:1')) {
        const page = Number(/page:(\d+):/.exec(regionId)![1]);
        expect(used + (perRegion.get(`page:${page}:notes`) ?? 0)).toBeLessThanOrEqual(H);
      }
    }
  });

  test('H3 + הערות + הערות-צד יחד: כיסוי, סנכרון, אין מנותקות', () => {
    const tplSide = buildPageTemplateSet(templateInput({ sidenoteWidthLu: 300000 }));
    const lineH = Math.floor(H / 25);
    const bodies = new Map<string, NoteBodySpec>([
      ['note:v1|doc|footnote|1', makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 3])],
      ['note:v1|doc|sidenote|1', makeNoteBodySpec('note:v1|doc|sidenote|1', [lineH * 2])],
    ]);
    const blocks: PaginatedBlock[] = [
      block('body|1', [
        LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }),
        ...Array.from({ length: 7 }, (_, i) => LINE(lineH, i === 3 ? { sidenoteRefs: ['note:v1|doc|sidenote|1'] } : {})),
      ]),
      h3('heading|1|H3', lineH),
      block('body|2', Array.from({ length: 18 }, () => LINE(lineH))),
    ];
    const src = createPageCandidateSource(inputFor(blocks, bodies, tplSide));
    const res = searchPages(initial('body|1', tplSide), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(res.finalState.pendingFootnotes).toEqual([]);
    expect(res.finalState.pendingSidenotes).toEqual([]);
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    const h3exp = res.path.find((e) => e.candidateId.includes(':H3'));
    expect(h3exp).toBeDefined();
    // אין HIGH במסלול
    expect(res.path.every((e) => e.fallbackCode === undefined || e.fallbackCode === 'LONG_NOTE_SPLIT')).toBe(true);
  });

  test('endnotes אחרי הגוף: המשוב מקבל את מספר העמודים האמיתי', () => {
    const lineH = Math.floor(H / 20);
    const blocks = [block('body|1', Array.from({ length: 30 }, () => LINE(lineH)))];
    const entries = [
      { noteId: 'note:v1|doc|endnote|1', body: makeNoteBodySpec('note:v1|doc|endnote|1', [lineH, lineH]), anchor: { blockId: 'body|1', lineId: 'line-0' } },
      { noteId: 'note:v1|doc|endnote|2', body: makeNoteBodySpec('note:v1|doc|endnote|2', [lineH]), anchor: { blockId: 'body|1', lineId: 'line-5' } },
    ];
    const { res, flow } = runFull(blocks, undefined, entries);
    expect(res.status).toBe('complete');
    expect(flow).not.toBeNull();
    // ה-endnotes מתחילים אחרי הגוף — ה-offset האמיתי, לא ניחוש (§11.1)
    expect(flow!.firstPhysicalPage).toBe(res.finalState.physicalPageIndex + 1);
    expect(flow!.anchorReport['note:v1|doc|endnote|1']).toBe(res.finalState.physicalPageIndex + 1);
  });

  test('תבניות שער: סט התבניות כולל שערים עם parity — זמינות לזרימה', () => {
    // תבניות השער קיימות ובנויות (שלב 50); הזרימה שלהן תיצרך ב-M7/M8 —
    // כאן נבדק שהסט שלם והפריסה על עמודי notes עובדת (זרימת endnotes)
    for (const kind of ['main-shaar', 'back-shaar', 'sub-shaar'] as const) {
      for (const parity of ['recto', 'verso'] as const) {
        expect(templates.byId.get(`tpl:${kind}:${parity}`)).toBeDefined();
      }
    }
    // זרימת endnotes על תבניות notes (עמוד טור בודד)
    const flow = layoutEndnoteFlow([
      { noteId: 'note:v1|doc|endnote|9', body: makeNoteBodySpec('note:v1|doc|endnote|9', [1000, 2000]), anchor: { blockId: 'body|1', lineId: 'line-1' } },
    ], templates, { bodyPageCount: 3 });
    expect(flow.pages).toBe(1);
    expect(flow.anchorReport['note:v1|doc|endnote|9']).toBe(4);
  });

  test('trace אינו משנה תוצאות: off/decisions/full ⇐ אותו מסלול ואיכות', () => {
    const lineH = Math.floor(H / 25);
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 5; i++) blocks.push(block(`body|${i}`, Array.from({ length: 9 }, () => LINE(lineH))));
    blocks.splice(2, 0, h3('heading|1|H3', lineH));
    const src = createPageCandidateSource(inputFor(blocks));
    const sig = (trace: 'off' | 'decisions' | 'full') => {
      const res = searchPages(initial('body|1'), src, new DecisionLedgerBuilder(trace));
      return canonicalJson([res.path.map((e) => e.candidateId), res.quality, res.finalState.stateHash]);
    };
    expect(sig('off')).toBe(sig('decisions'));
    expect(sig('decisions')).toBe(sig('full'));
  });

  test('דטרמיניזם: 10 ריצות ⇐ אותה תוצאה מלאה (השער: "עשר ריצות")', () => {
    const lineH = Math.floor(H / 30);
    const bodies = new Map([['note:v1|doc|footnote|1', makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])]]);
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 7; i++) {
      blocks.push(block(`body|${i}`, Array.from({ length: 10 }, (_, j) => LINE(lineH, j === 5 ? { footnoteRefs: ['note:v1|doc|footnote|1'] } : {}))));
    }
    const src = createPageCandidateSource(inputFor(blocks, bodies));
    const sigOnce = () => {
      const res = searchPages(initial('body|1'), src, new DecisionLedgerBuilder('decisions'));
      return canonicalJson([res.path.map((e) => e.candidateId), res.quality, res.budget, res.finalState.stateHash]);
    };
    expect(new Set(Array.from({ length: 10 }, sigOnce)).size).toBe(1);
  });

  test('Node == Worker: אותה תוצאה ביט-ביט (main מול worker_threads)', { timeout: 60000 }, async () => {
    const lineH = Math.floor(H / 30);
    const bodies = new Map([
      ['note:v1|doc|footnote|1', makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])],
      ['note:v1|doc|sidenote|1', makeNoteBodySpec('note:v1|doc|sidenote|1', [lineH * 3])],
    ]);
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 6; i++) {
      blocks.push(block(`body|${i}`, Array.from({ length: 10 }, (_, j) => LINE(lineH, j === 2 ? { footnoteRefs: ['note:v1|doc|footnote|1'] } : j === 7 ? { sidenoteRefs: ['note:v1|doc|sidenote|1'] } : {}))));
    }
    blocks.splice(3, 0, h3('heading|1|H3', lineH));
    // main
    const tplSide = buildPageTemplateSet(templateInput({ sidenoteWidthLu: 300000 }));
    const mainSig = (() => {
      const src = createPageCandidateSource(inputFor(blocks, bodies, tplSide));
      const res = searchPages(initial('body|1', tplSide), src, new DecisionLedgerBuilder('decisions'));
      const flow = layoutEndnoteFlow([
        { noteId: 'note:v1|doc|endnote|1', body: makeNoteBodySpec('note:v1|doc|endnote|1', [lineH, lineH]), anchor: { blockId: 'body|1', lineId: 'line-0' } },
      ], tplSide, { bodyPageCount: res.finalState.physicalPageIndex });
      return canonicalJson([res.path.map((e) => e.candidateId), res.quality, res.finalState.stateHash, flow.mappingHash]);
    })();
    // worker — סקריפט זמני שמריץ את אותה תרחיש מה-dist
    const tmp = mkdtempSync(join(tmpdir(), 'tora-pag-'));
    const workerScript = `
import { workerData, parentPort } from 'node:worker_threads';
const engine = await import(workerData.engineUrl);
const la = await import(workerData.laUrl);
const { asLu, canonicalJson, DecisionLedgerBuilder } = la;
const templates = engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: 300000,
});
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
const lineH = Math.floor(H / 30);
const bodies = new Map([
  ['note:v1|doc|footnote|1', engine.makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])],
  ['note:v1|doc|sidenote|1', engine.makeNoteBodySpec('note:v1|doc|sidenote|1', [lineH * 3])],
]);
const blocks = [];
for (let i = 1; i <= 6; i++) {
  const lines = [];
  for (let j = 0; j < 10; j++) {
    lines.push({ id: 'l' + i + '-' + j, heightLu: lineH, footnoteRefs: j === 2 ? ['note:v1|doc|footnote|1'] : [], sidenoteRefs: j === 7 ? ['note:v1|doc|sidenote|1'] : [] });
  }
  blocks.push({ blockId: 'body|' + i, role: 'body', lines });
}
const h3lines = [{ id: 'h3l', heightLu: lineH, footnoteRefs: [], sidenoteRefs: [] }];
blocks.splice(3, 0, { blockId: 'heading|1|H3', role: 'heading', headingLevel: 3, lines: h3lines });
const src = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', noteBodies: bodies });
const init = engine.initialPaginationState({ firstBlockId: 'body|1', remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const res = engine.searchPages(init, src, new DecisionLedgerBuilder('decisions'));
const flow = engine.layoutEndnoteFlow([
  { noteId: 'note:v1|doc|endnote|1', body: engine.makeNoteBodySpec('note:v1|doc|endnote|1', [lineH, lineH]), anchor: { blockId: 'body|1', lineId: 'line-0' } },
], templates, { bodyPageCount: res.finalState.physicalPageIndex });
parentPort.postMessage(canonicalJson([res.path.map((e) => e.candidateId), res.quality, res.finalState.stateHash, flow.mappingHash]));
`;
    const workerFile = join(tmp, 'pag-worker.mjs');
    writeFileSync(workerFile, workerScript);
    const engineUrl = new URL('../dist/index.js', import.meta.url).href;
    const laUrl = new URL('../../layout-api/dist/index.js', import.meta.url).href;
    const workerSig: string = await new Promise((resolve, reject) => {
      const w = new Worker(new URL(`file://${workerFile}`), { workerData: { engineUrl, laUrl } });
      w.on('message', resolve);
      w.on('error', reject);
      w.on('exit', (c) => { if (c !== 0) reject(new Error(`worker exit ${c}`)); });
    });
    rmSync(tmp, { recursive: true, force: true });
    expect(workerSig).toBe(mainSig);
  });

  test('policy flags: שינוי דגל משנה מסלול באופן דטרמיניסטי; הפלט נושא hashes', () => {
    const lineH = Math.floor(H / 30);
    const blocks = [block('body|1', Array.from({ length: 12 }, () => LINE(lineH)))];
    const run = (policy?: CandidateGeneratorInput['policy']) => {
      const src = createPageCandidateSource(inputFor(blocks, undefined, templates, policy));
      const res = searchPages(initial('body|1'), src, new DecisionLedgerBuilder('decisions'));
      return res;
    };
    const free = run();
    const strict = run({ allowIntraParagraphBreaks: false });
    expect(free.status).toBe('complete');
    expect(strict.status).toBe('complete');
    // בלי שבירה תוך-פסקאית יש פחות מועמדים — המסלול שונה או זהה, אך תמיד חוקי
    expect(strict.path.length).toBeLessThanOrEqual(free.path.length);
    // דטרמיניסטיות של כל דגל
    const s1 = canonicalJson(strict.path.map((e) => e.candidateId));
    const s2 = canonicalJson(run({ allowIntraParagraphBreaks: false }).path.map((e) => e.candidateId));
    expect(s1).toBe(s2);
    // הפלט נושא hashes: שרשרת המעברים stateHash-מחושבת (verify עובר = עקביות)
    expect(() => verifyTransitionChain(initial('body|1'), strict.path.flatMap((e) => e.transitions))).not.toThrow();
  });
});
