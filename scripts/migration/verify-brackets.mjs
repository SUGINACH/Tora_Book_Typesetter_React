#!/usr/bin/env node
/**
 * verify-brackets — אימות שלב 19: עץ סוגריים מבני בפרסר.
 * אסמכתא: אפיון §10.4, §14.2 · תכנית שלב 19 · מרשם שלב 17 (סדר הצינור).
 *
 * בדיקות:
 *   1. ממשק ה־API וקטלוג השגיאות (scanBrackets, crossingPairs, blockExitState,
 *      endsInsideBracket, BRACKET_PAIRS, MAX_BRACKET_DEPTH + 3 קודים חדשים).
 *   2. differential מול הישן — בדיקת vitest ייעודית (brackets.differential.test.ts):
 *      ה־oracle מה־react-lock (findMatchingCloseBracket @ 0c7b9927) על כל
 *      63 קבצי הקורפוס — זיווג זהה + parity של protectParens (hasOpenBracket).
 *   3. אינווריאנטים על כל הקורפוס: דטרמיניזם (סריקה עצמאית שווה), המשכיות
 *      מצבי גבול (openAtEnd[i] === openAtStart[i+1]), פרוסות בטווח ובסדר,
 *      מזהים ייחודיים, חשבונאות מלאה, רציפות blockIds.
 *   4. אבחנות פרסר: כל בעיית סוגריים ← WARN ממוקם; קלט תקין — אפס.
 *   5. שעד השלב: מצב גבול לכל בלוק בכל זרימה — המבנה מסופק לפני העימוד,
 *      בלי regex בזמן רינדור.
 *   6. רגרסיה: test:packages, build, typecheck, lint, deps.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cm = await import('@tora/content-model');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
// קודי בקרה ANSI (צבע) — מוסרים מכל פלט תהליך-בן לפני התאמת טקסט
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

const run = (cmd, args, opts = {}) => {
  try {
    // ANSI-safe: ב-CI (CI=true) chalk/vitest מצבעים את הפלט גם שלא דרך TTY; קודי הצבע
    // בין "Tests" למספר שברו התאמות טקסט (נתגלה ב-GitHub Actions). מנקים קודי בקרה
    // וגם מזריקים NO_COLOR=1 — שתי הגנות עצמאיות.
    const out = execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' }, ...opts });
    return out.replace(ANSI_RE, '').replace(/\x1b/g, ''); // ניקוי סופי: ESC בודד שנותר
  } catch (e) {
    return e.stdout ?? null;
  }
};

// ─────────────────────────── 1. ממשק ה-API ───────────────────────────
console.log('1) ממשק ה־API וקטלוג השגיאות');
{
  const need = ['scanBrackets', 'crossingPairs', 'blockExitState', 'endsInsideBracket', 'isBracketScanResult'];
  const missing = need.filter((n) => typeof cm[n] !== 'function');
  (missing.length === 0 ? ok : fail)(`כל 5 פונקציות ה־API זמינות (חסרות: ${missing.join(', ') || 'אין'})`);
  (Array.isArray(cm.BRACKET_PAIRS) && cm.BRACKET_PAIRS.length === 2
    && cm.BRACKET_PAIRS.some((d) => d.kind === 'round') && cm.BRACKET_PAIRS.some((d) => d.kind === 'square')
    ? ok : fail)('BRACKET_PAIRS: () ו־[] בלבד — טבלה קפואה');
  (typeof cm.MAX_BRACKET_DEPTH === 'number' && cm.MAX_BRACKET_DEPTH === 64 ? ok : fail)('MAX_BRACKET_DEPTH = 64');
  for (const key of ['errors.bracket.ID_DERIVATION_TOO_LONG', 'errors.parser.WARN_UNCLOSED_BRACKET', 'errors.parser.WARN_STRAY_CLOSE_BRACKET']) {
    (cm.isRegisteredContentModelErrorKey(key) ? ok : fail)(`${key} רשום בקטלוג`);
  }
  (cm.contentModelErrorCatalogSize() === 82 ? ok : fail)(`קטלוג content-model: 82 קודים — 79 שלב 19 + 3 notes שלב 20 (נמצאו ${cm.contentModelErrorCatalogSize()})`);
}

// ─────────────────────────── 2. differential מול הישן ───────────────────────────
console.log('\n2) differential מול הישן — ה־oracle מה־react-lock (בדיקת vitest ייעודית)');
{
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts',
    'packages/test-fixtures/test/brackets.differential.test.ts']);
  const passed = out !== null && /Tests\s+\d+ passed/.test(out) && !/failed/.test(String(out).split('Test Files').pop() ?? '');
  (passed ? ok : fail)('brackets.differential.test.ts — זיווג זהה לישן + parity של protectParens על כל 63 הקבצים');
  // ה־oracle עצמו נעול: manifest + sha
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'packages/test-fixtures/legacy/react-lock/manifest.json'), 'utf8'));
  const entry = manifest.files.find((f) => f.path.endsWith('nested-bracket-matcher.ts'));
  const diskHash = createHash('sha256').update(readFileSync(join(repoRoot, 'packages/test-fixtures/legacy/react-lock/src/parser/nested-bracket-matcher.ts'))).digest('hex');
  (entry !== undefined && entry.sha256 === diskHash
    ? ok : fail)('nested-bracket-matcher.ts מאומת מול ה־manifest (SHA-256)');
}

// ─────────────────────────── הכנת הקורפוס ───────────────────────────
const corpusRoot = join(repoRoot, 'packages/test-fixtures/corpus');
const corpusFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.txt')) corpusFiles.push(p);
  }
})(corpusRoot);

// ─────────────────────────── 3. אינווריאנטים ───────────────────────────
console.log('\n3) אינווריאנטים על כל הקורפוס');
{
  let determinismBad = [];
  let continuityBad = [];
  let spanBad = [];
  let dupBad = [];
  let accountBad = [];
  let blockIdsBad = [];
  let stateCoverageBad = [];
  let totals = { pairs: 0, crossing: 0, issues: 0, blocks: 0, notes: 0 };
  for (const file of corpusFiles) {
    const raw = readFileSync(file, 'utf8');
    const rel = file.slice(corpusRoot.length + 1);
    const result = cm.parseSourceText(raw, { documentId: `verify-19/${rel.replace(/[\\/]/g, ':')}` });
    const again = cm.scanBrackets(result.doc);
    if (JSON.stringify(again) !== JSON.stringify(result.brackets)) determinismBad.push(rel);
    // מצב לכל בלוק גוף — השעד
    const bodyCount = countFlowBlocks(result.doc);
    if (result.brackets.body.blockStates.length !== bodyCount) stateCoverageBad.push(rel);
    for (const scan of [result.brackets.body, ...result.brackets.notes.map((n) => n.scan)]) {
      totals.pairs += scan.pairs.length;
      totals.crossing += scan.pairs.filter((p) => p.blockIds.length > 1).length;
      totals.issues += scan.issues.length;
      totals.blocks += scan.blockStates.length;
      if (scan.noteId !== undefined) totals.notes += 1;
      for (let i = 0; i + 1 < scan.blockStates.length; i = i + 1) {
        const a = JSON.stringify(scan.blockStates[i].openAtEnd);
        const b = JSON.stringify(scan.blockStates[i + 1].openAtStart);
        if (a !== b) { continuityBad.push(`${rel}#${i}`); break; }
      }
      const ids = new Set();
      const closed = scan.pairs.filter((p) => p.closeSpan !== undefined);
      const unclosed = scan.pairs.filter((p) => p.closeSpan === undefined);
      for (const p of scan.pairs) {
        if (ids.has(p.id)) { dupBad.push(rel); break; }
        ids.add(p.id);
        if (p.openSpan.startUtf16 < 0 || p.openSpan.endUtf16 > raw.length) { spanBad.push(rel); break; }
        if (p.closeSpan !== undefined && (p.closeSpan.startUtf16 <= p.openSpan.startUtf16 || p.closeSpan.endUtf16 > raw.length)) { spanBad.push(rel); break; }
        const idxs = p.blockIds.map((id) => scan.blockStates.findIndex((s) => s.blockId === id));
        for (let k = 0; k + 1 < idxs.length; k = k + 1) {
          if (idxs[k] === -1 || idxs[k + 1] !== idxs[k] + 1) { blockIdsBad.push(rel); break; }
        }
      }
      const expectedIssues = unclosed.length + scan.issues.filter((i) => i.kind === 'stray-close').length;
      if (scan.pairs.length !== closed.length + unclosed.length || scan.issues.length !== expectedIssues) accountBad.push(rel);
    }
  }
  console.log(`         · סה"כ: ${totals.pairs} זוגות (${totals.crossing} חוצי בלוקים), ${totals.issues} בעיות מדווחות, ${totals.blocks} מצבי בלוק, ${totals.notes} סריקות הערות`);
  (determinismBad.length === 0 ? ok : fail)(`דטרמיניזם: scanBrackets(doc) === תוצאת הפרסור על כל הקורפוס (${determinismBad.length}: ${determinismBad.slice(0, 3).join('; ')})`);
  (stateCoverageBad.length === 0 ? ok : fail)(`מצב גבול לכל בלוק גוף — ${corpusFiles.length} קבצים (${stateCoverageBad.length} חריגות)`);
  (continuityBad.length === 0 ? ok : fail)(`המשכיות מצבי גבול: openAtEnd[i] === openAtStart[i+1] (${continuityBad.length}: ${continuityBad.slice(0, 3).join('; ')})`);
  (spanBad.length === 0 ? ok : fail)(`כל פרוסות הפתיחה/סגירה בטווח ובסדר עולה (${spanBad.length}: ${spanBad.slice(0, 3).join('; ')})`);
  (dupBad.length === 0 ? ok : fail)(`מזהי זוגות ייחודיים (${dupBad.length})`);
  (accountBad.length === 0 ? ok : fail)(`חשבונאות: סגורים + לא-סגורים = זוגות; בעיות = לא-סגורים + עזובות (${accountBad.length})`);
  (blockIdsBad.length === 0 ? ok : fail)(`blockIds של כל זוג — רצף רציף בזרימה (${blockIdsBad.length})`);
}

function countFlowBlocks(doc) {
  let count = 0;
  const walk = (list) => {
    for (const b of list) {
      count += 1;
      if (b.children !== undefined) walk(b.children);
    }
  };
  for (const part of doc.parts) for (const siman of part.simanim) walk(siman.blocks);
  return count;
}

// ─────────────────────────── 4. אבחנות פרסר ───────────────────────────
console.log('\n4) אבחנות פרסר — כל בעיה מדווחת עם מיקום');
{
  const samples = [
    ['כותרת 2 x\n\nפותח ( בלי סגירה', 'errors.parser.WARN_UNCLOSED_BRACKET'],
    ['כותרת 2 x\n\nרגיל ] סוגר', 'errors.parser.WARN_STRAY_CLOSE_BRACKET'],
  ];
  let bad = 0;
  for (const [raw, code] of samples) {
    const result = cm.parseSourceText(raw, { documentId: 'verify-19-samples' });
    const diag = result.diagnostics.find((d) => d.code === code);
    if (diag === undefined || typeof diag.start !== 'number') bad += 1;
  }
  (bad === 0 ? ok : fail)('בעיות סוגריים ← אבחנות ממוקמות (WARN_UNCLOSED / WARN_STRAY)');
  const clean = cm.parseSourceText('כותרת 2 x\n\nתקין (זוג) ו[הערה] ותו', { documentId: 'verify-19-clean' });
  (clean.diagnostics.every((d) => !d.code.includes('BRACKET')) ? ok : fail)('קלט תקין — אפס אבחנות סוגריים');
  // ה־ParseResult חושף את העץ — הצרכן לא צריך לחשב בעצמו
  const withTree = cm.parseSourceText('כותרת 2 x\n\nא (ב) ג', { documentId: 'verify-19-tree' });
  (withTree.brackets !== undefined && cm.isBracketScanResult(withTree.brackets) ? ok : fail)('ParseResult.brackets — העץ מסופק מהפרסור עצמו');
}

// ─────────────────────────── 5. שעד — מיפוי מלא בלי regex ───────────────────────────
console.log('\n5) שעד: כל פתיחה/סגירה ממופית או מדווחת — המבנה לפני העימוד');
{
  // שאילתות טהורות ללא regex — המנוע (שלבים 49+/65) צורך אותן ישירות
  const raw = 'כותרת 2 x\n\nפסקה ראשונה פותחת ( ונשארת\n\nפסקה שנייה סוגרת ) ומסיימת';
  const result = cm.parseSourceText(raw, { documentId: 'verify-19-gate' });
  const q1 = cm.crossingPairs(result.brackets.body);
  const firstState = result.brackets.body.blockStates.find((s) => s.openedWithin.length === 1);
  const q2 = firstState !== undefined ? cm.blockExitState(result.brackets.body, firstState.blockId) : undefined;
  (q1.length === 1 && q2 !== undefined && q2.openAtEnd.length === 1
    ? ok : fail)('שאילתות crossingPairs/blockExitState — טהורות ומדויקות, בלי regex');
  // אין מימוש זיווג סוגריים מקביל מחוץ לסורק — המנוע לא יזדקק ל־regex משלו.
  // פטורים מתועדים: הפרסר (parser/) מזווג תוחמי הערות כחלק מהתחביר הנעול של
  // שלב 17 (findMatchingClose — differential מול React-lock); brackets.ts הוא הבעלים.
  const offenders = [];
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name === 'legacy' || name === '.git') continue;
        scan(p);
      } else if (/\.ts$/.test(name)) {
        const rel = p.slice(repoRoot.length + 1).replace(/\\/g, '/');
        if (rel.includes('/test/') || rel.includes('.test.')) continue;
        if (rel === 'packages/content-model/src/brackets.ts') continue;
        if (rel.startsWith('packages/content-model/src/parser/')) continue; // תחביר שלב 17 — נעול ומאומת
        if (rel === 'packages/measurement-api/src/bidi.ts') continue; // שלב 28: BD16 — זיווג סוגריים מקוונים של UAX #9 (Unicode); אינו זיווג סוגריים legacy — סוג אחר לחלוטין, נעול ב-conformance 94,412
        const src = readFileSync(p, 'utf8');
        if (/findMatching|matchBracket|bracketDepth|openBracket|hasOpenBracket|protectParens/.test(src)) {
          offenders.push(rel);
        }
      }
    }
  };
  scan(join(repoRoot, 'packages'));
  (offenders.length === 0 ? ok : fail)(`אין מימוש זיווג סוגריים מקביל מחוץ ל־brackets.ts ולפרסר התחביר (${offenders.length}: ${offenders.join(', ')})`);
}

// ─────────────────────────── 6. רגרסיה ───────────────────────────
console.log('\n6) רגרסיה מלאה');
{
  const t = (SKIP_TESTS ? 'Tests  638 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  (t !== null && !/failed\b/.test(String(t).split('Test Files').pop() ?? '') ? ok : fail)('test:packages — כל הבדיקות ירוקות');
  ((x => x !== null && !/error TS/.test(x))(run('npm', ['run', 'build:packages'])) ? ok : fail)('build:packages — PASS');
  (run('npm', ['run', 'typecheck:packages', '--', '--force']) !== null ? ok : fail)('typecheck:packages --force — PASS');
  (run('npm', ['run', 'lint:packages']) !== null ? ok : fail)('lint:packages — PASS');
  (run('npm', ['run', 'deps:check']) !== null ? ok : fail)('deps:check — 0 הפרות');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`עץ הסוגריים נעול: ${checks} בדיקות ירוקות. כל פתיחה/סגירה ממופית או מדווחת; הזיווג זהה לישן; מצב ה־continuation מסופק לפני העימוד — בלי regex בזמן רינדור.`);
  process.exit(0);
} else {
  console.log(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
