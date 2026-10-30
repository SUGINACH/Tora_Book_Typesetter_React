#!/usr/bin/env node
/**
 * verify-property-tests — אימות מבחני ה-property (שלב 11 בתכנית 100 השלבים).
 * אסמכתא: אפיון §17.1 · תכנית 100 השלבים, שלב 11.
 *
 * בדיקות:
 *   1. fast-check מותקן ונעול ב־devDependencies.
 *   2. קבצי מבחני ה-property קיימים בשתי החבילות ומכסים את הנושאים המחייבים:
 *      עיגול יציב תחת כפילויות, גבולות safe integer, round-trip של canonical JSON,
 *      אי-תלות ה-hash בסדר keys, זהות cold/warm.
 *   3. הרצה מלאה של מבחני ה־unit+property ב־Node 22 — ירוק.
 *   4. חיווט CI: שכבת הבדיקות כוללת את test:packages.
 *   5. רגרסיה: build + typecheck + lint + deps.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };
const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, stdio: 'pipe' });
    return 0;
  } catch {
    return 1;
  }
};

// ---------- 1. fast-check ----------
console.log('1) fast-check מותקן ונעול');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
(!!pkg.devDependencies?.['fast-check'] ? ok : fail)('fast-check ב-devDependencies');
const lock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));
const fcLocked = lock.packages?.['node_modules/fast-check']?.version;
(fcLocked ? ok : fail)(`fast-check נעול ב-lockfile: ${fcLocked}`);

// ---------- 2. כיסוי הנושאים המחייבים ----------
console.log('\n2) קבצי מבחני ה-property וכיסויים');
const files = {
  'packages/measurement-api/test/units.property.test.ts': [
    'roundDiv(n·k, d·k)', 'safe integer', 'round-trip', 'מונוטוניות', 'makeCost',
  ],
  'packages/layout-api/test/canonical-hash.property.test.ts': [
    'אי-תלות בסדר הכנסת מפתחות', 'אידמפוטנטיות', 'layoutHash אינו תלוי', 'cold/warm', 'inputHash רגיש',
  ],
};
for (const [file, frags] of Object.entries(files)) {
  const abs = join(repoRoot, file);
  (existsSync(abs) ? ok : fail)(`${file} קיים`);
  if (existsSync(abs)) {
    const text = readFileSync(abs, 'utf8');
    for (const frag of frags) (text.includes(frag) ? ok : fail)(`מכסה: ${frag}`);
    (text.includes('numRuns') ? ok : fail)(`${file}: מספרי ריצות מפורשים (numRuns)`);
  }
}

// ---------- 3. הרצה מלאה ----------
console.log('\n3) הרצת unit + property ב־Node 22');
(run('npm', ['run', 'test:packages']) === 0 ? ok : fail)('npm run test:packages — PASS (unit + property)');

// ---------- 4. חיווט CI ----------
console.log('\n4) חיווט CI');
const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
(ci.includes('test:packages') ? ok : fail)('CI מריץ test:packages (שכבת Unit/Property)');

// ---------- 5. רגרסיה ----------
console.log('\n5) רגרסיה');
(run('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
(run('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages — PASS');
(run('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(run('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`מבחני ה־property תקינים — ${checks} בדיקות ירוקות. כל המבחנים ירוקים ב־Node 22.`);
