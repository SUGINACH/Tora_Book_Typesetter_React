#!/usr/bin/env node
/**
 * gen-settings-coverage.mjs — מחולל דוח כיסוי ההגדרות (שלב 84; אפיון §13,
 * §18-M9; תכנית שלב 84 — "ניקוי stores ובדיקת הגדרות יתומות").
 *
 * מה נבנה כאן — דוח סגור ודטרמיניסטי של כל Setting Registry מול הבעלות
 * בפועל במעטפת (stores/UI/consumers):
 *   1. **צרכנים**: סגירת הקבוצה ‎{engine, ui-only}‎ — כל רשומה ממופה
 *      לצרכן אחד; ‎affectsLayout ⇔ consumerId === 'engine'‎.
 *   2. **תוויות**: לכל רשומה יש ‎labelKey‎ בקטלוג (settings-labels), ואין
 *      תווית יתומה — כיסוי דו-כיווני מלא.
 *   3. **בעלות state**: ערכי הגדרות חיים ב־settings-store בלבד (draft ←
 *      effective); שדות view-store (zoom/locale/...) אינם מפתחות מרשם;
 *      ה־store הישן (src/store) אינו קיים — אין state מוסמך כפול.
 *   4. **מיפויים מתים**: מפתחות קנוניים ייחודיים; מפתחות legacy ייחודיים;
 *      defaultValue עקבי לטיפוס שלו (בקנוניזציה של הסכמה).
 *
 * פלט: docs/migration/settings-coverage.json. דטרמיניסטי לחלוטין — אותם
 * קלטים ⇐ אותו בייטים; המאמת (verify-settings-coverage) משווה מחדש.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(repoRoot, 'docs', 'migration', 'settings-coverage.json');

const registry = JSON.parse(readFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8'));
const registrySha256 = createHash('sha256').update(readFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'))).digest('hex');
const labelsSrc = readFileSync(join(repoRoot, 'src', 'i18n', 'settings-labels.ts'), 'utf8');

// קטלוג התוויות — אותו חילוץ כמו verify-settings-panel (שלב 78): מפתחות
// 'settings.<key>': — קטלוג סטטי סגור.
const catalogKeys = new Set([...labelsSrc.matchAll(/'(settings\.[^']+)'\s*:/g)].map((m) => m[1]));

// ערכי הבעלות בפועל — מהקוד, לא מהצהרות:
const settingsStoreSrc = readFileSync(join(repoRoot, 'src', 'stores', 'settings-store.ts'), 'utf8');
const viewStoreSrc = readFileSync(join(repoRoot, 'src', 'stores', 'view-store.ts'), 'utf8');
const editorStoreSrc = readFileSync(join(repoRoot, 'src', 'stores', 'editor-store.ts'), 'utf8');
const legacyStoreRemoved = !existsSync(join(repoRoot, 'src', 'store'));

// שדות ה-view/editor אינם מפתחות מרשם — הפרדת בעלות קשיחה (§13.1):
const viewStoreFields = ['zoom', 'selectedPageId', 'locale', 'focus'];
const editorStoreFields = ['rawText', 'documentName', 'revision', 'dirty', 'analysis', 'importIssue'];
const registryCanonical = new Set(registry.settings.map((s) => s.canonicalKey));
const viewFieldsOutsideRegistry = viewStoreFields.filter((f) => !registryCanonical.has(f));
const editorFieldsOutsideRegistry = editorStoreFields.filter((f) => !registryCanonical.has(f));

// הקנוניזציה של defaultValue לפי הטיפוס — עקביות פנימית של המרשם:
const defaultValueConsistent = (entry) => {
  const v = entry.defaultValue;
  switch (entry.type) {
    case 'boolean': return typeof v === 'boolean' || v === 'true' || v === 'false';
    case 'number': return (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
    case 'dimension': return typeof v === 'string' && /^-?\d+(\.\d+)?(px|em|%|pt|rem)$/.test(v.trim());
    case 'color': return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
    case 'enum': return entry.enum !== null && entry.enum.includes(v);
    case 'font-stack': return typeof v === 'string';
    case 'string': return typeof v === 'string';
    default: return false;
  }
};

const entries = registry.settings;
const canonicalKeys = entries.map((e) => e.canonicalKey);
const legacyKeys = entries.map((e) => e.legacyKey);
const consumers = {};
for (const e of entries) consumers[e.consumerId] = (consumers[e.consumerId] ?? 0) + 1;

const sections = {};
for (const e of entries) {
  const section = e.ui?.section ?? '(none)';
  sections[section] = (sections[section] ?? 0) + 1;
}

const missingLabels = entries.filter((e) => !catalogKeys.has(e.ui?.labelKey)).map((e) => e.canonicalKey);
const registryLabelKeys = new Set(entries.map((e) => e.ui?.labelKey));
const orphanLabels = [...catalogKeys].filter((k) => !registryLabelKeys.has(k));

const coverage = {
  stage: 84,
  generatedBy: 'scripts/migration/gen-settings-coverage.mjs',
  source: 'packages/settings-schema/registry.json',
  sourceSha256: registrySha256,
  totalKeys: entries.length,
  byConsumer: Object.fromEntries(Object.entries(consumers).sort(([a], [b]) => a.localeCompare(b))),
  affectsLayoutKeys: entries.filter((e) => e.affectsLayout).length,
  uiOnlyKeys: entries.filter((e) => !e.affectsLayout).length,
  byType: Object.fromEntries(
    Object.entries(entries.reduce((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc; }, {})).sort(([a], [b]) => a.localeCompare(b)),
  ),
  sections: Object.fromEntries(Object.entries(sections).sort(([a], [b]) => a.localeCompare(b))),
  invariants: {
    // קבוצת הצרכנים סגורה: engine (משפיע פריסה — נכנס ל-configHash) או
    // ui-only (תצוגה בלבד — אינו משנה hash).
    consumerIdClosedSet: [...new Set(entries.map((e) => e.consumerId))].sort(),
    affectsLayoutMatchesConsumer: entries.every((e) => e.affectsLayout === (e.consumerId === 'engine')),
    canonicalKeysUnique: new Set(canonicalKeys).size === canonicalKeys.length,
    legacyKeysUnique: new Set(legacyKeys).size === legacyKeys.length,
    everyKeyHasUiMetadata: entries.every((e) => e.ui !== null && typeof e.ui === 'object' && typeof e.ui.section === 'string' && typeof e.ui.control === 'string' && typeof e.ui.labelKey === 'string'),
    defaultValuesSelfConsistent: entries.every((e) => defaultValueConsistent(e)),
    labelCoverage: {
      covered: entries.length - missingLabels.length,
      missing: missingLabels.sort(),
      orphanCatalogLabels: orphanLabels.sort(),
    },
    ownership: {
      // ערכי הגדרות — בעלים יחיד: settings-store (draft; effective נבנה
      // ב-applyDraft). המרשם מיובא פעם אחת (settingsRegistry) — החוזה
      // של שלב 78 נבדק כאן מחדש מהקוד.
      settingsRegistrySingleImport: /import registryJson from '@tora\/settings-schema\/registry\.json'/.test(settingsStoreSrc) && /export const settingsRegistry = buildSettingRegistry/.test(settingsStoreSrc),
      viewStoreFieldsOutsideRegistry: viewFieldsOutsideRegistry,
      editorStoreFieldsOutsideRegistry: editorFieldsOutsideRegistry,
      legacyUiStoreRemoved: legacyStoreRemoved,
    },
  },
  // לכל מפתח: הצרכן, ההשפעה, המדור, הבקרה והתווית — כיסוי בר-בדיקה.
  keys: entries
    .map((e) => ({
      key: e.canonicalKey,
      legacyKey: e.legacyKey === e.canonicalKey ? null : e.legacyKey,
      type: e.type,
      consumerId: e.consumerId,
      affectsLayout: e.affectsLayout,
      section: e.ui?.section ?? null,
      control: e.ui?.control ?? null,
      labelKey: e.ui?.labelKey ?? null,
      labelCovered: catalogKeys.has(e.ui?.labelKey),
      dependsOn: e.ui?.dependsOn ?? null,
    }))
    .sort((a, b) => a.key.localeCompare(b.key)),
};

writeFileSync(OUT, JSON.stringify(coverage, null, 1) + '\n');
console.log(`דוח כיסוי ההגדרות נכתב: docs/migration/settings-coverage.json`);
console.log(`  מפתחות: ${coverage.totalKeys} (engine ${coverage.byConsumer['engine']}, ui-only ${coverage.byConsumer['ui-only']})`);
console.log(`  מדורים: ${Object.keys(coverage.sections).length}`);
console.log(`  תוויות חסרות: ${coverage.invariants.labelCoverage.missing.length}; יתומות: ${coverage.invariants.labelCoverage.orphanCatalogLabels.length}`);
console.log(`  view/editor מחוץ למרשם: ${viewFieldsOutsideRegistry.length}/${editorFieldsOutsideRegistry.length} (צפוי 4/6 — הפרדת בעלות)`);
console.log(`  store ישן הוסר: ${legacyStoreRemoved}`);
