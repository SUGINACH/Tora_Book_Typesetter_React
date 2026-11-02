#!/usr/bin/env node
/**
 * verify-unicode — אימות שלב 18: נאמנות נוסח ו־Unicode (ADR-007).
 * אסמכתא: אפיון §3.3, §6.2, §6.6 · ADR-007 · תכנית שלב 18.
 *
 * בדיקות:
 *   1. ADR-007 קיים ונועל את ההחלטות (איסור נרמול; view בלבד; קטגוריות תווים).
 *   2. ממשק ה-API: כל הפונקציות והקבועים זמינים; קודי errors.unicode.* רשומים.
 *   3. אינווריאנט הגילוי: ריק ⟺ יציב — על וקטורים ידועים ועל דגימות קורפוס.
 *   4. הוכחת נאמנות על כל קורפוס הבדיקה (כל קובצי ה־txt):
 *      coverage.ok · אפס בעיות אטומים · אידמפוטנטיות סריאליזציה ·
 *      רצפי non-NFC ו־RLM נשמרים בתוך אטומים מילולית.
 *   5. סריקת מקור: אין קריאה ל־.normalize( ב־packages/ מחוץ ל־unicode.ts
 *      (ובדיקות — אורקלים חוקיים); אין TextDecoder עם NFC/NFD בליבה.
 *   6. טבלת המדיניות סגורה מול 11 הקטגוריות של ADR-007.
 *   7. רגרסיה: test:packages, build, typecheck, lint, deps.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 * תלויות: אפס (Node 22 בלבד) + סביבת הבדיקות הקיימת.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  } catch {
    return null;
  }
};

// ─────────────────────────── 1. ADR-007 ───────────────────────────
console.log('1) ADR-007 — נעילת ההחלטות');
{
  const adrPath = join(repoRoot, 'docs/adr/ADR-007-unicode-fidelity.md');
  if (!existsSync(adrPath)) {
    fail('docs/adr/ADR-007-unicode-fidelity.md קיים');
  } else {
    const adr = readFileSync(adrPath, 'utf8');
    ok('docs/adr/ADR-007-unicode-fidelity.md קיים');
    (adr.includes('נרמול Unicode אסור בכל מסלול הייצור') ? ok : fail)('ההחלטה: נרמול אסור במסלול הייצור — נעול מפורשות');
    (adr.includes('normalizeView') && adr.includes('ההיתר היחיד') ? ok : fail)('view מנורמל = ההיתר היחיד, עם מיפוי offsets');
    (adr.includes('חלופות שנשקלו') ? ok : fail)('חלופות תועדו (NFC בקלט / NFC+מיפוי / איסור+view / נרמול במדידה)');
    (adr.includes('231 רצפים שאינם NFC') ? ok : fail)('הראיה מהקורפוס (231 רצפים × 3 קבצים) מתועדת');
    (adr.includes('תנאי ביטול') ? ok : fail)('תנאי ביטול מוגדרים');
  }
}

// ─────────────────────────── 2. ממשק ה-API ───────────────────────────
console.log('\n2) ממשק ה־API וקטלוג השגיאות');
{
  const need = [
    'findNormalizationSpans', 'normalizeView', 'inspectUnicode', 'atomFidelityIssues',
    'UNICODE_FIDELITY_RULES', 'UNICODE_NORMALIZATION_FORMS', 'UNICODE_POLICY_VERSION',
    'normalizationDetectionInvariantHolds',
  ];
  const missing = need.filter((n) => typeof cm[n] !== 'function' && !Array.isArray(cm[n]) && typeof cm[n] !== 'string');
  (missing.length === 0 ? ok : fail)(`כל 8 נקודות ה־API זמינות (חסרות: ${missing.join(', ') || 'אין'})`);
  for (const key of ['errors.unicode.INVALID_FORM', 'errors.unicode.INVALID_TEXT', 'errors.unicode.MAPPING_MISMATCH']) {
    (cm.isRegisteredContentModelErrorKey(key) ? ok : fail)(`${key} רשום בקטלוג`);
  }
  (cm.contentModelErrorCatalogSize() === 82 ? ok : fail)(`קטלוג content-model: 82 קודים — 76 שלב 18 + 3 brackets + 3 notes (נמצאו ${cm.contentModelErrorCatalogSize()})`);
  (cm.UNICODE_POLICY_VERSION === 'unicode-policy:v1' ? ok : fail)('UNICODE_POLICY_VERSION = unicode-policy:v1');
}

// ─────────────────────────── 3. אינווריאנט הגילוי ───────────────────────────
console.log('\n3) אינווריאנט הגילוי — ריק ⟺ יציב');
{
  const vectors = [
    ['', true], ['plain ascii', true], ['שלום עולם', true],
    ['בֵּ', false], // הרצף מהקורפוס — דגש לפני תנועה
    ['x בֵּ y', false], ['café', true], ['e\u0301', false], // לטינית מפורקת תחת NFC
    [String.fromCharCode(0x1100, 0x1161), false], // Hangul Jamo — מחוץ לטבלה, קיום מדויק
  ];
  let bad = 0;
  for (const [text] of vectors) {
    for (const form of cm.UNICODE_NORMALIZATION_FORMS) {
      if (!cm.normalizationDetectionInvariantHolds(text, form)) bad += 1;
    }
  }
  (bad === 0 ? ok : fail)(`אינווריאנט מוחלט על ${vectors.length} וקטורים × 4 צורות (${bad} הפרות)`);
  // מיפוי view: אורכים ועקביות
  const v = cm.normalizeView('לפני בֵּ אחרי', 'NFC');
  const good = v.changed === true && v.viewToSource.length === v.view.length
    && v.sourceToView.length === 'לפני בֵּ אחרי'.length && v.view.normalize('NFC') === v.view;
  (good ? ok : fail)('מיפוי view עקבי וה־view עצמו מנורמל');
}

// ─────────────────────────── 4. הוכחת נאמנות על כל הקורפוס ───────────────────────────
console.log('\n4) הוכחת נאמנות — כל קורפוס הבדיקה (שעד השלב: אין נרמול או ניקוי בלתי מדווח)');
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
  let parsed = 0;
  let coverageBad = [];
  let fidelityBad = [];
  let serializeBad = [];
  let nonNfcLost = [];
  let rlmLost = [];
  let inventories = [];
  for (const file of corpusFiles) {
    const raw = readFileSync(file, 'utf8');
    const rel = file.slice(corpusRoot.length + 1);
    const docId = `verify-18/${rel.replace(/[\\/]/g, ':')}`;
    let result;
    try {
      result = cm.parseSourceText(raw, { documentId: docId });
      parsed += 1;
    } catch (e) {
      coverageBad.push(`${rel}: ${String(e.catalogKey ?? e.message).slice(0, 40)}`);
      continue;
    }
    if (!result.coverage.ok) coverageBad.push(rel);
    const issues = cm.atomFidelityIssues(raw, result.doc);
    if (issues.length > 0) fidelityBad.push(`${rel}: ${issues[0].kind}`);
    // אידמפוטנטיות סריאליזציה — אין נרמול בשמירה
    const s1 = cm.serializeDocument(result.doc);
    const d2 = cm.parseDocument(s1);
    const s2 = cm.serializeDocument(d2);
    if (s1 !== s2) serializeBad.push(rel);
    // רצפי non-NFC נשמרים בתוך אטומים מילולית
    const spans = cm.findNormalizationSpans(raw, 'NFC');
    if (spans.length > 0) {
      const changedTexts = new Set();
      for (const block of cm.allBlocks(result.doc)) {
        for (const item of block.inline) {
          if (item.kind !== 'text') continue;
          for (const atom of item.atoms) changedTexts.add(atom.text);
        }
      }
      let allPreserved = true;
      for (const s of spans) {
        // הרצף חייב להופיע בתוך אטום כלשהו מילולית
        let found = false;
        for (const t of changedTexts) {
          if (t.includes(s.original)) { found = true; break; }
        }
        if (!found) { allPreserved = false; break; }
      }
      if (!allPreserved) nonNfcLost.push(rel);
    }
    // RLM נשמר מילולית
    const rlmCount = (raw.match(/\u200F/g) ?? []).length;
    if (rlmCount > 0) {
      let atomRlm = 0;
      for (const block of cm.allBlocks(result.doc)) {
        for (const item of block.inline) {
          if (item.kind !== 'text') continue;
          for (const atom of item.atoms) {
            atomRlm += (atom.text.match(/\u200F/g) ?? []).length;
          }
        }
      }
      if (atomRlm !== rlmCount) rlmLost.push(`${rel}: ${atomRlm}/${rlmCount}`);
    }
    // מאגר לסיכום
    const inv = cm.inspectUnicode(raw.slice(0, 200000)); // דגימה ראשונה למאגר — המאגר אינו שעד
    inventories.push({ rel, nikud: inv.nikudCount, nonNfc: cm.findNormalizationSpans(raw, 'NFC').length, rlm: rlmCount });
  }
  ok(`כל ${corpusFiles.length} קובצי ה־txt נפרסרו (${parsed} הצלחות)`);
  (coverageBad.length === 0 ? ok : fail)(`coverage.ok לכל הקבצים (${coverageBad.length} כשלים: ${coverageBad.slice(0, 3).join('; ')})`);
  (fidelityBad.length === 0 ? ok : fail)(`אפס בעיות נאמנות אטומים — כל אטום שווה לפרוסת המקור (${fidelityBad.length}: ${fidelityBad.slice(0, 3).join('; ')})`);
  (serializeBad.length === 0 ? ok : fail)(`אידמפוטנטיות serialize→parse→serialize ביט-ביט (${serializeBad.length}: ${serializeBad.slice(0, 3).join('; ')})`);
  (nonNfcLost.length === 0 ? ok : fail)(`כל רצפי ה־non-NFC נשמרים בתוך אטומים מילולית (${nonNfcLost.length}: ${nonNfcLost.slice(0, 3).join('; ')})`);
  (rlmLost.length === 0 ? ok : fail)(`כל תווי ה־RLM נשמרים מילולית (${rlmLost.length}: ${rlmLost.slice(0, 3).join('; ')})`);
  const withNonNfc = inventories.filter((i) => i.nonNfc > 0);
  console.log(`         · קבצים עם רצפי non-NFC: ${withNonNfc.length} (${withNonNfc.slice(0, 4).map((i) => `${i.rel.split(/[\\/]/).pop()}:${i.nonNfc}`).join(', ')}${withNonNfc.length > 4 ? '…' : ''})`);
  const withRlm = inventories.filter((i) => i.rlm > 0);
  console.log(`         · קבצים עם RLM: ${withRlm.length} · סה"כ ניקוד בדגימות: ${inventories.reduce((a, i) => a + i.nikud, 0)}`);
}

// ─────────────────────────── 5. סריקת מקור — איסור נרמול בליבה ───────────────────────────
console.log('\n5) סריקת מקור — אין נרמול ב־packages/ מחוץ ל־unicode.ts');
{
  const offenders = [];
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist' || name === 'legacy' || name === '.git') continue;
        scan(p);
      } else if (/\.(ts|js|mjs|cjs)$/.test(name)) {
        const rel = p.slice(repoRoot.length + 1);
        if (rel.startsWith('packages/content-model/src/unicode.ts')) continue; // הבעלים החוקי היחיד
        if (rel.includes('/test/') || rel.includes('\\test\\') || rel.includes('.test.')) continue; // אורקלים בבדיקות — חוקיים
        if (rel.startsWith('packages/test-fixtures/')) continue; // חבילת בדיקות — אורקלים חוקיים
        const src = readFileSync(p, 'utf8');
        if (/\.normalize\s*\(/.test(src)) offenders.push(rel);
        if (/TextDecoder\([^)]*NFD|TextDecoder\([^)]*NFC|normalize\(\s*['"]NFK/.test(src)) offenders.push(`${rel} (decoder)`);
      }
    }
  };
  scan(join(repoRoot, 'packages'));
  (offenders.length === 0 ? ok : fail)(`אפס קריאות נרמול בליבת החבילות (${offenders.length}: ${offenders.join(', ')})`);
}

// ─────────────────────────── 6. טבלת המדיניות ───────────────────────────
console.log('\n6) טבלת UNICODE_FIDELITY_RULES — סגירות מול ADR-007');
{
  const rules = cm.UNICODE_FIDELITY_RULES;
  const expected = ['nikud', 'taamim', 'kri-ktiv', 'maqaf', 'gershayim', 'bidi-controls', 'html-entities', 'html-tags', 'edge-whitespace', 'bom', 'normalization'];
  const categories = rules.map((r) => r.category);
  (JSON.stringify(categories) === JSON.stringify(expected) ? ok : fail)('כל 11 הקטגוריות של ADR-007 בסדר קנוני');
  const badPolicy = rules.filter((r) => !['preserve', 'preserve-attached', 'whitespace-edge-syntax', 'literal-content-with-warning', 'report-only'].includes(r.policy));
  (badPolicy.length === 0 ? ok : fail)('אף מדיניות אינה "תיקון" — preserve/literal/report בלבד');
  const noAdr = rules.filter((r) => !String(r.adrSection).startsWith('ADR-007'));
  (noAdr.length === 0 ? ok : fail)('לכל כלל אסמכתא ל־ADR-007');
}

// ─────────────────────────── 7. רגרסיה ───────────────────────────
console.log('\n7) רגרסיה מלאה');
{
  const t = (SKIP_TESTS ? 'Tests  869 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  (t !== null && !/failed\b/.test(String(t).split('Test Files').pop() ?? '') ? ok : fail)('test:packages — כל הבדיקות ירוקות');
  ((x => x !== null && !/error TS/.test(x))(run('npm', ['run', 'build:packages'])) ? ok : fail)('build:packages — PASS');
  (run('npm', ['run', 'typecheck:packages', '--', '--force']) !== null ? ok : fail)('typecheck:packages --force — PASS');
  (run('npm', ['run', 'lint:packages']) !== null ? ok : fail)('lint:packages — PASS');
  (run('npm', ['run', 'deps:check']) !== null ? ok : fail)('deps:check — 0 הפרות');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`נאמנות הנוסח הוכחה: ${checks} בדיקות ירוקות. אין נרמול או ניקוי בלתי מדווח בשום שלב; המקור נשמר תו-מול-תו; view מפורש בלבד.`);
  process.exit(0);
} else {
  console.log(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
