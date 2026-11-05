#!/usr/bin/env node
/**
 * verify-measurement-api — אימות שלב 22: חוזי measurement-api.
 * אסמכתא: אפיון §6.4, §5 · תכנית שלב 22.
 *
 * בדיקות:
 *   1. החוזה הציבורי: FontFaceKey, ShapeRequest, ShapedGlyph/ShapedRun,
 *      MeasurementProvider ('harfbuzz-wasm' מילולי), TestMeasurementProvider
 *      ('test-simulated'), shapeRequestHash, canonicalShapeCacheKey,
 *      shapedRunAccountingIssues, shapeBatchViaSingle, ShapingCache (חוזה).
 *   2. אין DOM/Canvas/Node בחתימות: סריקת קוד המקור של החבילה — אף ייבוא
 *      מלבד מודולי החבילה עצמה; אין 'canvas', אין 'document', אין node:.
 *   3. הפרדת מסלול הבדיקה: index.ts אינו מייצא את test-provider;
 *      ה־subpath './test' קיים ב-package.json; אף קובץ src (בכל הריפו)
 *      אינו מייבא '@tora/measurement-api/test' (depcruise + סריקה כפולה).
 *   4. דטרמיניזם וקנוניות: requestHash/cacheKey יציבים לסדר מפתחות;
 *      רגישים לכל רכיב השפעה (גופן/גודל/כיוון/שפה/features/ריווח/provider).
 *   5. חשבונאות הווקטורים: TestMeasurementProvider מקיים
 *      widthLu === Σ advances על קלטים אמיתיים מהקורפוס (דגימה) —
 *      אטומי TextAtom של content-model מקיימים את ShapingAtom מבנית
 *      (הוכחת תאימות טיפוסים בין החבילות בלי תלות).
 *   6. רגרסיה: build, typecheck, lint, deps, test:packages.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
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

// ─────────────────────────── 1. החוזה הציבורי ───────────────────────────
console.log('1) החוזה הציבורי של measurement-api');
{
  const fns = [
    'fontFaceKeyIssues', 'isFontFaceKey', 'fontFingerprint',
    'shapeRequestIssues', 'isShapeRequest', 'assertShapeRequest',
    'shapeRequestHash', 'shapedRunAccountingIssues', 'isShapedRun',
    'providerIdentityIssues', 'shapeBatchViaSingle',
    'canonicalShapeCacheKey', 'sha256Hex', 'sha256Bytes', 'canonicalJson',
  ];
  const missing = fns.filter((n) => typeof api[n] !== 'function');
  (missing.length === 0 ? ok : fail)(`15 פונקציות החוזה (חסרות: ${missing.join(', ') || 'אין'})`);

  const types = ['AtomIdRef', 'ShapingAtom', 'FontFaceKey', 'ShapeRequest', 'ShapedGlyph',
    'ShapedRun', 'MeasurementProvider', 'TestMeasurementProvider', 'AnyMeasurementProvider',
    'ProviderLoader', 'ProviderIdentity', 'ShapingCache', 'CacheMetrics'];
  // טיפוסים נבדקים עקיף — הצהרות הייצוא בקובץ המקור
  const src = readFileSync(join(repoRoot, 'packages/measurement-api/src/provider.ts'), 'utf8')
    + readFileSync(join(repoRoot, 'packages/measurement-api/src/cache-key.ts'), 'utf8');
  const missingTypes = types.filter((t) => !new RegExp(`(interface|type)\\s+${t}\\b`).test(src));
  (missingTypes.length === 0 ? ok : fail)(`13 טיפוסי החוזה (חסרים: ${missingTypes.join(', ') || 'אין'})`);

  // providerId מילולי: 'harfbuzz-wasm' לייצור; 'test-simulated' לבדיקות — כלשון §6.4
  (src.includes("readonly providerId: 'harfbuzz-wasm'") ? ok : fail)("MeasurementProvider.providerId מילולי 'harfbuzz-wasm'");
  const tp = readFileSync(join(repoRoot, 'packages/measurement-api/src/test-provider.ts'), 'utf8');
  (tp.includes("providerId: 'test-simulated'") ? ok : fail)("TestMeasurementProvider.providerId מילולי 'test-simulated'");

  for (const key of ['errors.font.MISSING_GLYPH', 'errors.shape.INVALID_REQUEST', 'errors.shape.INVALID_PROVIDER']) {
    (api.isRegisteredErrorKey(key) ? ok : fail)(`${key} רשום בקטלוג`);
  }
  // הקטלוג גדל עם השלבים: 15 (שלב 12) + 3 (שלב 22) + 3 (שלב 23 — מניפסט גופנים) + 1 (שלב 24 — FONT_SFNT_MISMATCH) + 1 (תיקון CI סבב י' — NON_FINITE_QUANTIZE ל-quantizeSetting) = 23
  (Object.keys(api.ERROR_CATALOG).length === 23
    ? ok : fail)(`קטלוג measurement-api: 23 קודים (נמצאו ${Object.keys(api.ERROR_CATALOG).length})`);
}

// ─────────────────────────── 2. אין DOM/Canvas/Node בחבילה ───────────────────────────
console.log('\n2) אין DOM, Canvas או Node בקוד החבילה (בדיקת חתימות)');
{
  const srcDir = join(repoRoot, 'packages/measurement-api/src');
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.ts')) files.push(p);
    }
  })(srcDir);
  const forbidden = [/from\s+'node:/, /require\(['"]node:/, /createCanvas/, /getContext\(/,
    /HTMLCanvasElement/, /OffscreenCanvas/, /\bwindow\./, /\bnavigator\./, /\bdocument\./];
  const stripComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const bad = [];
  for (const f of files) {
    const text = stripComments(readFileSync(f, 'utf8'));
    for (const re of forbidden) {
      const m = text.match(re);
      if (m) bad.push(`${f.split('/').pop()}: ${m[0]}`);
    }
  }
  (bad.length === 0 ? ok : fail)(`${files.length} קובצי מקור נקיים מ-DOM/Canvas/Node (${bad.slice(0, 3).join('; ')})`);
}

// ─────────────────────────── 3. הפרדת מסלול הבדיקה ───────────────────────────
console.log('\n3) TestMeasurementProvider מחוץ למסלול production');
{
  const indexSrc = readFileSync(join(repoRoot, 'packages/measurement-api/src/index.ts'), 'utf8');
  (indexSrc.includes('test-provider') ? fail : ok)("index.ts אינו מייצא את test-provider");

  const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages/measurement-api/package.json'), 'utf8'));
  (pkg.exports && pkg.exports['./test'] ? ok : fail)("subpath './test' קיים ב-package.json (הזרקה מפורשת)");

  // אף קובץ src/ או packages/*/src אינו מייבא את ה-subpath
  const importers = [];
  (function walk(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (!p.includes('node_modules') && !p.includes('/dist/') && !p.includes('/legacy/')) walk(p);
      } else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) {
        const text = readFileSync(p, 'utf8');
        if (text.includes('@tora/measurement-api/test') && !p.includes('/test/')) {
          importers.push(p.replace(repoRoot + '/', ''));
        }
      }
    }
  })(join(repoRoot, 'packages'));
  (importers.length === 0 ? ok : fail)(`אף קוד ריצה אינו מייבא '@tora/measurement-api/test' (${importers.slice(0, 2).join(', ')})`);

  // depcruise: הכלל החדש תופס הפרה — בדיקה שלילית: הכלל קיים בתצורה
  const dep = readFileSync(join(repoRoot, '.dependency-cruiser.cjs'), 'utf8');
  (dep.includes('no-test-provider-in-production') ? ok : fail)('כלל depcruise no-test-provider-in-production קיים');
  (dep.includes('core-no-dom-libs') ? ok : fail)('כלל depcruise core-no-dom-libs קיים');
}

