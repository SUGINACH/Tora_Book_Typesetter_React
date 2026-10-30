#!/usr/bin/env node
/**
 * verify-units — אימות מודול היחידות ואכיפת ADR-001 (שלב 9 בתכנית 100 השלבים).
 * אסמכתא: אפיון §6.1, §22.1 · docs/adr/ADR-001-units.md
 *
 * בדיקות:
 *   1. ADR-001 קיים ומכסה: ההחלטה (1/65536), חלופות, השלכות, תנאי ביטול.
 *   2. ה־API הציבורי קיים ועובד בזמן ריצה (יבוא מה־dist הבנוי): roundDiv, mmToLu,
 *      fontUnitsToLu, ptToLu, safeAdd/Mul/Sub, makeCost, Rect, A4.
 *   3. ריכוז העיגול (ADR-001 §4): אין Math.round מחוץ ל־units.ts בקוד המקור של החבילות.
 *   4. איסור bitwise על קואורדינטות (ADR-001 §5): אין <<, >>, >>> בקוד המקור.
 *   5. אין px/mm בתוך אלגוריתם: אין pxPerMm / 3.7795 בקוד המקור של החבילות.
 *   6. בדיקות היחידה ירוקות: npm run test:packages (vitest).
 *   7. רגרסיה: build + typecheck + lint + deps ירוקים.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

// ---------- 1. ה־ADR ----------
console.log('1) מסמך ADR-001');
const adrPath = join(repoRoot, 'docs', 'adr', 'ADR-001-units.md');
(existsSync(adrPath) ? ok : fail)('docs/adr/ADR-001-units.md קיים');
if (existsSync(adrPath)) {
  const adr = readFileSync(adrPath, 'utf8');
  for (const frag of ['1/65536', 'roundDiv', 'חלופות', 'השלכות', 'תנאי ביטול', 'חצי-כלפי-∞', 'safeAdd']) {
    (adr.includes(frag) ? ok : fail)(`ADR מכסה: ${frag}`);
  }
}

// ---------- 2. ה־API בזמן ריצה ----------
console.log('\n2) ה־API הציבורי (מה־dist הבנוי)');
const units = await import('@tora/measurement-api');
const REQUIRED_API = ['roundDiv', 'mmToLu', 'fontUnitsToLu', 'ptToLu', 'luToPt',
  'safeAdd', 'safeSub', 'safeMul', 'makeCost', 'costToNumber', 'asLu', 'asFontUnit',
  'rectRight', 'rectBottom', 'A4', 'UnitsError', 'LU_PER_PT', 'COST_SCALE'];
for (const name of REQUIRED_API) {
  (name in units ? ok : fail)(`ייצוא: ${name}`);
}
// בדיקות ערכים מחייבות מה־ADR
(units.roundDiv(-5, 2) === -2 ? ok : fail)('roundDiv(-5,2) = -2 (חצי-כלפי-∞ לשליליים)');
(units.roundDiv(-1, 2) === 0 ? ok : fail)('roundDiv(-1,2) = 0');
(units.fontUnitsToLu(2048, 2048) === 65536 ? ok : fail)('fontUnitsToLu(2048, 2048) = 65536');
(units.luToPt(units.A4.width) > 595.27 && units.luToPt(units.A4.width) < 595.29
  ? ok : fail)('A4.width ≈ 595.27..595.29pt (210mm)');
try {
  units.safeAdd(Number.MAX_SAFE_INTEGER, 1, 'probe');
  fail('safeAdd היה צריך לזרוק על גלישה');
} catch (e) {
  (e?.name === 'UnitsError' ? ok : fail)('safeAdd זורק UnitsError על גלישה');
}

// ---------- 3–5. סריקות קוד-מקור ----------
console.log('\n3) ריכוז העיגול ואיסורים בקוד המקור של החבילות');
const srcFiles = [];
const scan = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.ts')) srcFiles.push(p);
  }
};
scan(join(repoRoot, 'packages'));
const roundOutside = [];
const bitwiseOutside = [];
const pxPerMm = [];
for (const f of srcFiles) {
  const rel = f.slice(repoRoot.length + 1);
  // קוד-מקור בלבד: src/ (לא dist, לא test); units.ts עצמו פטור — בו מרוכז העיגול ומתועדים האיסורים
  if (!rel.includes('/src/') || rel === 'packages/measurement-api/src/units.ts') continue;
  const text = readFileSync(f, 'utf8');
  if (/\bMath\.round\b/.test(text)) roundOutside.push(rel);
  if (/(<<|>>>|>>)/.test(text)) bitwiseOutside.push(rel);
  if (/pxPerMm|3\.7795/.test(text)) pxPerMm.push(rel);
}
(roundOutside.length === 0
  ? ok : fail)(`Math.round מחוץ ל־units.ts: ${roundOutside.length} קבצים${roundOutside.length ? ' — ' + roundOutside.join(', ') : ''}`);
(bitwiseOutside.length === 0
  ? ok : fail)(`פעולות הזזת סיביות (<<, >>, >>>): ${bitwiseOutside.length} קבצים${bitwiseOutside.length ? ' — ' + bitwiseOutside.join(', ') : ''}`);
(pxPerMm.length === 0
  ? ok : fail)(`pxPerMm / 3.7795 אסורים: ${pxPerMm.length} קבצים`);

// ---------- 6. בדיקות יחידה ----------
console.log('\n6) בדיקות יחידה (vitest)');
(run('npm', ['run', 'test:packages']) === 0 ? ok : fail)('npm run test:packages — PASS');

// ---------- 7. רגרסיה ----------
console.log('\n7) רגרסיה: build + typecheck + lint + deps');
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
console.log(`מודול היחידות תקין — ${checks} בדיקות ירוקות. המרות יציבות ומדויקות; אין px/mm בתוך אלגוריתם.`);
