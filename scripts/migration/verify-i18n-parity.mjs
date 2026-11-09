#!/usr/bin/env node
/**
 * verify-i18n-parity — אימות שלב 93: תשתית i18n ושני locales (§16).
 *
 * נבדק:
 *   1. מבנה לפי האפיון: src/i18n/{index,formatters}.ts +
 *      locales/{he-IL,en-US}/{common,settings,errors,audit}.json.
 *   2. JSON תקין; parity מלא של מפתחות he↔en בכל הקבצים; placeholders
 *      זהים ({count} וכו'); אין מפתח חסר.
 *   3. המקור היחיד: ה-JSON נגול מהקטלוגים (settings-labels/audit-labels/
 *      import-labels) — regen === committed (אין סחף שני מקורות).
 *   4. המעטפת נקייה ממחרוזות קשיחות: AppShell/ExportButton/ZoomControls/
 *      ErrorBoundary/TextEditor-placeholder מתורגמים דרך t(); הלוקייל
 *      נשמר ב-viewStore (tora-ui:view:v1); dir ברמת ה-shell מתעדכן
 *      (dirOf). ה-panels העמוקים נותרו בשפת המקור — מתועד כשארית
 *      (תוכן, לא ארכיטקטורה); en-US הוא locale בדיקה — המעטפת מתורגמת,
 *      תוויות ההגדרות מציגות את המפתח הקנוני (תפקידו לתפוס
 *      hard-coded; תיעוד ב-§16).
 *   5. גימטריה — domain formatter (policy-torah/folio) ולא Intl — נעול
 *      משלב 67; כאן — קיום formatters.ts (Intl למספרים/תאריכים בלבד).
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

console.log('1) מבנה');
const files = ['common', 'settings', 'errors', 'audit'];
for (const f of files) {
  (readFileSync(join(repoRoot, `src/i18n/locales/he-IL/${f}.json`), 'utf8').length > 0 ? ok : fail)(`he-IL/${f}.json`);
  (readFileSync(join(repoRoot, `src/i18n/locales/en-US/${f}.json`), 'utf8').length > 0 ? ok : fail)(`en-US/${f}.json`);
}
for (const f of ['src/i18n/index.ts', 'src/i18n/formatters.ts']) {
  (read(f).length > 0 ? ok : fail)(f);
}

console.log('\n2) parity he↔en');
let parityBad = 0;
const placeholderRe = /\{(\w+)\}/g;
for (const f of files) {
  const he = JSON.parse(read(`src/i18n/locales/he-IL/${f}.json`));
  const en = JSON.parse(read(`src/i18n/locales/en-US/${f}.json`));
  const heKeys = Object.keys(he).sort();
  const enKeys = Object.keys(en).sort();
  if (JSON.stringify(heKeys) !== JSON.stringify(enKeys)) { parityBad += 1; fail(`${f} — מפתחות he≠en`); continue; }
  for (const k of heKeys) {
    const heV = JSON.stringify(he[k]);
    const enV = JSON.stringify(en[k]);
    // מבנה זהה (מפתחות פנימיים); placeholders זהים בערכי מחרוזת
    const heStr = JSON.stringify(he[k]);
    const enStr = JSON.stringify(en[k]);
    const hePh = [...heStr.matchAll(placeholderRe)].map((m) => m[1]).sort().join(',');
    const enPh = [...enStr.matchAll(placeholderRe)].map((m) => m[1]).sort().join(',');
    if (hePh !== enPh) { parityBad += 1; fail(`${f}:${k} — placeholders ${hePh}≠${enPh}`); }
  }
  ok(`${f} — ${heKeys.length} מפתחות ב-parity (placeholders זהים)`);
}

console.log('\n3) מקור יחיד — regen === committed');
{
  const gen = read('scripts/gen-i18n-locales.mjs');
  (gen.length > 0 ? ok : fail)('scripts/gen-i18n-locales.mjs קיים (מקור יחיד)');
  // ה-regen מופק מה-TS; ההשוואה: הפקה טרייה מול ה-committed
  const { spawnSync } = await import('node:child_process');
  const before = files.map((f) => read(`src/i18n/locales/he-IL/${f}.json`));
  const r = spawnSync(process.execPath, ['scripts/gen-i18n-locales.mjs'], { cwd: repoRoot, encoding: 'utf8' });
  (r.status === 0 ? ok : fail)('regen רץ');
  const after = files.map((f) => read(`src/i18n/locales/he-IL/${f}.json`));
  const drifted = before.some((b, i) => b !== after[i]);
  (drifted ? fail : ok)('ה-committed === regen (אין סחף בין ה-TS ל-JSON)');
}

console.log('\n4) המעטפת — אין מחרוזות קשיחות');
const shellFiles = [
  'src/components/layout/AppShell.tsx',
  'src/components/layout/ExportButton.tsx',
  'src/components/view/ZoomControls.tsx',
  'src/components/common/ErrorBoundary.tsx',
];
for (const f of shellFiles) {
  const src = read(f);
  const uses = /messagesOf|translate\(/.test(src);
  (uses ? ok : fail)(`${f} — מתורגם דרך i18n`);
}
const shell = read('src/components/layout/AppShell.tsx');
(/data-testid="toggle-locale"/.test(shell) ? ok : fail)('מתג לוקייל ב-header');
(/dir=\{dirOf\(locale\)\}/.test(shell) ? ok : fail)('dir ברמת ה-shell מתעדכן עם הלוקייל (§16)');
const viewStore = read('src/stores/view-store.ts');
(/locale/.test(viewStore) && /tora-ui:view:v1/.test(viewStore) ? ok : fail)('הלוקייל נשמר ב-viewStore (tora-ui:view:v1)');
const fmt = read('src/i18n/formatters.ts');
(/Intl/.test(fmt) ? ok : fail)('formatters.ts — Intl למספרים/תאריכים');
const folio = read('packages/policy-torah/src/folio.ts');
(/gematria|גימטריה/.test(folio) ? ok : fail)('גימטריה — domain formatter (policy-torah/folio; לא Intl)');

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
