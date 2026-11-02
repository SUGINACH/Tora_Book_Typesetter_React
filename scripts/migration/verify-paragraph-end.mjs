#!/usr/bin/env node
/**
 * verify-paragraph-end — אימות שלב 45: כללי שורה אחרונה, runt ו־widow/orphan
 * ברמת הפסקה (אפיון §7, §8.2; ADR-004 רכיבים 4–5; הגדרות מנספח ג).
 *
 * בדיקות:
 *   1. חוזה: readParagraphEndRules, DEFAULT_PARAGRAPH_END_RULES, paragraphEndDebts.
 *   2. עקביות מול registry.json — ברירות המחדל וה־enum תואמים למרשם הנעול.
 *   3. runt משנה את בחירת המועמדים בלבד (ספק גמיש): off ⇒ [4,1], on ⇒ [3,2];
 *      אטומים זהים — אין post-pass.
 *   4. מסלול מאולץ — החוב נרשם בווקטור (runt=1) עם הכלל; 0 בלעדיו.
 *   5. פסקה חד-שורתית חד-מילולית — אף חוב (כמו בישן).
 *   6. יתום: קו פתיחה חד-מילולי אחרי כפייה ⇒ widowOrphanDebt.
 *   7. קריאת הגדרות: ברירות מחדל, מעבר ערכים, דחייה מקוטלגת של ערך זר.
 *   8. body-last-line-align נישא בתוצאת הסולם.
 *   9. דטרמיניזם מלא.
 *  10. אין מימוש של ה־post-pass של הישן (applyAvoidRuntWord) בקוד החדש.
 *  11. רגרסיה: build, lint, deps, test:packages.
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
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch { return 1; }
};

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const tp = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'test-provider.js'));

console.log('1) חוזה מיוצא');
for (const name of ['readParagraphEndRules', 'DEFAULT_PARAGRAPH_END_RULES', 'paragraphEndDebts']) {
  (typeof engine[name] !== 'undefined' ? ok : fail)(`מיוצא: ${name}`);
}

console.log('\n2) עקביות מול registry.json (נספח ג)');
const registry = JSON.parse(readFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8'));
const regEntry = (key) => registry.settings.find((s) => s.legacyKey === key);
const eRunt = regEntry('avoid-runt-word');
const eOrph = regEntry('avoid-orphans');
const eAlign = regEntry('body-last-line-align');
(eRunt?.type === 'boolean' && eRunt?.defaultValue === true ? ok : fail)('avoid-runt-word: boolean, ברירת מחדל true');
(eOrph?.type === 'boolean' && eOrph?.defaultValue === true ? ok : fail)('avoid-orphans: boolean, ברירת מחדל true');
(eAlign?.type === 'enum' && JSON.stringify(eAlign?.enum) === JSON.stringify(['center', 'right']) && eAlign?.defaultValue === 'center' ? ok : fail)('body-last-line-align: enum center|right, ברירת מחדל center');
const defaultsMatch = engine.DEFAULT_PARAGRAPH_END_RULES.avoidRuntWord === true
  && engine.DEFAULT_PARAGRAPH_END_RULES.avoidOrphans === true
  && engine.DEFAULT_PARAGRAPH_END_RULES.lastLineAlign === 'center';
(defaultsMatch ? ok : fail)('DEFAULT_PARAGRAPH_END_RULES תואם למרשם');

console.log('\n3) runt משנה את בחירת המועמדים בלבד');
// ספק גמיש לאימות בלבד (§6.4): אות 556‰, רווח 2224‰ (4×) — מאפשר שני מסלולים חוקיים
function createStretchySpaceProvider(spacePm) {
  const roundDivLocal = (n, d) => { const q = Math.floor(n / d); const r = n - q * d; return r * 2 >= d ? q + 1 : q; };
  const shape = (request) => {
    const glyphs = [];
    for (let i = 0; i < request.atoms.length; i++) {
      for (const ch of request.atoms[i].text) {
        const cp = ch.codePointAt(0);
        const pm = cp === 0x20 ? spacePm : 556;
        glyphs.push({ glyphId: cp, clusterAtomIndex: i, advanceLu: roundDivLocal(pm * request.fontSizeLu, 1000), xOffsetLu: 0, yOffsetLu: 0 });
      }
    }
    let width = 0;
    for (const g of glyphs) width += g.advanceLu;
    return { requestHash: 'verify-stretchy', glyphs, widthLu: width, ascentLu: 0, descentLu: 0, lineGapLu: 0, missingGlyphAtomIds: [] };
  };
  return {
    providerId: 'verify-stretchy', providerVersion: 'v1',
    wasmSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    environmentHash: 'verify-stretchy-env-v1',
    shape,
    lineOpportunities: (atoms) => { const out = []; for (let i = 1; i < atoms.length; i++) if (atoms[i].breakBefore !== 'forbidden') out.push(i); return out; },
    shapeBatch: (reqs) => reqs.map((r) => shape(r)),
  };
}
const provider = tp.createTestMeasurementProvider();
const FONT = { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' };
const BUDGET = { maxCandidatesPerState: 64, maxBeamWidth: 8 };
const RULES_OFF = { avoidRuntWord: false, avoidOrphans: false, lastLineAlign: 'center' };
function indexFor(text, shapeProvider = provider) {
  const parsed = cm.parseSourceText(`כותרת 1 - ח\n${text}\n`, { documentId: 'v-pe', sourceName: 'v-pe.txt' });
  const blocks = la.allBlocks(parsed.doc).filter((b) => b.role !== 'note-body');
  const bt = engine.tokenize(blocks[1].id, blocks[1].inline, new Map());
  const shaped = engine.shapeParagraph(bt.atoms, shapeProvider, FONT, 16000);
  return { index: new engine.LineCandidateIndex(bt, shaped, () => 0), bt };
}
const wcOf = (r) => r.lines.map((l) => l.candidate.metrics.wordCount);
{
  const { index, bt } = indexFor('א ב ג ד ה', createStretchySpaceProvider(2224));
  const W = 142336; // עודכן בשלב 48 לקבוע ADR-004-ר1
  const off = engine.breakParagraphDP(index, engine.createQualityCostModel(W, RULES_OFF), engine.createLevel0Policy(), W, BUDGET);
  const on = engine.breakParagraphDP(index, engine.createQualityCostModel(W, engine.DEFAULT_PARAGRAPH_END_RULES), engine.createLevel0Policy(), W, BUDGET);
  (JSON.stringify(wcOf(off)) === JSON.stringify([4, 1]) ? ok : fail)(`בלי הכלל המיטבי הוא [4,1] (התקבל [${wcOf(off)}])`);
  (JSON.stringify(wcOf(on)) === JSON.stringify([3, 2]) ? ok : fail)(`עם הכלל הבחירה נוטה ל-[3,2] (התקבל [${wcOf(on)}])`);
  (on.best.runtDebt === 0 && off.best.runtDebt === 0 ? ok : fail)('שני המסלולים הנבחרים נקיים מחוב ברכיב הכלל');
  const idsOf = (r) => {
    const wordIds = new Set(bt.atoms.filter((a) => a.text.trim().length > 0).map((a) => a.id));
    const placed = [];
    for (const l of r.lines) for (let t = l.startTok; t < l.endTok; t++) {
      const tok = bt.tokens[t];
      if (tok.kind === 'atom' && wordIds.has(bt.atoms[tok.pIdx].id)) placed.push(bt.atoms[tok.pIdx].id);
    }
    return placed;
  };
  (JSON.stringify(idsOf(on)) === JSON.stringify(idsOf(off)) ? ok : fail)('אטומים זהים בדיוק עם ובלי הכלל — אין post-pass שמזיז מילים');
}

console.log('\n4) מסלול מאולץ — החוב נרשם ומתועד');
{
  const { index } = indexFor('א ב ג ד ה ו ז');
  const W = 34000;
  const on = engine.breakParagraphDP(index, engine.createQualityCostModel(W, engine.DEFAULT_PARAGRAPH_END_RULES), engine.createLevel0Policy(), W, BUDGET);
  const off = engine.breakParagraphDP(index, engine.createQualityCostModel(W, RULES_OFF), engine.createLevel0Policy(), W, BUDGET);
  (on.best.runtDebt === 1 && JSON.stringify(wcOf(on)) === JSON.stringify([3, 3, 1]) ? ok : fail)('הספק הרגיל: [3,3,1] מאולץ עם runt=1 בווקטור');
  (off.best.runtDebt === 0 ? ok : fail)('בלי הכלל — החוב אינו נספר כלל (אין הכרח נסתר)');
}

console.log('\n5) פסקה חד-שורתית חד-מילולית — אף חוב');
{
  const { index } = indexFor('אבגדה');
  const r = engine.breakParagraphDP(index, engine.createQualityCostModel(60000), engine.createLevel0Policy(), 60000, BUDGET);
  (r.lines.length === 1 && r.best.runtDebt === 0 && r.best.widowOrphanDebt === 0 ? ok : fail)('שורה אחת, מילה אחת — אין runt ואין יתום (כמו בישן)');
}

console.log('\n6) יתום — קו פתיחה חד-מילולי אחרי כפייה');
{
  const parsed = cm.parseSourceText('כותרת 1 - ח\nהתחלה [א\nב ג ד ה ו ז] סוף.\n', { documentId: 'v-orph', sourceName: 'v-orph.txt' });
  const fn = parsed.doc.notes.footnotes[0];
  const src = fn.block.source ?? { documentId: 'v-orph', stream: 'footnote', startUtf16: 0, endUtf16: 1 };
  const bt = engine.tokenizeNotesBody(fn.noteId, 'א', src, fn.block.inline);
  const shaped = engine.shapeParagraph(bt.atoms, provider, FONT, 16000);
  const index = new engine.LineCandidateIndex(bt, shaped, () => 0);
  const W = 60000;
  const on = engine.breakParagraphDP(index, engine.createQualityCostModel(W), engine.createLevel0Policy(), W, BUDGET);
  const off = engine.breakParagraphDP(index, engine.createQualityCostModel(W, RULES_OFF), engine.createLevel0Policy(), W, BUDGET);
  (on.lines[0].justification === 'natural' && on.best.widowOrphanDebt === 1 ? ok : fail)('קו פתיחה חד-מילולי (natural) ⇒ widowOrphanDebt=1');
  (off.best.widowOrphanDebt === 0 ? ok : fail)('הכלל כבוי — 0');
}

console.log('\n7) קריאת הגדרות מנספח ג');
{
  const empty = engine.readParagraphEndRules({});
  (JSON.stringify(empty) === JSON.stringify(engine.DEFAULT_PARAGRAPH_END_RULES) ? ok : fail)('חסר ⇒ ברירות המחדל הנעולות');
  const passed = engine.readParagraphEndRules({ 'avoid-runt-word': false, 'avoid-orphans': false, 'body-last-line-align': 'right' });
  (passed.avoidRuntWord === false && passed.avoidOrphans === false && passed.lastLineAlign === 'right' ? ok : fail)('ערכים חוקיים עוברים כמו שהם');
  let threw = null;
  try { engine.readParagraphEndRules({ 'body-last-line-align': 'left' }); } catch (e) { threw = e; }
  (threw !== null && String(threw).includes('SETTING_INVALID') ? ok : fail)('ערך enum זר ⇒ SETTING_INVALID מקוטלג (אין החלפה שקטה)');
}

console.log('\n8) body-last-line-align נישא בסולם');
{
  const { index, bt } = indexFor('אבג דהו זחט');
  const W = 57376;
  const r = engine.breakParagraphWithLadder('v-align', bt, index, W, BUDGET, { rules: { avoidRuntWord: true, avoidOrphans: true, lastLineAlign: 'right' } });
  (r.lastLineAlign === 'right' && r.dp.lines[r.dp.lines.length - 1].justification === 'last' ? ok : fail)('הערך זורם ל-LadderResult ושורת הסיום אינה ממתחת');
  const c = engine.breakParagraphWithLadder('v-align', bt, index, W, BUDGET);
  (c.lastLineAlign === 'center' && c.level === 0 ? ok : fail)('ברירת המחדל center, רמה 0');
}

console.log('\n9) דטרמיניזם');
{
  const a = indexFor('א ב ג ד ה', createStretchySpaceProvider(2224));
  const W = 142336; // עודכן בשלב 48 לקבוע ADR-004-ר1
  const r1 = engine.breakParagraphDP(a.index, engine.createQualityCostModel(W), engine.createLevel0Policy(), W, BUDGET);
  const r2 = engine.breakParagraphDP(a.index, engine.createQualityCostModel(W), engine.createLevel0Policy(), W, BUDGET);
  (JSON.stringify(r1) === JSON.stringify(r2) ? ok : fail)('אותם קלטים ⇒ אותה תוצאה בדיוק');
}

console.log('\n10) אין post-pass של הישן בקוד החדש');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'linebreak', 'paragraph-end.ts'), 'utf8');
  const engineSrc = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'linebreak', 'quality.ts'), 'utf8');
  (!src.includes('applyAvoidRuntWord(') && !engineSrc.includes('applyAvoidRuntWord(') ? ok : fail)('שם ה-post-pass של הישן אינו ממומש בחדש (עדות בתיעוד בלבד)');
  (src.includes('משפיעים על בחירת מועמדים') ? ok : fail)('המודול מתעד את שער המעבר (השפעה על בחירה בלבד)');
}

console.log('\n11) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+847\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 847/847');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

console.log(`\nסיכום: ${checks - failures}/${checks}`);
process.exit(failures > 0 ? 1 : 0);