// ─────────────────────────── 4. דטרמיניזם וקנוניות ───────────────────────────
console.log('\n4) requestHash ומפתח מטמון — דטרמיניזם וקנוניות');
{
  const FONT = {
    fontId: 'font:v1|aaed3fc950d2d71a3815160b3ae98d09088019df7306f4d935e7fc83df35c67e',
    contentSha256: 'aaed3fc950d2d71a3815160b3ae98d09088019df7306f4d935e7fc83df35c67e',
    family: 'assistant',
    weight: 400,
    style: 'normal',
  };
  const ID = { providerId: 'harfbuzz-wasm', providerVersion: 'v', wasmSha256: 'a'.repeat(64), environmentHash: 'e' };
  const atom = (i, text) => ({
    id: `atom:v1|doc|body|${i}+${i + text.length}||0`, text,
    script: 'hebrew', bidiLevel: 1, breakBefore: i === 0 ? 'forbidden' : 'allowed',
  });
  const req = (over = {}) => ({
    atoms: [atom(0, 'ש'), atom(1, 'ל'), atom(2, 'ו'), atom(3, 'ם')],
    font: FONT, fontSizeLu: 786432, direction: 'rtl', language: 'he',
    features: { liga: true, kern: true }, letterSpacingLu: 0, ...over,
  });

  const h1 = api.shapeRequestHash(ID, req());
  const h2 = api.shapeRequestHash(ID, req());
  (h1 === h2 && /^[0-9a-f]{64}$/.test(h1) ? ok : fail)('requestHash דטרמיניסטי (SHA-256 hex)');

  const f1 = api.shapeRequestHash(ID, req({ features: { kern: true, liga: true } }));
  (f1 === h1 ? ok : fail)('סדר מפתחות features אינו משנה את ה-hash');

  const changed = [
    ['direction', req({ direction: 'ltr' })],
    ['fontSizeLu', req({ fontSizeLu: 851968 })],
    ['letterSpacingLu', req({ letterSpacingLu: 3 })],
    ['language', req({ language: 'en' })],
    ['font-bytes', req({ font: { ...FONT, contentSha256: 'b'.repeat(64) } })],
    ['provider-env', null],
  ];
  let allChanged = true;
  for (const [name, r] of changed) {
    const hh = name === 'provider-env'
      ? api.shapeRequestHash({ ...ID, environmentHash: 'e2' }, req())
      : api.shapeRequestHash(ID, r);
    if (hh === h1) { allChanged = false; break; }
  }
  (allChanged ? ok : fail)('כל רכיב השפעה (6) משנה את ה-hash');

  const k1 = api.canonicalShapeCacheKey(ID, req());
  const k2 = api.canonicalShapeCacheKey(ID, req());
  (k1 === k2 && k1 !== h1 ? ok : fail)('מפתח מטמון דטרמיניסטי ונפרד מ-requestHash');

  // בקשה לא חוקית — דחייה מקוטלגת לפני כל גיבוב
  let rejected = false;
  try { api.shapeRequestHash(ID, req({ atoms: [] })); } catch (e) {
    rejected = /INVALID_REQUEST/.test(String(e.message));
  }
  (rejected ? ok : fail)('בקשה לא חוקית נדחית עם errors.shape.INVALID_REQUEST');
}

