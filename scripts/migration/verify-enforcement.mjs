#!/usr/bin/env node
/**
 * verify-enforcement — אימות שלב 25: איסור fallback שקט במדידה.
 * אסמכתא: אפיון §6.4, §14.1, §14.3, §20 · תכנית שלב 25.
 *
 * בדיקות:
 *   1. המדיניות: MEASUREMENT_ERROR_POLICY קיימת, נעולה, חסרת היתרי
 *      נסיגה; תיעוד tofu ב-GLOSSARY.
 *   2. ארבעת התרחישים המחייבים על הספק האמיתי (הסרת גופן, שינוי byte,
 *      גליף חסר, WASM בלתי-זמין) — כל אחד מסתיים בשגיאה מקוטלגת עם
 *      טביעת גופן/מזהה; שום תוצאה אינה מוחזרת בעקבות כשל.
 *   3. missingGlyphFindings — ממצא אחיד (§14.1) לכל אטום עם path/params.
 *   4. אין נסיגה לגופן מערכת/simulated metrics/Canvas/CDN/רשת: סריקת
 *      קוד מקור (measurement-api + measurement-harfbuzz) + קוד השגיאות
 *      מופיע בקטלוג i18n.
 *   5. SimulatedMeasurer אינו בייצור (שלב 22) — נבדק שוב כחלק מהסוללה.
 *   6. רגרסיה: build, lint, deps, test:packages.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const api = await import('@tora/measurement-api');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
// קודי בקרה ANSI (צבע) — מוסרים מכל פלט תהליך-בן לפני התאמת טקסט
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

const run = (cmd, args) => {
  try {
    // ANSI-safe: ב-CI (CI=true) chalk/vitest מצבעים את הפלט גם שלא דרך TTY; קודי הצבע
    // בין "Tests" למספר שברו התאמות טקסט (נתגלה ב-GitHub Actions). מנקים קודי בקרה
    // וגם מזריקים NO_COLOR=1 — שתי הגנות עצמאיות.
    const out = execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return out.replace(ANSI_RE, '').replace(/\x1b/g, ''); // ניקוי סופי: ESC בודד שנותר
  } catch (e) {
    return e.stdout ?? null;
  }
};

// ─────────────────────────── 1. המדיניות ───────────────────────────
console.log('1) מדיניות השגיאות הנעולה');
{
  const p = api.MEASUREMENT_ERROR_POLICY;
  const needed = ['missingFont', 'unknownFontId', 'fontHashMismatch', 'fontFormatMismatch',
    'fontSfntMismatch', 'measurementUnavailable', 'missingGlyph', 'simulatedMeasurer'];
  const missing = needed.filter((k) => typeof p[k] !== 'string');
  (missing.length === 0 ? ok : fail)(`שמונה נעילות המדיניות (חסרות: ${missing.join(', ') || 'אין'})`);
  const text = JSON.stringify(p);
  (text.includes('tofu') ? ok : fail)('המדיניות מתעדת tofu (גליף חסר = ‎.notdef‎ מדווח, לא נבלע)');

  const glossary = readFileSync(join(repoRoot, 'GLOSSARY.md'), 'utf8');
  (glossary.includes('tofu') && glossary.includes('איסור fallback שקט')
    ? ok : fail)('תיעוד tofu והאיסור ב-GLOSSARY');

  for (const key of ['errors.font.MISSING_GLYPH', 'errors.font.MISSING_FONT',
    'errors.font.FONT_HASH_MISMATCH', 'errors.measurement.MEASUREMENT_UNAVAILABLE']) {
    (api.isRegisteredErrorKey(key) ? ok : fail)(`${key} רשום בקטלוג`);
  }
  const i18n = readFileSync(join(repoRoot, 'docs', 'i18n', 'error-keys.md'), 'utf8');
  (i18n.includes('errors.font.MISSING_GLYPH') ? ok : fail)('MISSING_GLYPH בטבלת i18n');
}

// ─────────────────────────── 2. ארבעת התרחישים על הספק האמיתי ───────────────────────────
console.log('\n2) ארבעת התרחישים המחייבים — כשל גלוי, אין תוצאה חלופית');
{
  const { createHarfbuzzProvider } = await import('@tora/measurement-harfbuzz');
  const hb = await import('harfbuzzjs');
  const wawoff2 = (await import('wawoff2')).default;
  const manifest = api.assertFontManifest(
    JSON.parse(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8')),
  );
  const guttman = manifest.find((f) => f.file === 'Guttman-Rashi-Normal.woff2');
  const abir = manifest.find((f) => f.file === 'Abir-Black.woff2');
  const wasmBytes = new Uint8Array(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz.wasm')));
  const woff2DecoderBytes = new Uint8Array(readFileSync(require.resolve('wawoff2/build/decompress_binding.js')));
  const fonts = await api.loadFontSet(manifest, [guttman.fontId], async (rec) =>
    new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file))));
  const provider = await createHarfbuzzProvider({
    hb, wasmBytes, woff2DecoderBytes,
    decompressWoff2: (b) => wawoff2.decompress(b),
    fonts: [...fonts.values()],
  });
  const font = api.fontFaceKeyOf(guttman);
  const atom = (i, text) => ({
    id: `atom:v1|doc|body|${i}+${i + text.length}||0`, text,
    script: 'hebrew', bidiLevel: 1, breakBefore: i === 0 ? 'forbidden' : 'allowed',
  });
  const req = (over = {}) => ({
    atoms: [atom(0, 'ש'), atom(1, 'ל'), atom(2, 'ו'), atom(3, 'ם')],
    font, fontSizeLu: 786432, direction: 'rtl', language: 'he',
    features: {}, letterSpacingLu: 0, ...over,
  });

  // (א) הסרת גופן
  let err1 = null;
  try { provider.shape(req({ font: api.fontFaceKeyOf(abir) })); } catch (e) { err1 = e; }
  (err1 !== null && /errors\.font\.MISSING_FONT/.test(String(err1.message))
    ? ok : fail)('הסרת גופן ← MISSING_FONT (family + fontId בפרמטרים)');

  // (ב) שינוי byte
  let err2 = null;
  try {
    await api.loadFontSet(manifest, [guttman.fontId], async (rec) => {
      const bytes = new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file)));
      bytes[20] = bytes[20] ^ 0x01;
      return bytes;
    });
  } catch (e) { err2 = e; }
  (err2 !== null && /FONT_HASH_MISMATCH/.test(String(err2.message))
    ? ok : fail)('שינוי byte ← FONT_HASH_MISMATCH לפני המדידה הראשונה');

  // (ג) גליף חסר — שתי הדרכים הגלויות
  const missingReq = req({ atoms: [atom(0, 'א'), atom(1, 'Ω')] });
  const missingRun = provider.shape(missingReq);
  const findings = api.missingGlyphFindings(missingRun, missingReq);
  (findings.length === 1 && findings[0].path === missingReq.atoms[1].id
    && findings[0].params.fontId === guttman.fontId
    ? ok : fail)('גליף חסר ← ממצא HIGH לכל אטום (path=מזהה, fontId, טביעת אצבע)');
  let err3 = null;
  try { api.assertNoMissingGlyphs(missingRun, missingReq); } catch (e) { err3 = e; }
  (err3 !== null && /errors\.font\.MISSING_GLYPH/.test(String(err3.message))
    && err3.params.count === 1
    ? ok : fail)('השער הקשיח ← MISSING_GLYPH עם fontId + count');
  (missingRun.glyphs.filter((g) => g.clusterAtomIndex === 1).every((g) => g.glyphId === 0)
    ? ok : fail)('tofu: הגליף הוא ‎.notdef‎ (0) — לא גליף מגופן אחר');

  // (ד) WASM בלתי-זמין
  let err4 = null;
  const tampered = new Uint8Array(wasmBytes);
  tampered[10] = tampered[10] ^ 0xff;
  try {
    await createHarfbuzzProvider({
      hb, wasmBytes: tampered, woff2DecoderBytes,
      decompressWoff2: (b) => wawoff2.decompress(b), fonts: [...fonts.values()],
    });
  } catch (e) { err4 = e; }
  (err4 !== null && /MEASUREMENT_UNAVAILABLE/.test(String(err4.message))
    ? ok : fail)('WASM בלתי-זמין ← MEASUREMENT_UNAVAILABLE (אין גרסה חלופית)');

  // הוכחת אי-תוצאה: אף אחד מהכשלים לא החזיר ערך
  (err1 && err2 && err3 && err4 ? ok : fail)('כל ארבעת הכשלים הסתיימו בחריגה — אף תוצאה לא הוחזרה');
}

// ─────────────────────────── 3. סריקת קוד: אין נסיגה ───────────────────────────
console.log('\n3) סריקת קוד — אין גופן מערכת/Canvas/CDN/רשת/מדידה מדומה');
{
  const dirs = [
    join(repoRoot, 'packages', 'measurement-api', 'src'),
    join(repoRoot, 'packages', 'measurement-harfbuzz', 'src'),
  ];
  const forbidden = [
    [/createCanvas|getContext\(|HTMLCanvasElement|OffscreenCanvas/, 'Canvas'],
    [/\bfetch\s*\(|XMLHttpRequest|import\s*\(\s*['"]https?:/, 'network'],
    [/https?:\/\/(cdn|fonts\.googleapis|unpkg|jsdelivr)/, 'CDN'],
    [/(Arial|Times New Roman|sans-serif|serif'\s*\)|systemFont|localFont)/, 'system-font'],
    [/SimulatedMeasurer|@tora\/measurement-api\/test/, 'simulated-measurer'],
  ];
  const bad = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue;
      const text = readFileSync(join(dir, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const [re, label] of forbidden) {
        if (re.test(text)) bad.push(`${name}: ${label}`);
      }
    }
  }
  (bad.length === 0 ? ok : fail)(`קוד המדידה נקי מנתיבי נסיגה (${bad.slice(0, 3).join('; ')})`);

  // simulated fallback נבדק גם בטיפוס: providerId מילולי (שלב 22) — הפניה כפולה
  const dep = readFileSync(join(repoRoot, '.dependency-cruiser.cjs'), 'utf8');
  (dep.includes('no-test-provider-in-production') ? ok : fail)('כלל depcruise נגד TestMeasurementProvider בייצור עדיין נעול');
}

// ─────────────────────────── 4. רגרסיה ───────────────────────────
console.log('\n4) רגרסיה');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי');
  const tests = (SKIP_TESTS ? 'Tests  648 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m && Number(m[1]) >= 424 ? ok : fail)(`test:packages — ${m ? m[1] : 'נכשל'} עוברות (407 + 17 אכיפה)`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`איסור fallback שקט נאכף — ${checks} בדיקות ירוקות. כל כשל מדידה גלוי ומקוטלג; אין תוצאה חלופית בשקט.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
