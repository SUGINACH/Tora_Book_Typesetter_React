#!/usr/bin/env node
/**
 * verify-tauri-shell — אימות שלב 95: מעטפת Tauri על אותו Worker (§12.3, §18-M11).
 *
 * תכנית השלב: "Tauri מפעיל את אותו Worker ב-webview שלו; אין מנוע Rust
 * מקביל", "מיפוי כל dialog/file error לאותו קטלוג שגיאות מקומי של הממשק",
 * "Tauri smoke בדיקות פיתוח מול ה-CLI". שעת השער: "אין פיצול מנוע;
 * אותן תוצאות".
 *
 * מה נבדק (ההוכחה היא מבנית — הסביבה ללא תצוגה אינה מריצה GUI):
 *   1. תצורה: ה-webview טוען את אותו הבילד היחיד (frontendDist=../dist,
 *      beforeBuildCommand=npm run build — אותה פקודת הבנייה של הווב;
 *      אין בילד שני ואין ממשק מקביל).
 *   2. ה-Rust הוא מעטפת בלבד: main.rs מפעיל builder+פלאגינים בלבד; אין
 *      בו כל לוגיקת עימוד/מדידה/shaping; Cargo.toml תלוי רק ב-tauri/
 *      serde/פלאגינים — אין crate מנוע; אין קוד TS/JS ב-src-tauri.
 *   3. הרשאות מינימליות: capabilities מוגבלות לדיאלוגים וקריאת קבצים.
 *   4. קטלוג שגיאות יחיד: src/worker-host/tauri-errors.ts ממפה את שגיאות
 *      הפלאגינים לקודים מהקטלוג הקפוא; ImportButtons משתמש בו (מקור
 *      יחיד — אין סיווג מקביל); בדיקות vitest קיימות ומכסות את המיפוי.
 *   5. אותו מנוע ב-webview: הבילד (dist) נוצר; ה-index.html שלו מפנה
 *      רק לנכסים מקומיים (אין רשת — §19); הבאנדל מכיל את פרוטוקול
 *      ה-Worker ואת סממני המנוע (protocolVersion) — ה-webview של Tauri
 *      טוען בדיוק את הקוד שה-E2E הוכיח (אורקל ה-CLI).
 *   6. smoke מול ה-CLI: הרצת ה-CLI על מסמך הייחוס — layoutHash יציב
 *      (שתי הרצות זהות; hex-64) — אותו hash שהאורקל ב-E2E 02 נועל
 *      מול האפליקציה בדפדפן, וממנו נגזרת תוצאת ה-webview (אותו JS).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

console.log('1) תצורה — בילד יחיד, אין ממשק מקביל');
{
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  (conf.build?.frontendDist === '../dist' ? ok : fail)('frontendDist === ../dist (אותו בילד הווב)');
  (conf.build?.beforeBuildCommand === 'npm run build' ? ok : fail)('beforeBuildCommand === npm run build (פקודת הבנייה של הווב)');
  (conf.build?.devUrl === 'http://localhost:5173' ? ok : fail)('devUrl — מצב פיתוח בלבד (vite dev)');
  (typeof conf.bundle?.active === 'boolean' ? ok : fail)('מצב bundle מוגדר');
}

console.log('\n2) ה-Rust מעטפת בלבד — אין מנוע מקביל');
{
  const main = read('src-tauri/src/main.rs');
  const forbidden = [/shap|harfbuzz|measure|typeset|layout|line.?break|knuth|plass|glyph|woff|paginate|column|folio/i, /\bfn\s+(typeset|measure|shape|layout)/i];
  const hits = forbidden.filter((re) => re.test(main));
  (hits.length === 0 ? ok : fail)(`main.rs נקי מלוגיקת עימוד${hits.length ? ` (${hits.length} תבניות)` : ''}`);
  (/tauri::Builder/.test(main) ? ok : fail)('main.rs — Builder (מעטפת)');
  (/tauri_plugin_fs::init/.test(main) && /tauri_plugin_dialog::init/.test(main) ? ok : fail)('פלאגינים: fs + dialog בלבד');
  const cargo = read('src-tauri/Cargo.toml');
  const allow = /^tauri$|^tauri-build$|^tauri-plugin-fs$|^tauri-plugin-dialog$|^serde$|^serde_json$/;
  // רק הסקשנים [dependencies]/[build-dependencies] — לא מטא-דאטה של [package]
  const depSections = cargo.split(/\n\[/).filter((s) => s.startsWith('dependencies') || s.startsWith('build-dependencies'));
  const deps = [...depSections.join('\n').matchAll(/^\s*([a-z0-9_-]+)\s*=/gm)].map((m) => m[1]);
  const badDeps = deps.filter((d) => !allow.test(d));
  (badDeps.length === 0 ? ok : fail)(`Cargo.toml — תלויות מעטפת בלבד${badDeps.length ? ' (לא מותר: ' + badDeps.join(', ') + ')' : ''}`);
  // אין קוד JS/TS בצד ה-Rust
  const files = [];
  const scanDir = (d) => {
    for (const e of readdirSync(join(repoRoot, d), { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) scanDir(p);
      else files.push(p);
    }
  };
  scanDir('src-tauri');
  const engineFiles = files.filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
  (engineFiles.length === 0 ? ok : fail)(`אין קוד JS/TS ב-src-tauri${engineFiles.length ? ' — ' + engineFiles.join(', ') : ''}`);
}

console.log('\n3) הרשאות מינימליות (capabilities)');
{
  const capPath = 'src-tauri/capabilities/default.json';
  if (existsSync(join(repoRoot, capPath))) {
    const cap = JSON.parse(read(capPath));
    const perms = cap.permissions ?? [];
    const allowed = /^core:default$|^dialog:allow-(open|save)$|^fs:allow-(read-text-file|exists)$/;
    const bad = perms.filter((p) => !allowed.test(p));
    (bad.length === 0 ? ok : fail)(`הרשאות: דיאלוגים וקריאת קבצים בלבד${bad.length ? ' (לא מותר: ' + bad.join(', ') + ')' : ''}`);
  } else {
    fail('src-tauri/capabilities/default.json קיים');
  }
}

console.log('\n4) קטלוג שגיאות יחיד — מיפוי פלאגינים ב-TS');
{
  const adapter = read('src/worker-host/tauri-errors.ts');
  (/classifyHostFileFailure/.test(adapter) && /errors\.import\./.test(adapter) ? ok : fail)('tauri-errors.ts — מיפוי לקודי הקטלוג (errors.import.*)');
  (/isTauriHost/.test(adapter) ? ok : fail)('זיהוי סביבת Tauri (isTauriHost)');
  const buttons = read('src/components/editor/ImportButtons.tsx');
  (/classifyHostFileFailure/.test(buttons) ? ok : fail)('ImportButtons משתמש במקור היחיד (אין סיווג מקביל)');
  (!/reportImportFailure\('errors\.import\.[A-Z_]+',\s*\{/.test(buttons.replace(/classifyHostFileFailure\(failure\.code, failure\.params\)/g, '')) ? ok : fail)('אין קריאות דיווח ישירות מקומיות בנתיב הקובץ');
  const testPath = 'tests/worker-host/tauri-errors.test.ts';
  (existsSync(join(repoRoot, testPath)) ? ok : fail)('בדיקות המיפוי קיימות (tauri-errors.test.ts)');
}

console.log('\n5) הבילד — ה-webview טוען את אותו מנוע');
{
  const distIndex = join(repoRoot, 'dist', 'index.html');
  if (!existsSync(distIndex)) {
    console.log('  [..]   dist חסר — נבנה כעת (אותה פקודה כמו ה-Deploy)');
    try {
      execFileSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'pipe' });
    } catch (e) {
      fail('vite build נכשל: ' + String(e?.message ?? e).slice(0, 200));
    }
  }
  if (existsSync(distIndex)) {
    const html = readFileSync(distIndex, 'utf8');
    (/src="\.\/assets\//.test(html) || /href="\.\/assets\//.test(html) ? ok : fail)('index.html מפנה לנכסים מקומיים (תתי-נתיב)');
    (!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '')) ? ok : fail)('אין כתובות רשת ב-index.html (§19)');
    const assetsDir = join(repoRoot, 'dist', 'assets');
    const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
    (jsFiles.length > 0 ? ok : fail)(`באנדל JS קיים (${jsFiles.length} קבצים)`);
    // סממן המנוע: פרוטוקול ה-Worker וקודי המנוע שורדים מיניפיקציה (מחרוזות)
    let hasProtocol = false;
    let biggest = 0;
    for (const f of jsFiles) {
      const p = join(assetsDir, f);
      const size = statSync(p).size;
      biggest = Math.max(biggest, size);
      const src = readFileSync(p, 'utf8');
      if (src.includes('protocolVersion')) hasProtocol = true;
    }
    (hasProtocol ? ok : fail)('הבאנדל מכיל את פרוטוקול ה-Worker (protocolVersion) — המנוע בפנים');
    (biggest > 500_000 ? ok : fail)(`החבילה הגדולה ${(biggest / 1024).toFixed(0)}KB — המנוע והגופנים בפנים (לא גרסת דפדפן מוקטנת)`);
  } else {
    fail('dist/index.html לא נוצר');
  }
}

console.log('\n6) smoke מול ה-CLI — אותן תוצאות (layoutHash יציב)');
{
  const cli = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
  if (!existsSync(cli)) {
    console.log('  [..]   CLI חסר — בניית החבילות');
    try {
      execFileSync('npm', ['run', 'build:packages'], { cwd: repoRoot, stdio: 'pipe' });
    } catch (e) {
      fail('build:packages נכשל');
    }
  }
  const ref = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
  const runOnce = () => {
    const out = execFileSync(
      process.execPath,
      [cli, '--input', ref, '--out', join(repoRoot, 'artifacts', 'e2e-reference')],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    return out;
  };
  try {
    runOnce();
    const r1 = JSON.parse(readFileSync(join(repoRoot, 'artifacts', 'e2e-reference', 'report.json'), 'utf8'));
    runOnce();
    const r2 = JSON.parse(readFileSync(join(repoRoot, 'artifacts', 'e2e-reference', 'report.json'), 'utf8'));
    (/^[0-9a-f]{64}$/.test(r1.layoutHash) ? ok : fail)('layoutHash — hex-64');
    (r1.layoutHash === r2.layoutHash ? ok : fail)('שתי הרצות CLI ⇒ אותו hash (דטרמיניזם)');
    // האורקל ב-E2E 02 נועל אותו hash מול האפליקציה בדפדפן על אותו קלט —
    // ה-webview של Tauri טוען את אותו JS (סעיף 5) ⇒ אותה תוצאה.
    (typeof r1.pages === 'number' && r1.pages > 0 ? ok : fail)(`עמודים: ${r1.pages}`);
  } catch (e) {
    fail('הרצת ה-CLI נכשלה: ' + String(e?.message ?? e).slice(0, 200));
  }
}

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