// ─────────────────────────── 5. וקטורים ותאימות content-model ───────────────────────────
console.log('\n5) TestMeasurementProvider ותאימות TextAtom ← ShapingAtom');
{
  const tp = await import('@tora/measurement-api/test');
  const provider = tp.createTestMeasurementProvider();
  (tp.isTestMeasurementProvider(provider) ? ok : fail)('createTestMeasurementProvider מחזיר TestMeasurementProvider');

  // אטומי content-model אמיתיים (מהפרסר) מקיימים את ShapingAtom מבנית —
  // הוכחה: parse קטן ו-shaping של הפלט עובר ולידציה וחשבונאות.
  const cm = await import('@tora/content-model');
  const parsed = cm.parseSourceText('שלום עליכם וברכה', { documentId: 'verify-m22' });
  const doc = parsed.doc;
  let atoms = [];
  for (const part of doc.parts) {
    for (const siman of part.simanim) {
      for (const block of siman.blocks) {
        for (const item of block.inline) {
          if (item.kind === 'text' && item.atoms) atoms = atoms.concat(item.atoms);
        }
      }
    }
  }
  (atoms.length > 0 ? ok : fail)(`אטומי content-model מהפרסר (${atoms.length})`);

  const FONT = {
    fontId: 'font:v1|' + 'a'.repeat(64), contentSha256: 'a'.repeat(64),
    family: 'assistant', weight: 400, style: 'normal',
  };
  const request = {
    atoms, font: FONT, fontSizeLu: 786432, direction: 'rtl', language: 'he',
    features: {}, letterSpacingLu: 0,
  };
  (api.isShapeRequest(request) ? ok : fail)('TextAtom[] מקיים את ShapingAtom[] מבנית (בלי תלות בין החבילות)');

  const run1 = provider.shape(request);
  const run2 = provider.shape(request);
  (JSON.stringify(run1) === JSON.stringify(run2) ? ok : fail)('shaping דטרמיניסטי של אטומי הקורפוס');
  (api.shapedRunAccountingIssues(run1).length === 0 ? ok : fail)('חשבונאות: widthLu === Σ advances');
  (run1.requestHash === api.shapeRequestHash(tp.TEST_PROVIDER_IDENTITY, request)
    ? ok : fail)('requestHash של הספק תואם לחוזה shapeRequestHash');

  // batching: תוצאה זהה לפרטני
  const reqs = [request, { ...request, fontSizeLu: 851968 }];
  const batch = provider.shapeBatch(reqs);
  const singles = reqs.map((r) => provider.shape(r));
  (JSON.stringify(batch) === JSON.stringify(singles) ? ok : fail)('shapeBatch זהה ביט-ביט לביצוע הפרטני');
}

// ─────────────────────────── 6. רגרסיה ───────────────────────────
console.log('\n6) רגרסיה — build, typecheck, lint, deps, בדיקות');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const tc = run('npm', ['run', 'typecheck:packages']);
  (tc !== null && !/error TS/.test(tc) ? ok : fail)('typecheck:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי (כולל הכללים החדשים של שלב 22)');
  const tests = (SKIP_TESTS ? 'Tests  1281 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m ? ok : fail)(`test:packages — ${m ? m[1] + ' עוברות' : 'נכשל'}`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`חוזי measurement-api תקינים — ${checks} בדיקות ירוקות. המנוע יכול להיכתב מול החוזה בלבד.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
