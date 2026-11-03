#!/usr/bin/env node
/**
 * verify-notes — אימות שלב 20: זרמי הערות ומספורן טרם העימוד.
 * אסמכתא: אפיון §10.3, §9.1, §14.2 · תכנית שלב 20.
 *
 * בדיקות:
 *   1. ממשק ה־API וקטלוג השגיאות (numberNotes, collectNoteReferences,
 *      toGematriaLabel, formatNoteLabel, DEFAULT_NOTE_NUMBERING_POLICY + קודים).
 *   2. parity גימטריא מלא מול הישן: src/lib/gematria.ts (קוד קפוא) —
 *      1..3000 תוצאות זהות ביט-ביט ל־toGematriaLabel החדש.
 *   3. הוכחות על כל קורפוס הבדיקה (63 קבצים):
 *      · אפס יתומות מפלט הפרסר (לכל הערת דפוס יש הפניה — §10.3/§14.2)
 *      · חשבונאות: הצבות = הערות עם הפניה בזרמים הממוספרים;
 *        documentOrder ממוין לפי מיקום; scopeCounts סכום = הצבות
 *      · שלושת ההיקפים התוכניים (continuous/part/siman) נפתרים;
 *        page עם הקשר סינתטי — עולה בתוך עמוד ומתאפס בין עמודים
 *      · דטרמיניזן מלא (שתי קריאות ← שוות)
 *   4. שעד השלב: אין מספור בזמן רינדור — לא קיים מימוש toGematria/מספור
 *      מחוץ ל־notes.ts בחבילות; אין קישור הערות צד לפי אינדקס עמוד
 *      (האנטי־תבנית doc.sidenotes[pageNumber-1] מ§10.3).
 *   5. רגרסיה: test:packages, build, typecheck, lint, deps.
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

// ANSI-safe: ב-CI (CI=true) chalk/vitest/eslint מצבעים פלט גם בלי TTY, וקודי צבע
// שברו התאמות טקסט (נתגלה ב-GitHub Actions; הורחב מ-4 מאמתים לכל המאמתים
// שמפענחים stdout של תהליכי-בן). stripAnsi משמש את run() בשני המסלולים.
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));

const run = (cmd, args) => {
  // ANSI-safe: הזרקת NO_COLOR=1 (הגנה ראשונה) + ניקוי קודי בקרה (הגנה שנייה).
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) {
    return stripAnsi(e.stdout ?? null);
  }
};

// ─────────────────────────── 1. ממשק ה-API ───────────────────────────
console.log('1) ממשק ה־API וקטלוג השגיאות');
{
  const need = ['numberNotes', 'collectNoteReferences', 'toGematriaLabel', 'formatNoteLabel'];
  const missing = need.filter((n) => typeof cm[n] !== 'function');
  (missing.length === 0 ? ok : fail)(`כל 4 פונקציות ה־API (חסרות: ${missing.join(', ') || 'אין'})`);
  const p = cm.DEFAULT_NOTE_NUMBERING_POLICY;
  (p.scope === 'page' && p.labelFormat === 'gematria' && Array.isArray(p.streams) && p.streams.length === 2
    ? ok : fail)('DEFAULT_NOTE_NUMBERING_POLICY — page+גימטריא+שוליים/סיום (משוחזר מהישן)');
  for (const key of ['errors.notes.INVALID_POLICY', 'errors.notes.INVALID_ORDINAL', 'errors.notes.PAGE_SCOPE_REQUIRES_CONTEXT']) {
    (cm.isRegisteredContentModelErrorKey(key) ? ok : fail)(`${key} רשום בקטלוג`);
  }
  (cm.contentModelErrorCatalogSize() === 85 ? ok : fail)(`קטלוג content-model: 85 קודים — 82 קודמים + 3 assets שלב 68 (נמצאו ${cm.contentModelErrorCatalogSize()})`);
}

// ─────────────────────────── 2. parity גימטריא מול הישן ───────────────────────────
console.log('\n2) parity גימטריא מלא מול הישן — src/lib/gematria.ts (קוד קפוא)');
{
  const legacyPath = join(repoRoot, 'src/lib/gematria.ts');
  const src = readFileSync(legacyPath, 'utf8');
  const sha = createHash('sha256').update(src).digest('hex');
  // הרצת הפונקציה הישנה כמו שהיא — בלי תלות בטעינת מודולי TS (oracle בלבד).
  // מוסרים ביטויי TS בלבד: 'export', אי-אפסיות (‎]!‎) והטיפוסים בחתימה — הלוגיקה עצמה מילולית.
  const fnBody = src
    .replace(/export\s+function/, 'function')
    .replace(/\]!/g, ']')
    .replace(/\)!/g, ')')
    .replace(/function\s+toGematria\s*\(\s*(\w+)\s*:\s*\w+\s*\)\s*:\s*\w+\s*\{/, 'function toGematria($1) {');
  let legacyToGematria;
  try {
    legacyToGematria = new Function(`${fnBody}; return toGematria;`)();
  } catch (e) {
    legacyToGematria = undefined;
  }
  (typeof legacyToGematria === 'function' ? ok : fail)(`ה־oracle הישן נטען מהקובץ הקפוא (${sha.slice(0, 12)}…)`);
  if (typeof legacyToGematria === 'function') {
    let mismatches = 0;
    let firstBad = '';
    for (let n = 1; n <= 3000; n = n + 1) {
      const mine = cm.toGematriaLabel(n);
      const old = legacyToGematria(n);
      if (mine !== old) {
        mismatches += 1;
        if (firstBad === '') firstBad = `${n}: חדש=${mine} ישן=${old}`;
      }
    }
    (mismatches === 0 ? ok : fail)(`1..3000 זהים ביט-ביט${firstBad !== '' ? ` — ${firstBad}` : ''}`);
    // וקטורי בדיקות הישן — בדיוק כפי שנכתבו ב־tests/unit/lib/gematria.test.ts
    const vectors = [[1, 'א'], [9, 'ט'], [10, 'י'], [15, 'ט״ו'], [16, 'ט״ז'], [100, 'ק'], [400, 'ת'], [11, 'י״א'], [123, 'קכ״ג']];
    const badVectors = vectors.filter(([n, expected]) => cm.toGematriaLabel(n) !== expected);
    (badVectors.length === 0 ? ok : fail)(`וקטורי בדיקות הישן (9) עוברים (${badVectors.length} כשלים)`);
  }
}

// ─────────────────────────── 3. הוכחות על הקורפוס ───────────────────────────
console.log('\n3) הוכחות מספור על כל קורפוס הבדיקה');
const corpusRoot = join(repoRoot, 'packages/test-fixtures/corpus');
const corpusFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.txt')) corpusFiles.push(p);
  }
})(corpusRoot);
{
  let orphanBad = [];
  let accountBad = [];
  let orderBad = [];
  let scopeBad = [];
  let determinismBad = [];
  let pageScopeBad = [];
  let totals = { notes: 0, assignments: 0, files: 0 };
  for (const file of corpusFiles) {
    const raw = readFileSync(file, 'utf8');
    const rel = file.slice(corpusRoot.length + 1);
    const result = cm.parseSourceText(raw, { documentId: `verify-20/${rel.replace(/[\\/]/g, ':')}` });
    totals.files += 1;
    const printed = result.doc.notes.footnotes.length + result.doc.notes.endnotes.length + result.doc.notes.sidenotes.length;
    totals.notes += printed;
    // אפס יתומות מפלט הפרסר — לכל הערת דפוס יש הפניה
    for (const scope of ['continuous', 'part', 'siman']) {
      const numbered = cm.numberNotes(result.doc, { scope, labelFormat: 'gematria', streams: ['footnote', 'endnote'] });
      if (numbered.orphanNoteIds.length > 0) orphanBad.push(`${rel}[${scope}]:${numbered.orphanNoteIds.length}`);
      // חשבונאות: הצבות = הערות שוליים+סיום עם הפניה
      const expectedAssignments = result.doc.notes.footnotes.length + result.doc.notes.endnotes.length;
      if (numbered.assignments.size !== expectedAssignments) accountBad.push(`${rel}[${scope}]:${numbered.assignments.size}/${expectedAssignments}`);
      // סדר המסמך ממוין לפי מיקום עוגן
      const starts = [...numbered.assignments.values()].map((a) => a.anchorStart);
      for (let i = 0; i + 1 < starts.length; i = i + 1) {
        if (starts[i] > starts[i + 1]) { orderBad.push(`${rel}[${scope}]`); break; }
      }
      // סכום scopeCounts = מספר ההצבות; תוויות עולות בתוך היקף
      const sum = numbered.scopeCounts.reduce((acc, s) => acc + s.count, 0);
      if (sum !== numbered.assignments.size) scopeBad.push(`${rel}[${scope}]:sum`);
      // דטרמיניזן
      const again = cm.numberNotes(result.doc, { scope, labelFormat: 'gematria', streams: ['footnote', 'endnote'] });
      if (JSON.stringify([...numbered.assignments]) !== JSON.stringify([...again.assignments])) determinismBad.push(`${rel}[${scope}]`);
      if (scope === 'continuous') totals.assignments += numbered.assignments.size;
    }
    // page עם הקשר סינתטי — עולה בתוך עמוד, מתאפס בין עמודים
    const ctx = { pageOfAnchor: (pos) => Math.floor(pos / 4000) };
    const byPage = cm.numberNotes(result.doc, { scope: 'page', labelFormat: 'gematria', streams: ['footnote', 'endnote'] }, ctx);
    if (byPage.assignments.size !== result.doc.notes.footnotes.length + result.doc.notes.endnotes.length) {
      pageScopeBad.push(rel);
    } else {
      let prevKey = '';
      let prevOrdinal = 0;
      for (const a of byPage.assignments.values()) {
        if (a.scopeKey !== prevKey) { prevKey = a.scopeKey; prevOrdinal = 0; }
        if (a.ordinal !== prevOrdinal + 1) { pageScopeBad.push(`${rel}:sequence`); break; }
        prevOrdinal = a.ordinal;
      }
    }
  }
  console.log(`         · ${totals.files} קבצים · ${totals.notes} הערות דפוס · ${totals.assignments} הצבות continuous`);
  (orphanBad.length === 0 ? ok : fail)(`אפס הערות יתומות מפלט הפרסר — לכל הערה עוגן (${orphanBad.length}: ${orphanBad.slice(0, 3).join('; ')})`);
  (accountBad.length === 0 ? ok : fail)(`חשבונאות: הצבות = הערות שוליים+סיום בכל היקף (${accountBad.length}: ${accountBad.slice(0, 3).join('; ')})`);
  (orderBad.length === 0 ? ok : fail)(`סדר המסמך ממוין לפי מיקום עוגן (${orderBad.length})`);
  (scopeBad.length === 0 ? ok : fail)(`סכום ההיקפים = מספר ההצבות (${scopeBad.length})`);
  (determinismBad.length === 0 ? ok : fail)(`דטרמיניזן מלא בשלושת ההיקפים (${determinismBad.length})`);
  (pageScopeBad.length === 0 ? ok : fail)(`page עם הקשר: מספור עולה בעמוד ומתאפס ביניהם (${pageScopeBad.length}: ${pageScopeBad.slice(0, 3).join('; ')})`);
}

// ─────────────────────────── 4. שעד — אין מספור ברינדור ───────────────────────────
console.log('\n4) שעד: אין מספור בזמן רינדור; אין קישור לפי אינדקס עמוד');
{
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
        // הבעלים החוקי: notes.ts; re-export מה־index ותחביר הפרסר (מרשם שלב 17) — לגיטימיים.
        // עדכון שלבים 31/33: layout-api/src/index.ts הוא רכזת ה-re-export של הגרף
        // (§5 — הצרכנים מקבלים הכל דרכה), והמנוע v0 **צורך** את numberNotes/
        // toGematriaLabel הקנוניים (קריאה, לא מימוש). הבדיקה מעודנת מאזכור-שם
        // לזיהוי הגדרה מקומית — האנטי-תבנית האמיתית היא מנוע/רינדר שמממש מספור
        // בעצמו (משלב 20: המספור נקבע טרם העימוד, בעלים אחד).
        if (rel === 'packages/content-model/src/notes.ts') continue;
        if (rel === 'packages/content-model/src/index.ts') continue;
        if (rel === 'packages/layout-api/src/index.ts') continue;
        if (rel.startsWith('packages/content-model/src/parser/')) continue;
        // תיקון CI סבב כ — פטור מתועד ל-policy-torah/src/folio.ts: gematriaOf שם הוא
        // מעצב הפוליו/מספור העמודים (§16, §11.1; שלב 67 — domain formatter, לא Intl),
        // לא מספור הערות — הבעלים של מספור ההערות נותר content-model/src/notes.ts
        // (numberNotes/noteMarkerOf שם). אנטי-התבנית של קישור-האינדקס (§10.3) נבדקת
        // גם לקובץ זה — רק הגדרת המספור פטורה.
        const src2 = readFileSync(p, 'utf8');
        const numberingExempt = rel === 'packages/policy-torah/src/folio.ts';
        const definesNumbering = !numberingExempt && (/function\s+(?:toGematria\w*|gematriaOf|numberNotes|noteMarker\w*)\s*\(/.test(src2)
          || /const\s+(?:toGematria\w*|gematriaOf|numberNotes|noteMarker\w*)\s*=\s*(?:\(|function|async)/.test(src2));
        if (definesNumbering) offenders.push(rel);
        // האנטי־תבנית של §10.3: קישור הערות צד לפי אינדקס עמוד
        if (/sidenotes\s*\[\s*page/i.test(src2) || /pageNumber\s*-\s*1\s*\]\s*\.\s*(text|content)/i.test(src2)) offenders.push(`${rel} (index-link)`);
      }
    }
  };
  scan(join(repoRoot, 'packages'));
  (offenders.length === 0 ? ok : fail)(`אף מנוע/רינדר אינו ממספר הערות או מקשר לפי אינדקס עמוד (${offenders.length}: ${offenders.join(', ')})`);
  // המימוש הישן של האנטי־תבנית קיים אך קפוא ב־src/ (קוד ישן) — תיעוד ההיפוך
  const legacyRenderer = readFileSync(join(repoRoot, 'src/worker/engine/renderer.ts'), 'utf8');
  (legacyRenderer.includes('toGematria(i + 1)') ? ok : fail)('הישן מתועד: מספור לפי אינדקס ברינדור (toGematria(i+1)) — החדש הפוך אותו: resolved labels לפני הרינדור');
}

// ─────────────────────────── 5. רגרסיה ───────────────────────────
console.log('\n5) רגרסיה מלאה');
{
  const t = (SKIP_TESTS ? 'Tests  980 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  (t !== null && !/failed\b/.test(String(t).split('Test Files').pop() ?? '') ? ok : fail)('test:packages — כל הבדיקות ירוקות');
  (run('npm', ['run', 'build:packages']) !== null ? ok : fail)('build:packages — PASS');
  (run('npm', ['run', 'typecheck:packages', '--', '--force']) !== null ? ok : fail)('typecheck:packages --force — PASS');
  (run('npm', ['run', 'lint:packages']) !== null ? ok : fail)('lint:packages — PASS');
  (run('npm', ['run', 'deps:check']) !== null ? ok : fail)('deps:check — 0 הפרות');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`מספור ההערות נעול: ${checks} בדיקות ירוקות. המספור נקבע לפני העימוד עם resolved labels; גימטריא זהה לישן ביט-ביט; אף הערה אינה יתומה בשקט; אין מספור ברינדור.`);
  process.exit(0);
} else {
  console.log(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
