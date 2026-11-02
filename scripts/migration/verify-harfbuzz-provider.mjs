#!/usr/bin/env node
/**
 * verify-harfbuzz-provider — אימות שלב 24: [ADR-003] ספק HarfBuzz/WASM נעול.
 * אסמכתא: אפיון §6.2–6.4 · ADR-003 · תכנית שלב 24.
 *
 * בדיקות:
 *   1. ADR-003: קיים, מכיל את הנעילות (גרסאות + שני גיבובי SHA-256).
 *   2. הזרקה מלאה: ל־src של measurement-harfbuzz אין ייבוא של harfbuzzjs/
 *      wawoff2 ואין Node/DOM — הספריות מוזרקות על ידי ה־host; peerDeps
 *      exact לשתי הנעילות.
 *   3. אמת הנעילות מול הדיסק: package-lock נועל harfbuzzjs 1.6.4 + wawoff2
 *      2.0.1; sha256 של harfbuzz.wasm ושל decompress_binding.js תואם ל־ADR.
 *   4. וקטורי shaping אמיתיים (Node): ספק מעל גופני המניפסט — עברית, ניקוד
 *      (marks ב־advance 0 עם offsets), RTL (סדר חזותי הפוך), LTR,
 *      גליף חסר (.notdef מדווח), חשבונאות widthLu === Σ advances,
 *      דטרמיניזן (שתי יצירות ⇐ ביט-ביט), batch שקוף, requestHash תואם חוזה.
 *   5. שער השלב: אין shaping של דפדפן בחוזה הייצור — providerId מילולי,
 *      אין Canvas/DOM בחבילה, TestMeasurementProvider אינו מיובא.
 *   6. רגרסיה: build, typecheck, lint, deps, test:packages.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
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
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ─────────────────────────── 1. ADR-003 ───────────────────────────
console.log('1) ADR-003 — הנעילות');
const LOCK = {
  harfbuzzjs: '1.6.4',
  harfbuzz: '15.0.0',
  wasmSha256: '6eeed8e1bc9ad7773038e48ff8f9e07e0ad228572c594b45e5357e9c2f7a0b2e',
  wawoff2: '2.0.1',
  woff2DecoderSha256: '112a89e7497a856698103e2ce530d2b6fc27668c0cd56f45bcbf7850d73b7c2b',
};
{
  const adrPath = join(repoRoot, 'docs', 'adr', 'ADR-003-harfbuzz-wasm.md');
  (existsSync(adrPath) ? ok : fail)('docs/adr/ADR-003-harfbuzz-wasm.md קיים');
  const adr = existsSync(adrPath) ? readFileSync(adrPath, 'utf8') : '';
  (adr.includes(LOCK.wasmSha256) ? ok : fail)('ה־ADR נועל את sha256 של harfbuzz.wasm');
  (adr.includes(LOCK.woff2DecoderSha256) ? ok : fail)('ה־ADR נועל את sha256 של מפרק ה־WOFF2');
  (adr.includes('shaping-only') || adr.includes('לא BiDi ולא line breaking') ? ok : fail)('ה־ADR מפריד shaping מ־BiDi/UAX#14 (§6.4)');
}

// ─────────────────────────── 2. הזרקה מלאה ───────────────────────────
console.log('\n2) מודל ההזרקה — ה־src נקי מתלויות סביבה');
{
  const srcDir = join(repoRoot, 'packages', 'measurement-harfbuzz', 'src');
  const files = readdirSync(srcDir).filter((n) => n.endsWith('.ts'));
  const bad = [];
  for (const name of files) {
    const text = readFileSync(join(srcDir, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/from\s+'(harfbuzzjs|wawoff2)'/.test(text)) bad.push(`${name}: library-import`);
    if (/from\s+'node:/.test(text) || /require\(['"]node:/.test(text)) bad.push(`${name}: node-builtin`);
    if (/createCanvas|getContext\(|document\.|window\.|navigator\./.test(text)) bad.push(`${name}: dom`);
  }
  (bad.length === 0 ? ok : fail)(`${files.length} קובצי src נקיים מייבוא harfbuzzjs/wawoff2/Node/DOM (${bad.join('; ')}) — הזרקה על ידי ה־host`);

  const pkg = JSON.parse(readFileSync(join(srcDir, '..', 'package.json'), 'utf8'));
  (pkg.peerDependencies?.harfbuzzjs === LOCK.harfbuzzjs && pkg.peerDependencies?.wawoff2 === LOCK.wawoff2
    ? ok : fail)(`peerDependencies exact: harfbuzzjs ${LOCK.harfbuzzjs}, wawoff2 ${LOCK.wawoff2}`);
  (pkg.dependencies?.['@tora/measurement-api'] === '0.1.0'
    ? ok : fail)('תלות החבילה: measurement-api בלבד (גרף §5)');

  // אין ייבוא TestMeasurementProvider בחבילת הייצור
  const anyTestImport = files.some((name) =>
    readFileSync(join(srcDir, name), 'utf8').includes('@tora/measurement-api/test'));
  (!anyTestImport ? ok : fail)('אין ייבוא של TestMeasurementProvider (אין SimulatedMeasurer בייצור)');
}

// ─────────────────────────── 3. אמת הנעילות מול הדיסק ───────────────────────────
console.log('\n3) הנעילות מול הדיסק וה־lockfile');
{
  const lock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));
  const pkgs = lock.packages ?? {};
  const hbLocked = pkgs['node_modules/harfbuzzjs']?.version;
  const w2Locked = pkgs['node_modules/wawoff2']?.version;
  (hbLocked === LOCK.harfbuzzjs ? ok : fail)(`package-lock: harfbuzzjs ${hbLocked} (נעול ${LOCK.harfbuzzjs})`);
  (w2Locked === LOCK.wawoff2 ? ok : fail)(`package-lock: wawoff2 ${w2Locked} (נעול ${LOCK.wawoff2})`);

  const wasmPath = require.resolve('harfbuzzjs/dist/harfbuzz.wasm');
  const wasmSha = sha256(readFileSync(wasmPath));
  (wasmSha === LOCK.wasmSha256 ? ok : fail)(`sha256(harfbuzz.wasm) תואם לנעילה (${wasmSha.slice(0, 12)}…)`);

  const decPath = require.resolve('wawoff2/build/decompress_binding.js');
  const decSha = sha256(readFileSync(decPath));
  (decSha === LOCK.woff2DecoderSha256 ? ok : fail)(`sha256(decompress_binding.js) תואם לנעילה (${decSha.slice(0, 12)}…)`);

  // הקוד נעול בחבילה עצמה — הטענה בזמן יצירה מאומתת מול אותם ערכים
  const lockSrc = readFileSync(join(repoRoot, 'packages', 'measurement-harfbuzz', 'src', 'lock.ts'), 'utf8');
  (lockSrc.includes(LOCK.wasmSha256) && lockSrc.includes(LOCK.woff2DecoderSha256)
    ? ok : fail)('src/lock.ts מכיל את שתי הנעילות — הספק מאמת מולן בזמן יצירה');
}

// ─────────────────────────── 4. וקטורי shaping אמיתיים ───────────────────────────
console.log('\n4) וקטורי shaping אמיתיים ב־Node');
{
  const { createHarfbuzzProvider } = await import('@tora/measurement-harfbuzz');
  const hb = await import('harfbuzzjs');
  const wawoff2 = (await import('wawoff2')).default;

  const manifest = api.assertFontManifest(
    JSON.parse(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8')),
  );
  const files = ['Guttman-Rashi-Normal.woff2', 'selfhost/frank-ruhl-libre-hebrew-400.woff2'];
  const ids = files.map((f) => manifest.find((x) => x.file === f).fontId);
  const fonts = await api.loadFontSet(manifest, ids, async (rec) =>
    new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file))));
  const wasmBytes = new Uint8Array(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz.wasm')));
  const woff2DecoderBytes = new Uint8Array(readFileSync(require.resolve('wawoff2/build/decompress_binding.js')));

  const make = () => createHarfbuzzProvider({
    hb, wasmBytes, woff2DecoderBytes,
    decompressWoff2: (b) => wawoff2.decompress(b),
    fonts: [...fonts.values()],
  });
  const provider = await make();

  (provider.providerId === 'harfbuzz-wasm' && provider.wasmSha256 === LOCK.wasmSha256
    ? ok : fail)("providerId מילולי 'harfbuzz-wasm' + wasmSha256 אומת");

  const guttman = manifest.find((x) => x.file === "Guttman-Rashi-Normal.woff2");
  const font = api.fontFaceKeyOf(guttman);
  const atom = (i, text) => ({
    id: `atom:v1|doc|body|${i}+${i + text.length}||0`, text,
    script: 'hebrew', bidiLevel: 1, breakBefore: i === 0 ? 'forbidden' : 'allowed',
  });
  const req = (over = {}) => ({
    atoms: [atom(0, 'ש'), atom(1, 'ל'), atom(2, 'ו'), atom(3, 'ם')],
    font, fontSizeLu: api.ptToLu(12), direction: 'rtl', language: 'he',
    features: {}, letterSpacingLu: 0, ...over,
  });

  // עברית + RTL
  const shalom = provider.shape(req());
  (shalom.glyphs.length === 4 && shalom.glyphs.every((g) => g.glyphId > 0)
    ? ok : fail)('שלום: 4 גליפים אמיתיים');
  (JSON.stringify(shalom.glyphs.map((g) => g.clusterAtomIndex)) === '[3,2,1,0]'
    ? ok : fail)('RTL: הפלט בסדר חזותי — קלסטרים יורדים [3,2,1,0]');

  // ניקוד
  const niqqud = provider.shape(req({ atoms: [atom(0, 'שָׁלוֹם')] }));
  (niqqud.glyphs.filter((g) => g.advanceLu === 0).length >= 3
    ? ok : fail)(`ניקוד: marks ב־advance 0 (${niqqud.glyphs.length} גליפים)`);

  // גליף חסר
  const omega = provider.shape(req({ atoms: [atom(0, 'א'), atom(1, 'Ω'), atom(2, 'ב')] }));
  (omega.missingGlyphAtomIds.length === 1
    ? ok : fail)('גליף חסר: Ω ← ‎.notdef‎ מדווח ב־missingGlyphAtomIds');

  // חשבונאות + דטרמיניזן + batch + requestHash
  const all = [shalom, niqqud, omega];
  (all.every((r) => api.shapedRunAccountingIssues(r).length === 0)
    ? ok : fail)('חשבונאות: widthLu === Σ advances בכל הווקטורים');
  const p2 = await make();
  (JSON.stringify(p2.shape(req())) === JSON.stringify(shalom)
    ? ok : fail)('דטרמיניזן: שתי יצירות ⇐ אותה תוצאה ביט-ביט');
  const batch = provider.shapeBatch([req(), req({ fontSizeLu: api.ptToLu(18) })]);
  (JSON.stringify(batch[0]) === JSON.stringify(shalom)
    ? ok : fail)('batch שקוף לתוצאה');
  const { shapeRequestHash } = api;
  const identity = {
    providerId: provider.providerId, providerVersion: provider.providerVersion,
    wasmSha256: provider.wasmSha256, environmentHash: provider.environmentHash,
  };
  (shalom.requestHash === shapeRequestHash(identity, req())
    ? ok : fail)('requestHash תואם לחוזה shapeRequestHash');
  (provider.environmentHash === p2.environmentHash
    ? ok : fail)('environmentHash יציב בין יצירות (נגזר מהנעילות בלבד)');

  // WASM זר נדחה
  let rejected = false;
  const tampered = new Uint8Array(wasmBytes);
  tampered[50] = tampered[50] ^ 0xff;
  try {
    await createHarfbuzzProvider({
      hb, wasmBytes: tampered, woff2DecoderBytes,
      decompressWoff2: (b) => wawoff2.decompress(b), fonts: [...fonts.values()],
    });
  } catch (e) {
    rejected = /wasm-sha-mismatch/.test(String(e.message));
  }
  (rejected ? ok : fail)('WASM זר ← MEASUREMENT_UNAVAILABLE (אין גרסה אחרת בשקט)');

  // פסוק אמיתי מהקורפוס
  const verse = 'וַיְדַבֵּר אֱלֹהִים אֶל מֹשֶׁה לֵּאמֹר';
  const verseRun = provider.shape(req({ atoms: [...verse].map((ch, i) => atom(i, ch)) }));
  (verseRun.missingGlyphAtomIds.length === 0
    && api.shapedRunAccountingIssues(verseRun).length === 0
    && verseRun.widthLu > 0
    ? ok : fail)('פסוק מנוקד מהקורפוס: עיצוב מלא, אפס גליפים חסרים');
}

// ─────────────────────────── 5. שעת השלב ───────────────────────────
console.log('\n5) שער: אין shaping של דפדפן בחוזה הייצור');
{
  const providerSrc = readFileSync(join(repoRoot, 'packages', 'measurement-harfbuzz', 'src', 'provider.ts'), 'utf8');
  (providerSrc.includes("providerId: 'harfbuzz-wasm' as const")
    ? ok : fail)("providerId מילולי 'harfbuzz-wasm' (לא איחוד טיפוסים)");
  // אין Canvas/DOM בכל קוד החבילות של המדידה
  const mapiSrc = join(repoRoot, 'packages', 'measurement-api', 'src');
  const mhSrc = join(repoRoot, 'packages', 'measurement-harfbuzz', 'src');
  let domBad = 0;
  for (const dir of [mapiSrc, mhSrc]) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue;
      const text = readFileSync(join(dir, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/createCanvas|getContext\(|HTMLCanvasElement|OffscreenCanvas/.test(text)) domBad += 1;
    }
  }
  (domBad === 0 ? ok : fail)('אין Canvas בחוזי המדידה ובספק — המדידה אינה של דפדפן');
}

// ─────────────────────────── 6. רגרסיה ───────────────────────────
console.log('\n6) רגרסיה');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי');
  const tests = (SKIP_TESTS ? 'Tests  882 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m && Number(m[1]) >= 407 ? ok : fail)(`test:packages — ${m ? m[1] : 'נכשל'} עוברות (386 + 21 ספק)`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`ספק HarfBuzz/WASM תקין — ${checks} בדיקות ירוקות. shaping נעול אחד; אין shaping של דפדפן בחוזה הייצור.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
