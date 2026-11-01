#!/usr/bin/env node
/**
 * verify-uax14 — אימות שלב 27: הזדמנויות שבירה לפי UAX #14 עם hooks מדיניות.
 * אסמכתא: אפיון §6.4, §8.1 · תכנית שלב 27 · UAX #14 revision 53 (Unicode 16.0.0).
 *
 * בדיקות:
 *   1. נעילת הגרסה: UAX14_UNICODE_VERSION/REVISION; חמשת קובצי המקור על הדיסק
 *      תואמים ל־UAX14_SOURCE_SHA256 שבטבלאות המיוצרות; המחולל דטרמיניסטי
 *      (ריצה כפולה ⇐ אותו hash קובץ).
 *   2. Conformance מלא: כל 16,672 המקרים של LineBreakTest.txt עוברים.
 *   3. וקטורי עברית: מקף (BA — UAX מתיר אחריו, hook אוסר), סוגריים
 *      (LB13/LB30), ניקוד (LB9), מילה ארוכה, RLM.
 *   4. מיפוי אטומים ו־hooks: כל breakpoint מקושר למזהה אטום; forbid/allow
 *      עם תיעוד; mandatory אינו ניתן לאיסור.
 *   5. הספק: lineOpportunities של harfbuzz משתמש ב־UAX (לא הזמני).
 *   6. רגרסיה: build, lint, deps, test:packages.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync as rf, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const api = await import('@tora/measurement-api');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
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
const sha256File = (p) => createHash('sha256').update(rf(p)).digest('hex');

// ─────────────────────────── 1. נעילת הגרסה ───────────────────────────
console.log('1) נעילת גרסה ומקורות');
{
  (api.UAX14_UNICODE_VERSION === '16.0.0' && api.UAX14_REVISION === 'revision 53'
    ? ok : fail)('Unicode 16.0.0 · UAX #14 revision 53 — נעול');
  const shaTable = api.UAX14_SOURCE_SHA256;
  const files = {
    LineBreak: 'LineBreak.txt',
    LineBreakTest: 'LineBreakTest.txt',
    EastAsianWidth: 'EastAsianWidth.txt',
    UnicodeData: 'UnicodeData.txt',
    emojiData: 'emoji-data.txt',
  };
  let shaOk = 0;
  for (const [key, name] of Object.entries(files)) {
    const p = join(repoRoot, 'packages', 'test-fixtures', 'unicode', name);
    if (existsSync(p) && sha256File(p) === shaTable[key]) shaOk += 1;
    else fail(`${name}: sha256 אינו תואם לנעילה`);
  }
  (shaOk === 5 ? ok : fail)(`חמשת קובצי המקור תואמים לנעילות (${shaOk}/5)`);

  // דטרמיניזם המחולל: ריצה כפולה ⇐ אותו hash
  const tablesPath = join(repoRoot, 'packages', 'measurement-api', 'src', 'uax14-tables.ts');
  const before = sha256File(tablesPath);
  run('node', ['scripts/migration/gen-uax14-tables.mjs']);
  const after = sha256File(tablesPath);
  (before === after ? ok : fail)('המחולל דטרמיניסטי — ריצה חוזרת מייצרת ביט-ביט את אותן טבלאות');
}

// ─────────────────────────── 2. Conformance מלא ───────────────────────────
console.log('\n2) Conformance — LineBreakTest.txt הרשמי');
{
  const content = rf(join(repoRoot, 'packages', 'test-fixtures', 'unicode', 'LineBreakTest.txt'), 'utf8');
  let total = 0;
  let pass = 0;
  for (const line of content.split('\n')) {
    const hash = line.indexOf('#');
    const body = (hash >= 0 ? line.slice(0, hash) : line).trim();
    if (!body) continue;
    const ops = [];
    const cps = [];
    for (const t of body.split(/\s+/)) {
      if (t === '×' || t === '÷') ops.push(t);
      else cps.push(Number.parseInt(t, 16));
    }
    total += 1;
    const decisions = api.uax14Decisions(String.fromCodePoint(...cps));
    const byPos = new Map(decisions.map((d) => [d.position, d]));
    let good = true;
    for (let i = 1; i < cps.length; i++) {
      const expected = ops[i];
      const d = byPos.get(i);
      const actual = d === undefined ? '×' : d.kind === 'none' ? '×' : '÷';
      if (actual !== expected) { good = false; break; }
    }
    if (good) pass += 1;
  }
  (pass === total && total > 16000 ? ok : fail)(`conformance: ${pass}/${total} מקרים (100%)`);
}

// ─────────────────────────── 3. וקטורי עברית ───────────────────────────
console.log('\n3) וקטורי עברית');
{
  const atom = (i, text) => ({
    id: `atom:v1|doc|body|${i}+${i + text.length}||0`, text,
    script: 'hebrew', bidiLevel: 1, breakBefore: i === 0 ? 'forbidden' : 'allowed',
  });
  const atomsOf = (text) => [...text].map((ch, i) => atom(i, ch));

  (api.lineBreakClass(0x05be) === 'BA' ? ok : fail)('מקף עברי (U+05BE) — מחלקה BA');
  const maqaf = api.uax14Decisions('אָבוֹת־הָעוֹלָם');
  (maqaf.find((d) => d.position === 6)?.kind === 'none'
    ? ok : fail)('אין שבירה לפני מקף (LB21: × BA)');
  (maqaf.find((d) => d.position === 7)?.kind === 'opportunity'
    ? ok : fail)('UAX ברירת מחדל מתיר אחרי מקף (LB31) — והמדיניות תאסור (hook)');

  const hooks = { forbid: (ctx) => ctx.atoms[ctx.atomIndex - 1].text === '\u05be' };
  const withHook = api.computeBreakOpportunities(atomsOf('אָבוֹת־הָעוֹלָם'), hooks);
  const rec = withHook.find((o) => o.atomIndex === 7);
  (rec?.kind === 'none' && rec?.rule === 'hook:forbid(LB31)'
    ? ok : fail)('hook מדיניות אוסר שבירה אחרי מקף — עם תיעוד מלא');

  (api.uax14Decisions('בְּרֵאשִׁית').every((d) => d.kind === 'none')
    ? ok : fail)('ניקוד וטעמים — אין שבירה בתוך צרור (LB9)');
  (api.lineBreakClass(0x200f) === 'CM' && api.uax14Decisions('א\u200fב').every((d) => d.kind === 'none')
    ? ok : fail)('RLM — CM, נבלע בבסיס');
  const parens = api.uax14Decisions('אב(גד)הו');
  (parens.find((d) => d.position === 2)?.kind === 'none' && parens.find((d) => d.position === 6)?.kind === 'none'
    ? ok : fail)('סוגריים: אין שבירה בין אות לסוגר (LB30/LB13)');
  (api.uax14Decisions('א'.repeat(200)).every((d) => d.kind === 'none')
    ? ok : fail)('מילה ארוכה — אין אף הזדמנות בתוכה');

  // שער השלב: כל breakpoint מקושר למזהה אטום
  const atoms = atomsOf('טקסט ארוך לבדיקה');
  const opps = api.computeBreakOpportunities(atoms);
  const allLinked = opps.every((o) => o.atomId === atoms[o.atomIndex].id && o.atomIndex > 0);
  (allLinked && opps.length > 0 ? ok : fail)(`כל ${opps.length} הנקודות מקושרות למזהה אטום (שער השלב)`);

  // mandatory אינו ניתן לאיסור
  const forced = api.computeBreakOpportunities(atomsOf('אב\nגד'), { forbid: () => true });
  (forced.find((o) => o.atomIndex === 3)?.kind === 'mandatory'
    ? ok : fail)('שבירת חובה (LB5) אינה ניתנת לאיסור ב־hook');
}

// ─────────────────────────── 4. הספק משתמש ב־UAX ───────────────────────────
console.log('\n4) הספק harfbuzz — lineOpportunities מבוסס UAX');
{
  const providerSrc = rf(join(repoRoot, 'packages', 'measurement-harfbuzz', 'src', 'provider.ts'), 'utf8');
  (providerSrc.includes('computeBreakOpportunities') && !providerSrc.includes('מימוש זמני')
    ? ok : fail)('הספק קורא computeBreakOpportunities — המימוש הזמני הוסר');

  const { createHarfbuzzProvider } = await import('@tora/measurement-harfbuzz');
  const hb = await import('harfbuzzjs');
  const wawoff2 = (await import('wawoff2')).default;
  const createRequire = (await import('node:module')).createRequire;
  const require = createRequire(import.meta.url);
  const manifest = api.assertFontManifest(
    JSON.parse(rf(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8')));
  const guttman = manifest.find((f) => f.file === 'Guttman-Rashi-Normal.woff2');
  const fonts = await api.loadFontSet(manifest, [guttman.fontId], async (rec) =>
    new Uint8Array(rf(join(repoRoot, 'assets', 'fonts', rec.file))));
  const provider = await createHarfbuzzProvider({
    hb, wasmBytes: new Uint8Array(rf(require.resolve('harfbuzzjs/dist/harfbuzz.wasm'))),
    woff2DecoderBytes: new Uint8Array(rf(require.resolve('wawoff2/build/decompress_binding.js'))),
    decompressWoff2: (b) => wawoff2.decompress(b),
    fonts: [...fonts.values()],
  });
  const atom = (i, text) => ({
    id: `atom:v1|doc|body|${i}+${i + text.length}||0`, text,
    script: 'hebrew', bidiLevel: 1, breakBefore: i === 0 ? 'forbidden' : 'allowed',
  });
  // 'אבג אדה': ההזדמנות היחידה אחרי הרווח — index 4 (בעוד המימוש הזמני הישן
  // החזיר לפי breakBefore שדה-האטום: [2,3])
  const result = provider.lineOpportunities([...'אבג אדה'].map((ch, i) => atom(i, ch)));
  (JSON.stringify(result) === '[4]' ? ok : fail)(`lineOpportunities מחזיר [4] לפי UAX (התקבל ${JSON.stringify(result)})`);
}

// ─────────────────────────── 5. רגרסיה ───────────────────────────
console.log('\n5) רגרסיה');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי');
  const tests = run('npm', ['run', 'test:packages']);
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m && Number(m[1]) >= 455 ? ok : fail)(`test:packages — ${m ? m[1] : 'נכשל'} עוברות (440 + 15 UAX#14)`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`UAX #14 תקין — ${checks} בדיקות ירוקות. Conformance 100% (16,672 מקרים); כל breakpoint מקושר למקור; hooks מדיניות עם תיעוד.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
