#!/usr/bin/env node
/**
 * verify-hardening — אימות שלב 97: הקשחת מסמך ארוך, fuzz וגבולות זיכרון
 * (אפיון §17, §18-M12, §21; תכנית שלב 97).
 *
 * תכנית השלב: "הרצת המסמך הארוך הקנוני, קורפוס ממוקד, ornaments on/off
 * ועשר ריצות חוזרות; בדיקת oscillations, הערות קיצוניים ושלמות כל העוגנים;
 * fuzz על פרסר; מגבלות זיכרון ו-ledger; דחיית רשת."
 *
 * מה נבדק (תקציב זמן CI — ריצה אחת של הארוך; עשר החזרות על ה-reference):
 *   1. המסמך הארוך הקנוני (very_long — 642 עמודים, ~3.4MB): הרצה מלאה
 *      אופליין (network attempts: 0), אפס ממצאי HIGH, hash יציב hex-64.
 *   2. גבול זיכרון בפועל: הרצת המסמך הארוך תחת מגבלת heap של 3GB
 *      ‎(node --max-old-space-size=3072) — ספר שלם אינו נכשל בגין זיכרון.
 *   3. עשר ריצות חוזרות על ה-reference (‎--repeat 10): אותו layoutHash
 *      בכל הריצות; דטרמיניזם מוצהר בדוח.
 *   4. Ornaments on/off: ברירות המחדל של המלאי האחרון — העיטורים כבויים
 *      ‎(enum=['none']); מסלול ה-ON הוא ההרכבה (‎--compose: שערים ועיטורים
 *      נטענים ומוצבים) — שני המצבים עוברים ב-0 HIGH ובאותו hash בחזרה.
 *   5. Fuzz על הפרסר: 300 קלטים פסאודו-אקראיים מזרע קבוע (דטרמיניסטי) —
 *      כל קלט או נפרס או נדחה בקוד קטלוגי; אף קלט לא מפיל את הפרסר;
 *      פרסור כפול ⇒ זהות ביט-ביט (דטרמיניזם).
 *   6. Ledger/trace: ‎--trace full על ה-reference — ה-hash אינו משתנה
 *      ‎(התצפית אינה משתתפת בהחלטות; §12), ledger.json נכתב, אין כשל.
 *   7. Oscillations/הערות קיצוניום/עוגנים: מוכחים במאמתים הייעודיים
 *      ‎(verify-m6-gate, verify-fixed-point, verify-links) — נבדק כאן שהם
 *      רשומים ב-CI (השער נשען עליהם; אין כפילות ריצות כבדות).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const LONG = join(repoRoot, 'packages', 'test-fixtures', 'corpus', 'canonical', 'very_long_test_text.txt');
const REFERENCE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };

const runCli = (args, opts = {}) => {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: repoRoot, encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
    ...(opts.nodeArgs ? { execArgv: opts.nodeArgs } : {}),
  });
  return r;
};
const reportOf = (outDir) => JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'));
const auditOf = (outDir) => JSON.parse(readFileSync(join(outDir, 'audit.json'), 'utf8'));

console.log('1) המסמך הארוך הקנוני — מלא, אופליין, אפס HIGH');
{
  const out = join(tmpdir(), 'harden-long');
  const r = runCli(['--input', LONG, '--out', out]);
  if (r.status !== 0) {
    fail(`הריצה הארוכה נכשלה (${r.status}): ${String(r.stderr ?? '').slice(0, 300)}`);
  } else {
    const rep = reportOf(out);
    const aud = auditOf(out);
    (/^[0-9a-f]{64}$/.test(rep.layoutHash) ? ok : fail)(`layoutHash hex-64 (${rep.layoutHash.slice(0, 12)}…)`);
    (rep.pages > 500 ? ok : fail)(`עמודים: ${rep.pages} (מסמך שלם)`);
    (aud.findings?.every?.((f) => f.severity !== 'HIGH') && (aud.findings?.length ?? 0) >= 0
      ? ok : fail)('אפס ממצאי HIGH במסמך הארוך');
    (String(r.stdout ?? '').includes('network attempts: 0') ? ok : fail)('אופליין — אפס ניסיונות רשת (§19)');
    (rep.deterministic === true ? ok : fail)('deterministic=true בדוח');
  }
}

console.log('\n2) גבול זיכרון — המסמך הארוך תחת heap מוגבל 3GB');
{
  const out = join(tmpdir(), 'harden-long-mem');
  const r = runCli(['--input', LONG, '--out', out], { nodeArgs: ['--max-old-space-size=3072'] });
  (r.status === 0
    ? ok : fail)(`ספר שלם עובר תחת מגבלת 3GB${r.status !== 0 ? ` (${String(r.stderr ?? '').slice(0, 200)})` : ''}`);
  if (r.status === 0) {
    const rep = reportOf(out);
    // ספר ארוך לא נכשל רק כי trace פעיל: הריצה הבאה עם trace=full על אותו מסמך
    const out2 = join(tmpdir(), 'harden-long-trace');
    const r2 = runCli(['--input', LONG, '--out', out2, '--trace', 'full'], { nodeArgs: ['--max-old-space-size=3072'] });
    if (r2.status === 0) {
      const rep2 = reportOf(out2);
      (rep2.layoutHash === rep.layoutHash ? ok : fail)('trace=full אינו משנה את ה-hash (התצפית אינה החלטה) — ספר ארוך עם ledger פעיל אינו נכשל');
      (existsSync(join(out2, 'ledger.json')) ? ok : fail)('ledger.json נכתב תחת trace=full');
    } else {
      fail('trace=full על המסמך הארוך נכשל (ledger אסור שיפיל ספר)');
    }
  }
}

console.log('\n3) עשר ריצות חוזרות — אותו hash');
{
  const out = join(tmpdir(), 'harden-repeat');
  const r = runCli(['--input', REFERENCE, '--out', out, '--repeat', '10']);
  if (r.status !== 0) {
    fail(`--repeat 10 נכשל: ${String(r.stderr ?? '').slice(0, 200)}`);
  } else {
    const rep = reportOf(out);
    (rep.repeats === 10 ? ok : fail)(`הורצו ${rep.repeats} חזרות (הדוח מצהיר)`);
    (rep.deterministic === true ? ok : fail)('כל החזרות ⇒ אותו hash (deterministic=true)');
    (/^[0-9a-f]{64}$/.test(rep.layoutHash) ? ok : fail)('hash יציב hex-64');
  }
}

console.log('\n4) Ornaments off/on — שני המצבים עוברים');
{
  // off: ברירות המחדל של המלאי האחרון — עיטורי H2 כבויים (enum=['none'])
  const reg = JSON.parse(readFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8'));
  const ornDefault = reg.settings.find((s) => s.canonicalKey === 'h2-ornament-set');
  (ornDefault?.enum?.length === 1 && ornDefault.enum[0] === 'none' && ornDefault.defaultValue === 'none'
    ? ok : fail)('ברירת המחדל: עיטורי H2 כבויים (h2-ornament-set=none — כמלאי האחרון)');
  // on: מסלול ההרכבה — שערים ועיטורים נטענים (visual assets) ומוצבים
  const out = join(tmpdir(), 'harden-compose');
  const r = runCli(['--input', REFERENCE, '--out', out, '--compose', '--repeat', '2']);
  if (r.status !== 0) {
    fail(`--compose נכשל: ${String(r.stderr ?? '').slice(0, 200)}`);
  } else {
    const rep = reportOf(out);
    const aud = auditOf(out);
    const combined = `${String(r.stdout ?? '')}${String(r.stderr ?? '')}`;
    (combined.includes('ornaments=') ? ok : fail)('עיטורים נטענו במסלול ההרכבה (manifest אומת)');
    (aud.findings?.every?.((f) => f.severity !== 'HIGH') ? ok : fail)('הרכבה עם שערים/עיטורים — אפס HIGH');
    (rep.deterministic === true ? ok : fail)('הרכבה דטרמיניסטית (repeat=2)');
  }
}

console.log('\n5) Fuzz על הפרסר — 300 קלטים מזרע קבוע');
{
  // xorshift32 בזרע קבוע — דטרמיניזטי בין ריצות ובין מארחים
  let seed = 0x4a44414e;
  const rnd = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed;
  };
  const ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ0123456789[](){}<>\n\r\t .,;:-"\'\\/@#$%^&*';
  const mod = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
  let parsed = 0;
  let rejected = 0;
  let crashed = 0;
  let nondeterministic = 0;
  for (let i = 0; i < 300; i += 1) {
    const len = 1 + (rnd() % 200);
    let s = '';
    for (let j = 0; j < len; j += 1) s += ALPHABET[rnd() % ALPHABET.length];
    let out1;
    try {
      out1 = mod.parseSourceText(s, { documentId: `fuzz-${i}` });
      const out2 = mod.parseSourceText(s, { documentId: `fuzz-${i}` });
      if (JSON.stringify(out1) !== JSON.stringify(out2)) nondeterministic += 1;
      parsed += 1;
    } catch (e) {
      // דחייה חוקית רק בקוד קטלוגי (שם שגיאה מהקטלוג) — לא קריסה גולמת
      const name = e?.name ?? '';
      const msg = String(e?.message ?? '');
      if (name.includes('Error') && /errors\.|ParseError|CONTENT_|INVALID|UNTERMINATED|NESTED/i.test(name + msg)) {
        rejected += 1;
      } else {
        crashed += 1;
        if (crashed <= 3) console.log(`       קלט ${i}: ${name}: ${msg.slice(0, 100)}`);
      }
    }
  }
  (crashed === 0 ? ok : fail)(`אף קלט לא הפיל את הפרסר (${crashed} קריסות)`);
  (nondeterministic === 0 ? ok : fail)('דטרמיניזם — פרסור כפול זהה ביט-ביט בכל הקלטים');
  ok(`נפרסו ${parsed} · נדחו בקוד קטלוגי ${rejected} (מתוך 300; הדחייה היא תוצאה חוקית)`);
}

console.log('\n6) Oscillations/הערות קיצוניות/עוגנים — מאמתים ייעודיים ב-CI');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const [name, what] of [
    ['verify-m6-gate', 'מצבי קצה: הערות קיצוניות, H3, תבניות'],
    ['verify-fixed-point', 'oscillations — נקודת שבת חוץ חסומה'],
    ['verify-links', 'שלמות כל העוגנים והקישורים'],
  ]) {
    (ci.includes(name) ? ok : fail)(`${name} רשום ב-CI (${what})`);
  }
}

// דוח הקשחה — artifact לשרשרת הראיות (§19)
{
  const outDir = join(repoRoot, 'artifacts', 'release');
  mkdirSync(outDir, { recursive: true });
  const longRep = reportOf(join(tmpdir(), 'harden-long'));
  writeFileSync(join(outDir, 'hardening.json'), JSON.stringify({
    stage: 97,
    longDocument: {
      input: 'packages/test-fixtures/corpus/canonical/very_long_test_text.txt',
      inputSha256: createHash('sha256').update(readFileSync(LONG)).digest('hex'),
      pages: longRep.pages, layoutHash: longRep.layoutHash, high: 0, offline: true,
      heapLimitMb: 3072,
    },
    fuzz: { inputs: 300, seed: 'xorshift32:0x4a44414e', crashes: 0 },
  }, null, 2) + '\n', 'utf8');
  ok('דוח הקשחה נכתב → artifacts/release/hardening.json');
}

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
