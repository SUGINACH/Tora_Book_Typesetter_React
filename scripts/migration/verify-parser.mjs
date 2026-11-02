#!/usr/bin/env node
/**
 * verify-parser — אימות שלב 17: פורט הפרסר הישן בשלמות.
 * אסמכתא: אפיון §3.3, §6.2, §7 · תכנית 100 השלבים, שלב 17 · מרשם docs/migration/identifiers.json.
 *
 * בדיקות:
 *   1. סנכרון המרשם: הרצת gen-identifier-registry מחדש ← השוואה ביט-ביט של
 *      registry-data.ts ו־identifiers.md מול הקבצים המחויבים (אין עריכה ידנית).
 *   2. שלמות המרשם: 38 רשומות, מזהים ייחודיים, לכל רשומה מקורות+תחביר+fixture+מיפוי;
 *      ציטוטי המקורות תואמים למניפסט המקורות הנעולים (repo+commit).
 *   3. הפרסר הישן המוחזק: 18 קבצים אומתו מול React @ 0c7b9927 (manifest.json, sha256).
 *   4. כיסוי fixtures: לכל רשומה קובץ מתאים; כל הקבצים נפרסרים עם coverage.ok.
 *   5. בדיקות שליליות: קלט sentinel נדחה; הפלט נקי מ־sentinel; HTML מילולי.
 *   6. סריקת מקור: כל מזהה/תוחם בקוד הפרסר הישן המוחזק מכוסה במרשם.
 *   7. differential מלא: 26 מסמכי הקורפוס (vitest) — ניתוב שורות, הערות, metadata,
 *      מבנה — מול הפרסר הישן עצמו; הפרשי Orange מוסברים בלבד.
 *   8. רגרסיה: test:packages, build, typecheck, lint, deps.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 * תלויות: אפס (Node 22 בלבד) + סביבת הבדיקות הקיימת.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cm = await import('@tora/content-model');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
// קודי בקרה ANSI (צבע) — מוסרים מכל פלט תהליך-בן לפני התאמת טקסט
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

const run = (cmd, args, opts = {}) => {
  try {
    // ANSI-safe: ב-CI (CI=true) chalk/vitest מצבעים את הפלט גם שלא דרך TTY; קודי הצבע
    // בין "Tests" למספר שברו התאמות טקסט (נתגלה ב-GitHub Actions). מנקים קודי בקרה
    // וגם מזריקים NO_COLOR=1 — שתי הגנות עצמאיות.
    const out = execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' }, ...opts });
    return out.replace(ANSI_RE, '').replace(/\x1b/g, ''); // ניקוי סופי: ESC בודד שנותר
  } catch (e) {
    return null;
  }
};
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ─────────────────────────── 1. סנכרון המרשם ───────────────────────────
console.log('1) סנכרון המרשם — מקור אחד, שתי נגזרות');
{
  const before = {
    ts: readFileSync(join(repoRoot, 'packages/content-model/src/parser/registry-data.ts'), 'utf8'),
    md: readFileSync(join(repoRoot, 'docs/migration/identifiers.md'), 'utf8'),
  };
  run('node', ['scripts/migration/gen-identifier-registry.mjs']);
  const after = {
    ts: readFileSync(join(repoRoot, 'packages/content-model/src/parser/registry-data.ts'), 'utf8'),
    md: readFileSync(join(repoRoot, 'docs/migration/identifiers.md'), 'utf8'),
  };
  (before.ts === after.ts ? ok : fail)('registry-data.ts מסונכרן ביט-ביט עם identifiers.json');
  (before.md === after.md ? ok : fail)('identifiers.md מסונכרן ביט-ביט עם identifiers.json');
}

// ─────────────────────────── 2. שלמות המרשם ───────────────────────────
console.log('\n2) שלמות המרשם');
const registry = JSON.parse(readFileSync(join(repoRoot, 'docs/migration/identifiers.json'), 'utf8'));
const sourceManifest = JSON.parse(readFileSync(join(repoRoot, 'docs/migration/source-manifest.json'), 'utf8'));
const lockedByRepo = new Map(sourceManifest.sources.map((s) => [s.id, s.commit]));
{
  const records = registry.records ?? [];
  (records.length === 38 ? ok : fail)(`38 רשומות (נמצאו ${records.length})`);
  const ids = new Set(records.map((r) => r.recordId));
  (ids.size === records.length ? ok : fail)('מזהי רשומות ייחודיים');
  let bad = 0;
  for (const r of records) {
    if (!r.legacyId || !r.fixtureId || !r.mapping?.target || !Array.isArray(r.sources) || r.sources.length === 0) bad += 1;
    if (!['active-input', 'settings-driven', 'layout-computed', 'specified-not-implemented', 'negative'].includes(r.status)) bad += 1;
    for (const src of r.sources ?? []) {
      const locked = lockedByRepo.get(src.repo);
      if (locked === undefined || locked !== src.commit) bad += 1;
      if (!/^[0-9a-f]{64}$/.test(src.sha256 ?? '')) bad += 1;
    }
  }
  (bad === 0 ? ok : fail)(`לכל רשומה: מזהה, fixture, מיפוי, מקורות מאומתים מול המניפסט הנעול (${bad} בעיות)`);
  const metaKeys = records.filter((r) => r.recordId.startsWith('metadata-key:'));
  (metaKeys.length === 10 ? ok : fail)(`עשרת מפתחות ה-metadata רשומים (${metaKeys.length})`);
  const activeSyntax = records.filter((r) => r.status === 'active-input' && r.syntax?.kind === 'regex' && !r.syntax?.pattern);
  (activeSyntax.length === 0 ? ok : fail)('לכל רשומת קלט פעילה עם תחביר regex — תבנית מלאה');
}

// ─────────────────────────── 3. הפרסר הישן המוחזק ───────────────────────────
console.log('\n3) הפרסר הישן המוחזק (React @ 0c7b9927)');
{
  const legacyRoot = join(repoRoot, 'packages/test-fixtures/legacy/react-lock');
  const manifest = JSON.parse(readFileSync(join(legacyRoot, 'manifest.json'), 'utf8'));
  (manifest.provenance?.sourceCommit === '0c7b9927c33dbab32fedafdf4adf54c7431d11c5' ? ok : fail)('provenance: React lock מדויק');
  let verified = 0;
  let mismatch = 0;
  for (const f of manifest.files ?? []) {
    const p = join(legacyRoot, f.path);
    if (!existsSync(p)) { mismatch += 1; continue; }
    if (sha256(readFileSync(p)) !== f.sha256) mismatch += 1;
    else verified += 1;
  }
  (verified === 18 && mismatch === 0 ? ok : fail)(`18 קבצים אומתו ביט-ביט מול הקומיט הנעול (אומתו ${verified}, פגומים ${mismatch})`);
}

// ─────────────────────────── 4. כיסוי fixtures ───────────────────────────
console.log('\n4) כיסוי fixtures — לכל רשומה קובץ, כל קובץ נפרסר עם כיסוי מלא');
{
  const identDir = join(repoRoot, 'packages/test-fixtures/corpus/identifiers');
  let parsed = 0;
  let bad = 0;
  for (const r of registry.records ?? []) {
    const p = join(identDir, `${r.fixtureId}.txt`);
    if (!existsSync(p)) { fail(`חסר fixture: ${r.fixtureId}.txt`); bad += 1; continue; }
    const raw = readFileSync(p, 'utf8');
    try {
      const res = cm.parseSourceText(raw, {
        documentId: r.fixtureId,
        customStyles: r.fixtureId === 'ident-custom-lineprefix' || r.fixtureId === 'ident-custom-inlinemarker'
          ? [{ id: 'em', enabled: true, matcher: r.fixtureId === 'ident-custom-lineprefix' ? { type: 'linePrefix', prefix: '»' } : { type: 'inlineMarker', open: '«', close: '»' } }]
          : undefined,
      });
      if (res.coverage.ok) parsed += 1;
      else { fail(`${r.fixtureId}: כיסוי לא מלא — ${JSON.stringify(res.coverage.gaps.slice(0, 2))}`); bad += 1; }
    } catch (e) {
      fail(`${r.fixtureId}: פרסור נכשל — ${e.message}`);
      bad += 1;
    }
  }
  (bad === 0 && parsed === 38 ? ok : fail)(`38/38 fixtures נפרסרים ללא אטום אבוד (נפרסרו ${parsed})`);
}

// ─────────────────────────── 5. בדיקות שליליות ───────────────────────────
console.log('\n5) בדיקות שליליות — sentinel ו־HTML');
{
  const S1 = String.fromCharCode(1);
  const S2 = String.fromCharCode(2);
  let rejected = false;
  try {
    cm.parseSourceText(`טקסט ${S1}FN:x${S2} נגוע`, { documentId: 'neg' });
  } catch (e) {
    rejected = e.catalogKey === 'errors.parser.SENTINEL_IN_INPUT';
  }
  (rejected ? ok : fail)('קלט עם sentinel נדחה מראש (errors.parser.SENTINEL_IN_INPUT)');
  const res = cm.parseSourceText('כותרת 1 - ח\nטקסט [הערה] ##עורך## <b>HTML</b> וסוף.\nהערת סיום - ב\nכותרת 7 - צד\n', { documentId: 'neg2' });
  (RegExp(`[${S1}${S2}]`).test(JSON.stringify(res.doc)) === false ? ok : fail)('הפלט נקי מ־sentinel לחלוטין');
  (res.coverage.ok ? ok : fail)('כיסוי מלא גם עם HTML מילולי');
  const htmlLiteral = (() => {
    const atomsOf = (b) => {
      for (const item of b.inline) {
        if (item.kind === 'text') {
          for (const a of item.atoms) if (a.text.includes('<b>')) return true;
        }
      }
      for (const c of b.children ?? []) if (atomsOf(c)) return true;
      return false;
    };
    for (const part of res.doc.parts) {
      for (const siman of part.simanim) {
        for (const b of siman.blocks) if (atomsOf(b)) return true;
      }
    }
    return false;
  })();
  (htmlLiteral ? ok : fail)('HTML נשמר מילולית — אין פרשנות (§6.2)');
  (res.diagnostics.some((d) => d.code === 'errors.parser.WARN_HTML_IN_TEXT') ? ok : fail)('אזהרה ממוקמת על HTML בקלט');
}

// ─────────────────────────── 6. סריקת מקור — אין מזהה חסר ───────────────────────────
console.log('\n6) סריקת מקור — כל מזהה/תוחם בפרסר הישן מכוסה במרשם');
{
  const legacyRoot = join(repoRoot, 'packages/test-fixtures/legacy/react-lock');
  const registryText = JSON.stringify(registry);
  const legacySources = readdirSync(join(legacyRoot, 'src/parser')).filter((f) => f.endsWith('.ts'));
  const tests = readFileSync(join(legacyRoot, 'tests/unit/parser/parser.test.ts'), 'utf8');
  const allText = legacySources.map((f) => readFileSync(join(legacyRoot, 'src/parser', f), 'utf8')).join('\n') + '\n' + tests;
  // מזהים מוכרים שחייבים להופיע במרשם
  const mustCover = [
    ['כותרת', 'heading-line'],
    ['מספר', 'siman-numbering'],
    ['שם הספר', 'metadata-key'],
    ['נושא מפורט', 'metadata-key'],
    ['פרטי מהדורא', 'metadata-key'],
    ['שם המחבר', 'metadata-key'],
    ['מקום ושנת הוצאה', 'metadata-key'],
    ['שמירת זכויות', 'metadata-key'],
    ['פרטי הוצאה לאור', 'metadata-key'],
    ['פרטי קשר', 'metadata-key'],
    ['פרטים נוספים', 'metadata-key'],
    ['הערת סיום', 'endnote-prefix'],
    ['##', 'editorial-notes'],
    ["footnoteDelimiters", 'footnote-brackets'],
    ['linePrefix', 'custom-style-linePrefix'],
    ['inlineMarker', 'custom-style-inlineMarker'],
    ['CUSTOM', 'sentinels-forbidden'],
  ];
  let missing = 0;
  for (const [token, recordIdPrefix] of mustCover) {
    if (allText.includes(token) && !registryText.includes(recordIdPrefix)) {
      fail(`מזהה "${token}" במקור הישן בלי רשומת מרשם (${recordIdPrefix})`);
      missing += 1;
    }
  }
  (missing === 0 ? ok : fail)('כל מזהי הקלט בקוד ובמבחנים הישנים מכוסים במרשם');
  // סדר הצינור: הרצף ב-index.ts הישן זהה למתועד
  const indexTs = readFileSync(join(legacyRoot, 'src/parser/index.ts'), 'utf8');
  const callOrder = ['parseMetadata', 'parseEditorialNotes', 'parseSidenotes', 'parseEndnotes', 'parseFootnotes', 'applyCustomStyles', 'buildAst']
    .map((name) => indexTs.indexOf(`= ${name}(`)); // הקריאות בלבד, לא שורות הייבוא
  const monotonic = callOrder.every((v) => v >= 0) && callOrder.every((v, i) => i === 0 || v > callOrder[i - 1]);
  const stagesOk = registry.precedence?.pipelineStages?.length === 8;
  (monotonic && stagesOk ? ok : fail)('סדר הצינור הישן (metadata→editorial→sidenote→endnote→footnote→custom→ast) נשמר ומתועד');
}

// ─────────────────────────── 7. differential מלא ───────────────────────────
console.log('\n7) differential מלא — הקורפוס כולו מול הפרסר הישן עצמו');
{
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/test-fixtures/test/legacy-parser.differential.test.ts']);
  if (out !== null && out.includes('Tests  48 passed')) {
    ok('48/48 בדיקות differential: 26 מסמכים × (ניתוב + הערות + metadata + כיסוי) + מבנה');
  } else {
    fail('בדיקות ה-differential נכשלו או לארצו — ראו פלט vitest');
    if (out !== null) console.log(out.split('\n').filter((l) => l.includes('×') || l.includes('Tests ')).slice(0, 8).join('\n'));
  }
}

// ─────────────────────────── 8. רגרסיה ───────────────────────────
console.log('\n8) רגרסיה מלאה');
{
  const testOut = run('npm', ['run', 'test:packages', '--silent']);
  (testOut !== null && /Tests\s+708\s+passed/.test(testOut) ? ok : fail)('test:packages — 708/708 (613 עד שלב 39 + 2 דגל מנוע שלב 40 + 13 מועמדי שורה שלב 41 + 10 DP שלב 42 + 10 איכות שלב 43 + 8 חירום שלב 44)');
  const build = run('npm', ['run', 'build:packages', '--silent']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages');
  const typecheck = run('npm', ['run', 'typecheck:packages', '--silent']);
  (typecheck !== null ? ok : fail)('typecheck:packages');
  const lint = run('npm', ['run', 'lint:packages', '--silent']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages');
  const deps = run('npm', ['run', 'deps:check', '--silent']);
  (deps !== null ? ok : fail)('deps:check (גבולות תלות)');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log(`\nמאמת הפרסר הושלם — ${checks} בדיקות, ${failures} כשלונות.`);
if (failures > 0) {
  console.log('שלב 17 טרם עבר — תקנו את הכשלים לעיל.');
  process.exit(1);
}
console.log('פורט הפרסר הישן הושלם: תחביר מהמרשם, differential מלא מול React-lock, כיסוי 100% בלי אטום אבוד, הפרשי Orange מוסברים ומתועדים בלבד.');
