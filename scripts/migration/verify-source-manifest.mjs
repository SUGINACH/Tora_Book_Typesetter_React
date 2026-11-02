#!/usr/bin/env node
/**
 * verify-source-manifest — אימות מפת המקורות הנעולה וסביבת הריצה.
 * תכנית 100 השלבים — שלב 1 (אסמכתא: אפיון §2, §18-M0).
 *
 * בדיקות:
 *   1. מבנה המניפסט: 7 מקורות, שדות חובה, SHA באורך 40 תווי hex, ייחודיות repo/commit.
 *   2. קיום ונגישות כל SHA:
 *        - מראה מקומית: TORA_LEGACY_MIRRORS או <repo>/../legacy — תיקייה לפי id, HEAD חייב להתאים.
 *        - מקור "React": קיום הקומיט בהיסטוריית הריפו עצמו (git cat-file).
 *        - אחרת: GitHub API (GITHUB_TOKEN / GH_TOKEN) — status 200.
 *   3. .nvmrc קיים, תואם למניפסט, וגם engines.node ב-package.json מקבל את אותה גרסה.
 *   4. package-lock.json קיים; גרסת @playwright/test הנעולה בו תואמת למניפסט.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל (רשימת הכשלים מודפסת).
 * תלויות: אפס (Node 22 בלבד, אין חבילות חיצוניות).
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = join(repoRoot, 'docs', 'migration', 'source-manifest.json');

const failures = [];
const notes = [];
const ok = (label) => `  [OK]   ${label}`;
const fail = (label) => {
  failures.push(label);
  return `  [FAIL] ${label}`;
};

function git(args, cwd, { mayFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  } catch (e) {
    if (mayFail) return null;
    throw e;
  }
}

// ---------- 1. מבנה המניפסט ----------
console.log('1) מבנה המניפסט');
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(fail(`קריאת ${manifestPath}: ${e.message}`));
  process.exit(1);
}
const requiredTop = ['schemaVersion', 'sources', 'environment', 'baselinePolicy'];
for (const key of requiredTop) {
  console.log(key in manifest ? ok(`שדה עליון: ${key}`) : fail(`חסר שדה עליון: ${key}`));
}
console.log(
  manifest.schemaVersion === 1 ? ok('schemaVersion = 1') : fail(`schemaVersion לא נתמך: ${manifest.schemaVersion}`)
);

const sources = manifest.sources ?? [];
console.log(
  sources.length === 7 ? ok(`מספר המקורות: 7`) : fail(`מספר המקורות: ${sources.length} (צפוי 7)`)
);
const seenIds = new Set();
const seenRepos = new Set();
const seenCommits = new Set();
const HEX40 = /^[0-9a-f]{40}$/;
for (const s of sources) {
  const label = `${s.id ?? '(בלי id)'} (${s.repo ?? '?'})`;
  for (const field of ['id', 'repo', 'commit', 'commitDate', 'role', 'usage']) {
    if (!s[field] || typeof s[field] !== 'string' || s[field].length === 0) {
      console.log(fail(`${label}: חסר/ריק השדה ${field}`));
    }
  }
  if (!HEX40.test(s.commit ?? '')) console.log(fail(`${label}: commit אינו SHA באורך 40 hex`));
  if (seenIds.has(s.id)) console.log(fail(`id כפול: ${s.id}`));
  if (seenRepos.has(s.repo)) console.log(fail(`repo כפול: ${s.repo}`));
  if (seenCommits.has(s.commit)) console.log(fail(`commit כפול: ${s.commit}`));
  seenIds.add(s.id); seenRepos.add(s.repo); seenCommits.add(s.commit);
}
if (failures.length === 0) console.log(ok('שדות חובה, ייחודיות ותבנית SHA — תקינים'));

// ---------- 2. קיום ונגישות ה־SHA ----------
console.log('\n2) קיום ונגישות ה־SHA');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
const mirrorsRoot = process.env.TORA_LEGACY_MIRRORS || join(repoRoot, '..', 'legacy');

async function checkApi(repo, sha) {
  if (!token) return { ok: false, how: 'API', reason: 'אין GITHUB_TOKEN/GH_TOKEN ואין מראה מקומית' };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    return { ok: res.status === 200, how: 'API', reason: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, how: 'API', reason: e.message };
  }
}

for (const s of sources) {
  const mirrorDir = join(mirrorsRoot, s.id);
  let result = null;
  if (s.id === 'React') {
    // הריפו עצמו — קיום הקומיט בהיסטוריה המקומית
    const exists = git(['cat-file', '-e', `${s.commit}^{commit}`], repoRoot, { mayFail: true }) !== null;
    result = exists
      ? { ok: true, how: 'היסטוריה מקומית של הריפו' }
      : await checkApi(s.repo, s.commit);
  } else if (existsSync(mirrorDir) && statSync(mirrorDir).isDirectory()) {
    const head = git(['rev-parse', 'HEAD'], mirrorDir, { mayFail: true });
    if (head === s.commit) {
      result = { ok: true, how: `מראה מקומית ${mirrorDir}` };
    } else if (head === null) {
      result = await checkApi(s.repo, s.commit);
    } else {
      result = { ok: false, how: 'מראה מקומית', reason: `HEAD ${head.slice(0, 8)} ≠ ${s.commit.slice(0, 8)}` };
    }
  } else {
    result = await checkApi(s.repo, s.commit);
  }
  console.log(
    result.ok
      ? ok(`${s.id} @ ${s.commit.slice(0, 8)} — נגיש (${result.how})`)
      : fail(`${s.id} @ ${s.commit.slice(0, 8)} — ${result.reason ?? 'לא נגיש'}`)
  );
  if (!result.ok && result.how === 'API' && !token) {
    notes.push(`אין אפשרות לאמת את ${s.id} ללא מראה מקומית או טוקן; הגדר TORA_LEGACY_MIRRORS או GITHUB_TOKEN.`);
  }
}

// ---------- 3. נעילת גרסת Node ----------
console.log('\n3) נעילת גרסת Node');
const nvmrcPath = join(repoRoot, '.nvmrc');
const nvmrc = existsSync(nvmrcPath) ? readFileSync(nvmrcPath, 'utf8').trim() : null;
console.log(nvmrc !== null ? ok(`.nvmrc = ${nvmrc}`) : fail('חסר .nvmrc'));
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const enginesNode = pkg?.engines?.node ?? null;
console.log(enginesNode !== null ? ok(`engines.node = ${enginesNode}`) : fail('חסר engines.node ב-package.json'));
const manifestNode = manifest?.environment?.node?.nvmrc ?? null;
console.log(
  manifestNode !== null && manifestNode === nvmrc
    ? ok(`nvmrc במניפסט תואם ל-.nvmrc (${nvmrc})`)
    : fail(`nvmrc במניפסט (${manifestNode}) אינו תואם ל-.nvmrc (${nvmrc})`)
);
const enginesAccepts = (spec, major) => {
  const m = />=\s*(\d+)/.exec(spec ?? '');
  return m !== null && Number(m[1]) <= major;
};
console.log(
  enginesAccepts(enginesNode, Number(nvmrc))
    ? ok(`engines (${enginesNode}) מקבל Node ${nvmrc}`)
    : fail(`engines (${enginesNode}) אינו מקבל Node ${nvmrc}`)
);

// ---------- 4. lockfile ו-Playwright ----------
console.log('\n4) lockfile וגרסת Playwright');
const lockPath = join(repoRoot, 'package-lock.json');
console.log(existsSync(lockPath) ? ok('package-lock.json קיים') : fail('חסר package-lock.json'));
let lock = null;
try {
  lock = JSON.parse(readFileSync(lockPath, 'utf8'));
} catch (e) {
  console.log(fail(`קריאת package-lock.json: ${e.message}`));
}
if (lock) {
  const lockedPw = lock?.packages?.['node_modules/@playwright/test']?.version ?? null;
  const manifestPw = manifest?.environment?.playwright?.version ?? null;
  console.log(
    lockedPw !== null ? ok(`@playwright/test נעול ב-lockfile: ${lockedPw}`) : fail('אין @playwright/test ב-lockfile')
  );
  console.log(
    lockedPw !== null && lockedPw === manifestPw
      ? ok(`גרסת Playwright במניפסט תואמת ל-lockfile (${manifestPw})`)
      : fail(`גרסת Playwright במניפסט (${manifestPw}) אינה תואמת ל-lockfile (${lockedPw})`)
  );
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
for (const n of notes) console.log(`הערה: ${n}`);
if (failures.length > 0) {
  console.error(`נכשל: ${failures.length} בעיות`);
  for (const f of failures) console.error(`  - ${f.slice(8)}`);
  process.exit(1);
}
console.log('source-manifest תקין ומאומת — כל הבדיקות ירוקות.');
