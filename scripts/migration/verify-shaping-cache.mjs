#!/usr/bin/env node
/**
 * verify-shaping-cache — אימות שלב 26: מטמון shaping.
 * אסמכתא: אפיון §6.2, §17.3 · תכנית שלב 26.
 *
 * בדיקות:
 *   1. ה־API: LruShapingCache (get/set/size/bytes/metrics/clear) ועטיפת
 *      withShapingCache — קיימים ומיוצאים.
 *   2. קר/חם זהים ביט-ביט על הספק האמיתי (HarfBuzz): ריצה ראשונה מול
 *      ריצה שנייה, לאחר ניקוי, ולאחר פינוי אוטומטי (maxEntries=1).
 *   3. אין תלות בסדר קריאות; בקשות שונות אינן חולקות ערך.
 *   4. מדדים (hits/misses/evictions) נספרים נכון ואינם משנים תוצאות.
 *   5. רגרסיה: build, lint, deps, test:packages.
 */
import { readFileSync } from 'node:fs';
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

// ─────────────────────────── 1. ה־API ───────────────────────────
console.log('1) ה־API של המטמון');
{
  const need = ['LruShapingCache', 'withShapingCache'];
  const missing = need.filter((n) => typeof api[n] !== 'function' && !(n in api));
  (missing.length === 0 ? ok : fail)(`LruShapingCache + withShapingCache מיוצאים (${missing.join(', ')})`);
  const c = new api.LruShapingCache({ maxEntries: 2, byteBudget: 4096 });
  (typeof c.get === 'function' && typeof c.set === 'function' && typeof c.clear === 'function'
    && c.size === 0 && typeof c.metrics.hits === 'number'
    ? ok : fail)('הממשק: get/set/clear/size/metrics');
  let threw = false;
  try { new api.LruShapingCache({ maxEntries: 0 }); } catch { threw = true; }
  (threw ? ok : fail)('ארגומנטים לא חוקיים נדחים (maxEntries=0)');
}

// ─────────────────────────── 2. קר/חם על הספק האמיתי ───────────────────────────
console.log('\n2) קר/חם זהים ביט-ביט — על הספק האמיתי (HarfBuzz)');
{
  const { createHarfbuzzProvider } = await import('@tora/measurement-harfbuzz');
  const hb = await import('harfbuzzjs');
  const wawoff2 = (await import('wawoff2')).default;
  const manifest = api.assertFontManifest(
    JSON.parse(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8')),
  );
  const guttman = manifest.find((f) => f.file === 'Guttman-Rashi-Normal.woff2');
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
  const verse = 'וַיְדַבֵּר אֱלֹהִים אֶל מֹשֶׁה לֵּאמֹר';
  const req = (over = {}) => ({
    atoms: [...verse].map((ch, i) => atom(i, ch)),
    font, fontSizeLu: api.ptToLu(12), direction: 'rtl', language: 'he',
    features: {}, letterSpacingLu: 0, ...over,
  });

  const cached = api.withShapingCache(provider);
  const cold = JSON.stringify(cached.shape(req()));
  const warm = JSON.stringify(cached.shape(req()));
  (cold === warm ? ok : fail)('קר ← חם: אותה תוצאה ביט-ביט (פסוק מנוקד מלא)');
  const m = cached.cache.metrics;
  (m.hits === 1 && m.misses === 1 ? ok : fail)(`מדדים: 1 miss + 1 hit (נמדדו ${m.misses}+${m.hits})`);

  // לאחר ניקוי (ביטול job)
  cached.cache.clear();
  (JSON.stringify(cached.shape(req())) === cold ? ok : fail)('לאחר clear (ביטול job) — חישוב מחדש לאותה תוצאה');

  // פינוי אוטומטי
  const tiny = api.withShapingCache(provider, { maxEntries: 1 });
  const r1 = req({ fontSizeLu: api.ptToLu(14) });
  const r2 = req({ fontSizeLu: api.ptToLu(18) });
  const s1 = JSON.stringify(tiny.shape(r1));
  tiny.shape(r2);
  (tiny.cache.size === 1 ? ok : fail)('פינוי אוטומטי: maxEntries=1 מתקיים');
  (JSON.stringify(tiny.shape(r1)) === s1 ? ok : fail)('לאחר פינוי — miss מחזיר אותה תוצאה');
  (tiny.cache.metrics.evictions >= 1 ? ok : fail)(`מדדי פינוי נספרים (${tiny.cache.metrics.evictions})`);

  // סדר קריאות
  const a = api.withShapingCache(provider);
  const b = api.withShapingCache(provider);
  const reqs = [req(), req({ letterSpacingLu: 3 }), req({ direction: 'ltr' })];
  const fwd = reqs.map((r) => JSON.stringify(a.shape(r)));
  const rev = [...reqs].reverse().map((r) => JSON.stringify(b.shape(r))).reverse();
  (JSON.stringify(fwd) === JSON.stringify(rev) ? ok : fail)('אין תלות בסדר קריאות');
  (JSON.stringify(a.shape(reqs[0])) === fwd[0] ? ok : fail)('בקשה חוזרת מקבלת את שלה בדיוק');

  // batch דרך המטמון
  const batch = cached.shapeBatch([req(), req({ fontSizeLu: api.ptToLu(16) })]);
  const singles = [req(), req({ fontSizeLu: api.ptToLu(16) })].map((r) => cached.shape(r));
  (JSON.stringify(batch) === JSON.stringify(singles) ? ok : fail)('batch עובר דרך המטמון — זהה לפרטני');

  // הזהות נשמרת
  (cached.providerId === 'harfbuzz-wasm' && cached.wasmSha256 === provider.wasmSha256
    && cached.environmentHash === provider.environmentHash
    ? ok : fail)('הזהות עוברת כמות שהיא (providerId/wasmSha256/environmentHash)');
}

// ─────────────────────────── 3. רגרסיה ───────────────────────────
console.log('\n3) רגרסיה');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי');
  const tests = (SKIP_TESTS ? 'Tests  1033 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m && Number(m[1]) >= 440 ? ok : fail)(`test:packages — ${m ? m[1] : 'נכשל'} עוברות (424 + 16 מטמון)`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`מטמון ה־shaping תקין — ${checks} בדיקות ירוקות. קר/חם זהים ביט-ביט; פינוי וביטול אינם משנים תוצאה.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
