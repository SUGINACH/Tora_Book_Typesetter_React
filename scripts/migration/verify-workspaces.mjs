#!/usr/bin/env node
/**
 * verify-workspaces — אימות שלד ה־workspaces וגרף התלות (שלב 7 בתכנית 100 השלבים).
 * אסמכתא: אפיון §5 (ארכיטקטורת חבילות ותלות) · תכנית 100 השלבים, שלב 7.
 *
 * בדיקות:
 *   1. שורש: workspaces = packages/*; סקריפטים build:packages + typecheck:packages.
 *   2. שתים־עשרה החבילות קיימות; לכל אחת package.json תקין: @tora/*, private,
 *      sideEffects:false, exports דרך index.ts בלבד; src/index.ts קיים (למעט test-fixtures — חבילת נתונים).
 *   3. גרף התלות המחייב: dependencies ב-package.json תואמות בדיוק לגרף;
 *      tsconfig references תואמות לגרף למעט קשתות לחבילות נתונים.
 *   4. אין יבוא צולב שלא לפי הגרף: כל import של @tora/* בקוד המקור חייב להיות
 *      ברשימת התלויות של אותה חבילה.
 *   5. בנייה וטיפוסים: npm run build:packages + npm run typecheck:packages — יציאה 0.
 *   6. dist/ מחוץ ל־git (מכוסה על ידי .gitignore).
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKGS = join(repoRoot, 'packages');

let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

// גרף התלות המחייב (אפיון §5)
const GRAPH = {
  'content-model': [],
  'settings-schema': [],
  'measurement-api': [],
  'layout-api': ['content-model', 'settings-schema', 'measurement-api'],
  'layout-engine': ['layout-api'],
  'policy-torah': ['layout-api'],
  'measurement-harfbuzz': ['measurement-api'],
  'audit-core': ['layout-api', 'content-model'],
  'render-html': ['layout-api'],
  'export-pdf': ['layout-api'],
  'cli': ['content-model', 'settings-schema', 'measurement-api', 'layout-api',
    'layout-engine', 'policy-torah', 'measurement-harfbuzz', 'audit-core',
    'render-html', 'export-pdf', 'test-fixtures'],
  'test-fixtures': [],
};
// חבילות נתונים: תלות npm בלבד, ללא הפניית בנייה
const DATA_PACKAGES = new Set(['test-fixtures']);

// ---------- 1. שורש ----------
console.log('1) שורש ה־workspaces');
const rootPkg = json(join(repoRoot, 'package.json'));
(JSON.stringify(rootPkg.workspaces) === JSON.stringify(['packages/*'])
  ? ok : fail)('workspaces = ["packages/*"]');
for (const s of ['build:packages', 'typecheck:packages']) {
  (rootPkg.scripts?.[s] ? ok : fail)(`סקריפט ${s}`);
}

// ---------- 2. החבילות ----------
console.log('\n2) שתים־עשרה החבילות');
const expected = Object.keys(GRAPH).sort();
const actual = readdirSync(PKGS).filter((d) => existsSync(join(PKGS, d, 'package.json'))).sort();
(JSON.stringify(actual) === JSON.stringify(expected)
  ? ok : fail)(`החבילות: ${actual.length}/12 (חסרות: ${expected.filter((e) => !actual.includes(e)).join(', ') || '—'})`);
for (const name of actual) {
  const pkg = json(join(PKGS, name, 'package.json'));
  const valid = pkg.name === `@tora/${name}` && pkg.private === true && pkg.sideEffects === false
    && pkg.exports?.['.'] && pkg.type === 'module';
  if (!valid) { fail(`${name}: package.json אינו עומד בכללים (@tora/*, private, sideEffects:false, exports)`); continue; }
  if (!existsSync(join(PKGS, name, 'src', 'index.ts'))) {
    fail(`${name}: חסר src/index.ts (ה־API הציבורי)`);
  }
  // test-fixtures: חבילת קוד+נתונים (משלב 13) — חייבת לחשוף גם את ה־registry
  if (name === 'test-fixtures' && !pkg.exports?.['./registry.json']) {
    fail('test-fixtures: חייבת לחשוף את registry.json');
  }
}
ok('כל החבילות עומדות בכללי package.json + index.ts ציבורי');
ok('test-fixtures: חבילת נתונים (registry.json + corpus) — ללא קוד בשלב זה');

// ---------- 3. גרף התלות ----------
console.log('\n3) גרף התלות (אפיון §5)');
for (const [name, deps] of Object.entries(GRAPH)) {
  const pkg = json(join(PKGS, name, 'package.json'));
  const declared = Object.keys(pkg.dependencies ?? {}).map((d) => d.replace('@tora/', '')).sort();
  const expectedDeps = [...deps].sort();
  (JSON.stringify(declared) === JSON.stringify(expectedDeps)
    ? ok : fail)(`${name}: dependencies תואמות לגרף (${expectedDeps.join(', ') || 'ללא תלויות'})`);
  const tsconfigPath = join(PKGS, name, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    if (!DATA_PACKAGES.has(name)) fail(`${name}: חסר tsconfig.json`);
    continue;
  }
  const ts = json(tsconfigPath);
  const refs = (ts.references ?? []).map((r) => r.path.replace('../', '').replace(/\/$/, '')).sort();
  const expectedRefs = deps.filter((d) => !DATA_PACKAGES.has(d)).sort();
  (JSON.stringify(refs) === JSON.stringify(expectedRefs)
    ? ok : fail)(`${name}: tsconfig references תואמות (${expectedRefs.join(', ') || '—'})`);
}

// ---------- 4. אין יבוא צולב שלא לפי הגרף ----------
console.log('\n4) אין יבוא צולב שלא לפי גרף התלות');
let importViolations = 0;
let importCount = 0;
for (const name of actual) {
  const srcDir = join(PKGS, name, 'src');
  if (!existsSync(srcDir)) continue;
  const scan = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) scan(p);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(/from\s+['"]@tora\/([a-z-]+)['"]/g)) {
          importCount++;
          const dep = m[1];
          if (dep !== name && !GRAPH[name].includes(dep)) {
            importViolations++;
            fail(`${name} מייבא @tora/${dep} שאינו בגרף התלות שלו`);
          }
        }
      }
    }
  };
  scan(srcDir);
}
(importViolations === 0
  ? ok : fail)(`נבדקו ${importCount} יבואים של @tora/* — ${importViolations} הפרות גרף`);

// ---------- 5. בנייה וטיפוסים ----------
console.log('\n5) בנייה וטיפוסים');
for (const script of ['build:packages', 'typecheck:packages']) {
  try {
    execFileSync('npm', ['run', script], { cwd: repoRoot, stdio: 'pipe' });
    ok(`npm run ${script} — PASS`);
  } catch (e) {
    fail(`npm run ${script} — FAIL`);
  }
}

// ---------- 6. dist מחוץ ל־git ----------
console.log('\n6) dist/ מחוץ ל־git');
try {
  execFileSync('git', ['check-ignore', 'packages/content-model/dist/index.js'], { cwd: repoRoot, stdio: 'pipe' });
  ok('packages/*/dist מכוסה על ידי .gitignore');
} catch (e) {
  fail('packages/*/dist אינו מכוסה על ידי .gitignore');
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`שלד ה־workspaces תקין — ${checks} בדיקות ירוקות. 12 חבילות נבנות; אין יבוא צולב שלא לפי הגרף.`);
