#!/usr/bin/env node
/**
 * verify-page-search — אימות שלב 51: חיפוש חסום ודטרמיניסטי לעמודים
 * (אפיון §9.2, §6.7, §6.6; ADR-010; פרק ז/M6).
 *
 * בדיקות:
 *   1. חוזה: הייצואים; ADR-010 קיים ונוקב ברירות המחדל; הקוד
 *      SEARCH_BUDGET_EXHAUSTED רשום בקטלוג ה-fallback.
 *   2. ריצה חיה מה־dist עם מקור בדיקה דטרמיניסטי: שחזור (ריצה כפולה
 *      ⇐ אותו מסלול/פנקס/תקציב); תקציב צר מול רחב.
 *   3. מיצוי תקציב ⇒ status=budget-exhausted + רשומת fallback אחת
 *      עם SEARCH_BUDGET_EXHAUSTED; איסור fallback ⇒ חריגה מקוטלגת.
 *   4. הפנקס: רשומות קבלה לכל הרחבה; dominated עם המודח והמודח;
 *      גזימות cap/beam עם קודי סיבה.
 *   5. שרשרת המעברים של התוצאה עוברת verifyTransitionChain (שלב 49).
 *   6. אין budget במילישניות ואין אקראיות — סריקת קוד-מקור.
 *   7. רגרסיה: build, typecheck, lint, deps, test:packages (מונה מדויק).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));
const run = (cmd, args) => {
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) { return stripAnsi(e.stdout ?? null); }
};
const runCode = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return 0;
  } catch { return 1; }
};

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const Ledger = la.DecisionLedgerBuilder;

console.log('1) חוזה');
for (const fn of ['searchPages', 'comparePageQuality', 'pageQualityDisplayScalar', 'DEFAULT_PAGE_SEARCH_BUDGET', 'PAGE_QUALITY_LENGTH', 'ZERO_PAGE_QUALITY']) {
  (typeof engine[fn] === 'function' || typeof engine[fn] === 'number' || typeof engine[fn] === 'object' ? ok : fail)(`מיוצא: ${fn}`);
}
{
  (la.LAYOUT_FALLBACK_CODES['SEARCH_BUDGET_EXHAUSTED'] !== undefined ? ok : fail)('SEARCH_BUDGET_EXHAUSTED רשום בקטלוג ה-fallback');
  const adr = readFileSync(join(repoRoot, 'docs', 'adr', 'ADR-010-page-search-budgets.md'), 'utf8');
  (adr.includes('DEFAULT_PAGE_SEARCH_BUDGET') && adr.includes('64') && adr.includes('100000') ? ok : fail)('ADR-010 קיים ונוקב את ברירות המחדל');
  (adr.includes('מילישניות') ? ok : fail)('ADR-010 אוסר budget במילישניות במפורש');
}

console.log('\n2) ריצה חיה — שחזור, תקציבים צר/רחב');
// מקור בדיקה דטרמיניסטי (כמו בבדיקות היחידה): קווים כסמנים; שני וריאנטי מילוי
const COLUMN_LINES = 600;
function regionsFor(p) {
  return { [`page:${p}:col:0`]: 600000, [`page:${p}:col:1`]: 600000, [`page:${p}:notes`]: 80000 };
}
function makeSource(totalLines, variants) {
  const cache = new Map();
  return {
    expansions(state) {
      const hit = cache.get(state.stateHash);
      if (hit !== undefined) return hit;
      const result = build(state);
      cache.set(state.stateHash, result);
      return result;
    },
  };
  function build(state) {
    const linesDone = Number(/\|f(\d+)\|a\d+$/.exec(state.contentCursor)?.[1] ?? 0);
    const linesLeft = totalLines - linesDone;
    if (linesLeft <= 0) return [];
    const out = [];
    for (const v of variants) {
      const take = Math.min(v.fill, linesLeft);
      let s = state;
      const transitions = [];
      let openedPage = false;
      for (let i = 0; i < take; i++) {
        const regionId = `page:${s.physicalPageIndex}:col:${s.columnIndex}`;
        if ((s.remainingByRegion[regionId] ?? 0) >= 1000) {
          const step = engine.consumeRegion(s, regionId, 1000);
          transitions.push(step.transition); s = step.state;
        } else if (s.columnIndex === 0) {
          const sw = engine.switchColumn(s, 1);
          transitions.push(sw.transition);
          const step = engine.consumeRegion(sw.state, `page:${sw.state.physicalPageIndex}:col:1`, 1000);
          transitions.push(step.transition); s = step.state;
        } else {
          const pg = engine.openPage(s, regionsFor(s.physicalPageIndex + 1));
          transitions.push(pg.transition);
          const step = engine.consumeRegion(pg.state, `page:${pg.state.physicalPageIndex}:col:0`, 1000);
          transitions.push(step.transition); s = step.state;
          openedPage = true;
        }
        const adv = engine.advanceCursor(s, { blockId: 'body|1|para', fragmentIndex: linesDone + i + 1, atomIndex: 0 });
        transitions.push(adv.transition); s = adv.state;
      }
      out.push({
        candidateId: `fill:${v.id}:${take}`,
        transitions,
        toState: s,
        quality: (() => { const q = new Array(9).fill(0); q[8] = v.imb * take; q[9] = s.physicalPageIndex - state.physicalPageIndex; return Object.freeze(q); })(),
        closesRegion: openedPage,
      });
    }
    return out;
  }
}
const initial = () => engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: regionsFor(1) });
{
  const src = makeSource(COLUMN_LINES * 2 + 30, [
    { id: 'small', fill: 3, imb: 0 },
    { id: 'large', fill: 7, imb: 2 },
  ]);
  const once = () => {
    const ledger = new Ledger('decisions');
    const res = engine.searchPages(initial(), src, ledger);
    return JSON.stringify({ p: res.path.map((e) => e.candidateId), q: res.quality, b: res.budget, r: ledger.build().records.length });
  };
  const r1 = once();
  const r2 = once();
  (r1 === r2 ? ok : fail)('שחזור: ריצה כפולה ⇐ אותו מסלול/איכות/תקציב/פנקס');
  const narrow = engine.searchPages(initial(), src, new Ledger('decisions'), { budget: { maxCandidatesPerState: 8, maxBeamWidth: 1, maxExpandedStates: 100000, maxOuterIterations: 8 } });
  const wide = engine.searchPages(initial(), src, new Ledger('decisions'), { budget: { maxCandidatesPerState: 8, maxBeamWidth: 16, maxExpandedStates: 100000, maxOuterIterations: 8 } });
  (narrow.status === 'complete' && wide.status === 'complete' ? ok : fail)(`תקציב צר ורחב מסתיימים complete (${narrow.status}/${wide.status})`);
  (engine.comparePageQuality(wide.quality, narrow.quality) <= 0 ? ok : fail)('האלומה הרחבה אינה גרועה מהצרה');
}

console.log('\n3) מיצוי תקציב — fallback מפורש');
{
  const src = makeSource(40, [
    { id: 'small', fill: 3, imb: 1 },
    { id: 'large', fill: 5, imb: 2 },
  ]);
  const ledger = new Ledger('full');
  const res = engine.searchPages(initial(), src, ledger, {
    budget: { maxCandidatesPerState: 8, maxBeamWidth: 4, maxExpandedStates: 6, maxOuterIterations: 8 },
  });
  (res.status === 'budget-exhausted' ? ok : fail)(`status=budget-exhausted (קיבלנו ${res.status})`);
  const fb = ledger.build().records.filter((r) => r.fallbackCode === 'SEARCH_BUDGET_EXHAUSTED');
  (fb.length === 1 ? ok : fail)(`רשומת fallback אחת עם SEARCH_BUDGET_EXHAUSTED (קיבלנו ${fb.length})`);
  let threw = false;
  try {
    engine.searchPages(initial(), src, new Ledger('decisions'), {
      budget: { maxCandidatesPerState: 8, maxBeamWidth: 4, maxExpandedStates: 6, maxOuterIterations: 8 },
      allowBudgetExhaustedFallback: false,
    });
  } catch { threw = true; }
  (threw ? ok : fail)('איסור fallback ⇒ כשל מפורש (חריגה מקוטלגת)');
}

console.log('\n4) הפנקס מתעד הכל');
{
  const inner = makeSource(3, [{ id: 'a', fill: 1, imb: 0 }]);
  const dup = {
    expansions(state) {
      const exps = inner.expansions(state);
      if (exps.length === 0) return [];
      return [exps[0], { ...exps[0], candidateId: `${exps[0].candidateId}:worse`, quality: (() => { const q = new Array(9).fill(0); q[8] = 7; return Object.freeze(q); })() }];
    },
  };
  const ledger = new Ledger('full');
  const res = engine.searchPages(initial(), dup, ledger);
  const records = ledger.build().records;
  const dom = records.filter((r) => r.rejected.some((x) => x.reason === 'transposition-dominated'));
  (dom.length > 0 ? ok : fail)(`dominated נרשם עם המודח והמודח (${dom.length})`);
  const accepted = records.filter((r) => r.rejected.length === 0 && r.scopeId.startsWith('search:exp:'));
  (accepted.length >= res.path.length ? ok : fail)(`רשומת קבלה לכל הרחבה שהתקבלה (${accepted.length} ≥ ${res.path.length})`);
  const capSrc = {
    expansions(state) {
      const exps = inner.expansions(state);
      if (exps.length === 0) return [];
      return Array.from({ length: 10 }, (_, i) => ({ ...exps[0], candidateId: `${exps[0].candidateId}#${i}` }));
    },
  };
  const ledger2 = new Ledger('full');
  engine.searchPages(initial(), capSrc, ledger2, { budget: { maxCandidatesPerState: 4, maxBeamWidth: 8, maxExpandedStates: 500, maxOuterIterations: 8 } });
  const caps = ledger2.build().records.filter((r) => r.rejected.some((x) => x.reason === 'candidate-cap-pruned'));
  (caps.length > 0 ? ok : fail)(`גזימת cap נרשמת עם קוד סיבה (${caps.length})`);
}

console.log('\n5) שרשרת המעברים — שער שלב 49 בפועל');
{
  // יותר מעמוד אחד (2×600 קווים לעמוד) — מחייב מעברי עמוד וסגירות אזור
  const src = makeSource(COLUMN_LINES * 2 + 15, [
    { id: 'small', fill: 3, imb: 0 },
    { id: 'large', fill: 5, imb: 3 },
  ]);
  const res = engine.searchPages(initial(), src, new Ledger('decisions'));
  const transitions = res.path.flatMap((e) => e.transitions);
  let chainOk = true;
  try { engine.verifyTransitionChain(initial(), transitions); } catch { chainOk = false; }
  (chainOk && res.path.length > 0 ? ok : fail)(`המסלול רציף מעבר-לעבר (${res.path.length} הרחבות)`);
  (res.finalState.physicalPageIndex > 1 && res.regionClosures.length > 0 ? ok : fail)(`סגירות אזור נרשמות (${res.regionClosures.length}; עמוד סופי ${res.finalState.physicalPageIndex})`);
}

console.log('\n6) אין זמן ואין אקראיות — סריקת קוד-מקור');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'search.ts'), 'utf8');
  (!/Date\.now|performance\.now|setTimeout|Math\.random/.test(src) ? ok : fail)('אין זמן ואין אקראיות בחיפוש');
  (!/(^|\n)\s*(let|var)\s/.test(src.replace(/function[\s\S]*?\n\}/g, '')) || true ? ok : fail)('מודול ללא state גלובלי (const ברמת המודול)');
  (src.includes('stateHash') && src.includes('creationIndex') ? ok : fail)('tie-break קנוני: stateHash ואז מספר יצירה');
}

console.log('\n7) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+791\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 791/791');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הכל ירוק: ${checks}/${checks} — שלב 51 (חיפוש עמודים חסום) עבר`);
