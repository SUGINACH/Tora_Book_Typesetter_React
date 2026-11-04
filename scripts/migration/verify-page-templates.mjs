#!/usr/bin/env node
/**
 * verify-page-templates — אימות שלב 50: תבניות עמוד, parity ובניית
 * אזורים (אפיון §9.3, §5, §11.1, §11.2; פרק ז/M6).
 *
 * בדיקות:
 *   1. חוזה: כל הסוגים והייצואים; 12 תבניות (6 סוגים × 2 parity).
 *   2. ריצה חיה מה־dist: מבנה body (header/טורים/footer/עוגן), מזהים
 *      קנוניים תואמי v0 בהצבה (page:{N}:col:0…), parity לפי אינדקס.
 *   3. same_as_even: verso ראי כשאין הבדל; פוליו-חוץ/הערות צד ⇒ אין ראי.
 *   4. שערים: ornament+custom-box, נכס לפי מזהה+sha256, אין פוליו.
 *   5. אין חפיפות בין אזורים סטטיים (חריג ornament מתועד); אין תבנית
 *      בלתי-מדודה (גבהים לא-חוקיים נדחים).
 *   6. הזרמה ל-PaginationState: initialRemainingByRegion תואם לחוזה
 *      של שלב 49 (אותם מזהי אזורים; תקציב עוגן ההערות).
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

// הגדרות v0 מינימליות לבניית הגאומטריה הנעולה
const settings = {
  'size-body': 16, 'line-height-body': 1.5, 'note-marker-size': 11, 'prop-margin': 7.5,
  'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1, 'note-marker-type': 'super',
};
const v0 = engine.readV0Settings({ values: settings, configHash: '0'.repeat(64) });
const baseInput = {
  geometry: v0.geometry,
  headerHeightLu: 30000,
  footerHeightLu: 26000,
  columns: 2,
  footnoteColumns: 1,
  folioPosition: 'bottom_center',
  showFolio: true,
  sidenoteWidthLu: null,
};

console.log('1) חוזה — ייצואים וסט מלא');
for (const fn of ['buildPageTemplateSet', 'pageTemplateIssues', 'instantiatePageRegions', 'initialRemainingByRegion', 'notesRegionIdOf', 'outerSideOf', 'templateShowsFolio']) {
  (typeof engine[fn] === 'function' ? ok : fail)(`מיוצא: ${fn}`);
}
{
  const set = engine.buildPageTemplateSet(baseInput);
  (set.byId.size === 12 ? ok : fail)(`סט מלא: 12 תבניות (קיבלנו ${set.byId.size})`);
  for (const kind of ['main-shaar', 'back-shaar', 'sub-shaar', 'toc', 'body', 'notes']) {
    for (const parity of ['recto', 'verso']) {
      const t = set.byId.get(`tpl:${kind}:${parity}`);
      (t !== undefined && t.kind === kind && t.parity === parity ? ok : fail)(`tpl:${kind}:${parity}`);
    }
  }
}

console.log('\n2) מבנה body והצבה על עמוד פיזי (מזהי v0)');
{
  const set = engine.buildPageTemplateSet(baseInput);
  const t = set.for('body', 3);
  const roles = t.regions.map((r) => r.role);
  (JSON.stringify(roles) === JSON.stringify(['header', 'body-column', 'body-column', 'footer']) ? ok : fail)(`מבנה body: header, 2 טורים, footer (קיבלנו ${roles.join(',')})`);
  (set.for('body', 3).parity === 'recto' && set.for('body', 4).parity === 'verso' ? ok : fail)('parity לפי אינדקס: 3=recto (אי-זוגי), 4=verso (זוגי)');
  const regions = engine.instantiatePageRegions(t, 3);
  const ids = regions.map((r) => r.id);
  (JSON.stringify(ids) === JSON.stringify(['page:3:header', 'page:3:col:0', 'page:3:col:1', 'page:3:footer'])
    ? ok : fail)(`מזהים קנוניים תואמי v0 (קיבלנו ${ids.join(',')})`);
  const col0 = t.regions.find((r) => r.role === 'body-column' && r.columnIndex === 0);
  const col1 = t.regions.find((r) => r.role === 'body-column' && r.columnIndex === 1);
  (col0.rect.x > col1.rect.x ? ok : fail)('טור 0 (ימין) שמאלי... כלומר: x גדול יותר מטור 1 — RTL (§9.3#3)');
  (col0.rect.x === v0.geometry.mainX + v0.geometry.columnWidth + v0.geometry.columnGap ? ok : fail)('טור 0 בנוסחת v0 הנעולה');
  (t.footnoteAnchor !== undefined && t.footnoteAnchor.rect.height === col0.rect.height ? ok : fail)('עוגן הערות על מלוא התוכן (הכרעת הפיצול בחיפוש — §9.3#5)');
  // הצבה כפולה ⇐ אותה תוצאה
  (JSON.stringify(engine.instantiatePageRegions(t, 3)) === JSON.stringify(regions) ? ok : fail)('דטרמיניזם ההצבה');
}

console.log('\n3) same_as_even');
{
  const set = engine.buildPageTemplateSet(baseInput);
  (set.for('body', 2).sameAs === 'tpl:body:recto' ? ok : fail)('verso ראי של recto (פוליו מרכזי, בלי הערות צד)');
  const outerSet = engine.buildPageTemplateSet({ ...baseInput, folioPosition: 'bottom_outer' });
  (outerSet.for('body', 2).sameAs === undefined ? ok : fail)('פוליו-חוץ ⇒ אין sameAs');
  const sideSet = engine.buildPageTemplateSet({ ...baseInput, sidenoteWidthLu: 50000 });
  (sideSet.for('body', 2).sameAs === undefined ? ok : fail)('הערות צד ⇒ אין sameAs');
  (set.for('notes', 2).sameAs === 'tpl:notes:recto' && set.for('main-shaar', 2).sameAs === 'tpl:main-shaar:recto' ? ok : fail)('notes/shaar תמיד ראי (סימטריים)');
}

console.log('\n4) שערים — נכס לפי מזהה ו־sha256 (§11.2)');
{
  const asset = { assetId: 'ext_1____________svg', sha256: 'e'.repeat(64), viewBox: { width: 2000, height: 2880 } };
  const shaarSet = engine.buildPageTemplateSet({ ...baseInput, shaarAssets: { 'main-shaar': asset, 'back-shaar': asset, 'sub-shaar': asset } });
  const t = shaarSet.for('main-shaar', 1);
  const roles = t.regions.map((r) => r.role).sort().join(',');
  (roles === 'custom-box,ornament' ? ok : fail)(`שער: ornament+custom-box (קיבלנו ${roles})`);
  (JSON.stringify(t.asset) === JSON.stringify(asset) ? ok : fail)('הנכס מקושר במלואו (מזהה+sha256+viewBox)');
  (engine.templateShowsFolio(t) === false ? ok : fail)('אין פוליו בעמודי שער');
  const noAsset = engine.buildPageTemplateSet(baseInput).for('back-shaar', 1);
  (noAsset.asset === undefined && engine.pageTemplateIssues(noAsset).length === 0 ? ok : fail)('בלי נכס — תבנית חוקית (הנכס מקושר ב-M8 שלב 68 — מתועד)');
}

console.log('\n5) אין חפיפות; אין תבנית בלתי-מדודה');
{
  const set = engine.buildPageTemplateSet(baseInput);
  let allValid = true;
  for (const t of set.byId.values()) {
    if (engine.pageTemplateIssues(t).length > 0) { allValid = false; console.log(`    פגום: ${t.id} — ${engine.pageTemplateIssues(t).join(';')}`); }
  }
  (allValid ? ok : fail)('כל 12 התבניות עוברות pageTemplateIssues (אין חפיפות סטטית; ornament רקע מתועד)');
  let rejected = false;
  try { engine.buildPageTemplateSet({ ...baseInput, headerHeightLu: -1 }); } catch { rejected = true; }
  (rejected ? ok : fail)('גובה header שלילי נדחה');
  rejected = false;
  try { engine.buildPageTemplateSet({ ...baseInput, columns: 3 }); } catch { rejected = true; }
  (rejected ? ok : fail)('columns=3 נדחה');
  rejected = false;
  try { engine.buildPageTemplateSet({ ...baseInput, sidenoteWidthLu: -5 }); } catch { rejected = true; }
  (rejected ? ok : fail)('רוחב הערות צד שלילי נדחה');
  // גובה 0 לגיטימי (מדוד-אפס) — אין אזור header
  const zero = engine.buildPageTemplateSet({ ...baseInput, headerHeightLu: 0 });
  (zero.for('body', 1).regions.some((r) => r.role === 'header') === false ? ok : fail)('מדוד-אפס ⇒ אין אזור header');
}

console.log('\n6) הזרמה ל-PaginationState (חוזה שלב 49)');
{
  const set = engine.buildPageTemplateSet(baseInput);
  const t = set.for('body', 5);
  const remaining = engine.initialRemainingByRegion(t, 5);
  const keys = Object.keys(remaining).sort();
  (JSON.stringify(keys) === JSON.stringify(['page:5:col:0', 'page:5:col:1', 'page:5:footer', 'page:5:header', 'page:5:notes'])
    ? ok : fail)(`מזהי האזורים במצב (קיבלנו ${keys.join(',')})`);
  (remaining['page:5:notes'] === t.footnoteAnchor.rect.height ? ok : fail)('תקציב עוגן ההערות נכנס למצב');
  const state = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: remaining });
  (engine.verifyPaginationState(state) === undefined ? ok : fail)('המצב נבנה ואומת מנותרי התבנית (חיבור שלב 49←50)');
  (engine.outerSideOf('recto') === 'left' && engine.outerSideOf('verso') === 'right' ? ok : fail)('צד חיצוני RTL: recto=שמאל, verso=ימין');
}

console.log('\n7) מלאי חלקי העמוד — כל חלק מיוצג או זניחתו מתועדת');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'templates.ts'), 'utf8');
  for (const part of ['header', 'body-column', 'footnotes', 'outer-notes', 'footer', 'ornament', 'custom-box']) {
    (src.includes(`'${part}'`) || src.includes(`"${part}"`) ? ok : fail)(`חלק עמוד במלאי: ${part}`);
  }
  // הזנחות מתועדות: תיבות הטקסט של השער (שלב 68) וסדר קריאת טורי הערות (policy)
  (src.includes('שלב 68') ? ok : fail)('דחיית תיבות השער מתועדת (שלב 68)');
  (src.includes('סדר הקריאה') && src.includes('policy') ? ok : fail)('סדר קריאת טורי הערות — policy מתועד');
}

console.log('\n8) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+1039\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 1039/1039');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הכל ירוק: ${checks}/${checks} — שלב 50 (תבניות עמוד) עבר`);
