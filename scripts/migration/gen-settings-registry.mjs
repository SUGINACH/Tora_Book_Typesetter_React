#!/usr/bin/env node
/**
 * gen-settings-registry.mjs — הפקת מרשם ההגדרות ומטריצת ההגדרות (שלב 30).
 *
 * קלט (נעול, assets/settings/ — Orange@93ad1e57):
 *   default_settings.json (248 מפתחות; ברירות המחדל = חוזה ההגדרות),
 *   setting_sets/{פרשנות,קונטרס,תלמוד}.json (פריסטים — עדות לטווחי הערכים),
 *   LAYOUT_DEPENDENCY_MAP.md (השרשרת: הגדרות עמוד → מידות → גובה/רוחב זמינים).
 *
 * פלט: packages/settings-schema/registry.json + docs/migration/settings-matrix.md.
 * דטרמיניסטי לחלוטין: אותם קלטים ⇐ אותו פלט ביט-ביט (מיון מפתחות קבוע).
 *
 * כללי הסיווג (מתועדים במטריצה):
 *   UI-only (אינם נכנסים ל-EffectiveSettings/configHash): inp-*, style-set-select,
 *   active-theme-select, enable-shaar-box-editor — קלט משתמש חולף/מצב עורך.
 *   כל השאר affectsLayout=true (עקרון זהירות: היעדר מ-configHash גורם להחמצת
 *   שינוי פריסה; תיוג שווא רק מרעיש) — לרבות show/enable/select של שערים ו־TOC
 *   (הפעלה/ביטול משנה את מספר העמודים ואת תוכן העימוד).
 *   טיפוסים נגזרים מתחומי הערכים הנצפים (default+פריסטים); enum = הערכים
 *   שנצפתו בלבד (ערך שלא נצפה ← דחייה מפורשת, לא החלפה שקטה).
 *   'window' של drop-word-mode נשמר כערך legacy חוקי (אין המרה אוטומטית).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(repoRoot, 'assets', 'settings');
const sha = (name) => createHash('sha256').update(readFileSync(join(dir, name))).digest('hex');

const ORANGE = 'SUGINACH/Tora_Book_Typesetter_Orange@93ad1e5704405fb2806a126ea1b519a35a87f378';
const DEFAULT = JSON.parse(readFileSync(join(dir, 'default_settings.json'), 'utf8'));
const PRESET_NAMES = ['פרשנות', 'קונטרס', 'תלמוד'];
const PRESETS = Object.fromEntries(PRESET_NAMES.map((n) => [n, JSON.parse(readFileSync(join(dir, 'setting_sets', `${n}.json`), 'utf8'))]));

const LOCK = {
  defaultSettings: sha('default_settings.json'),
  presetParshanuth: sha('setting_sets/פרשנות.json'),
  presetKonteres: sha('setting_sets/קונטרס.json'),
  presetTalmud: sha('setting_sets/תלמוד.json'),
  layoutDependencyMap: sha('LAYOUT_DEPENDENCY_MAP.md'),
};

// ── UI-only קבוע (מתועד למעלה) ──
const isUiOnly = (k) => k.startsWith('inp-') || k === 'style-set-select'
  || k === 'active-theme-select' || k === 'enable-shaar-box-editor';

// ── הסקת טיפוס מתחום הערכים הנצפים ──
const DIM_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(px|em|%|pt|rem)$/;
const NUM_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function classify(key, values) {
  if (key.startsWith('inp-')) return { type: 'string', enum: null, unit: null }; // טקסט חופשי — אינו enum
  const strs = values.map((v) => String(v));
  const bools = values.filter((v) => typeof v === 'boolean');
  if (bools.length === values.length && values.length > 0) return { type: 'boolean', enum: null, unit: null };
  const nonEmpty = strs.filter((s) => s !== '');
  if (nonEmpty.length > 0 && nonEmpty.every((s) => s === 'true' || s === 'false')) {
    return { type: 'boolean', enum: null, unit: null };
  }
  if (nonEmpty.length > 0 && nonEmpty.every((s) => NUM_RE.test(s))) {
    return { type: 'number', enum: null, unit: null };
  }
  if (nonEmpty.length > 0 && nonEmpty.every((s) => DIM_RE.test(s))) {
    const units = new Set(nonEmpty.map((s) => DIM_RE.exec(s)[1]));
    return { type: 'dimension', enum: null, unit: [...units].sort().join('|') };
  }
  if (nonEmpty.length > 0 && nonEmpty.every((s) => HEX_COLOR_RE.test(s))) {
    return { type: 'color', enum: null, unit: null };
  }
  if (key.startsWith('f-') || key.startsWith('font-')) {
    return { type: 'font-stack', enum: null, unit: null };
  }
  // enum: תחום סגור של ערכים לא-מספריים קצרים (≤5 ערכים נצפים, לא מספריים ולא ריקים)
  const uniq = [...new Set(nonEmpty)];
  if (uniq.length > 0 && uniq.length <= 6 && uniq.every((s) => s.length <= 24) && !uniq.some((s) => NUM_RE.test(s))) {
    return { type: 'enum', enum: [...uniq].sort(), unit: null };
  }
  return { type: 'string', enum: null, unit: null };
}

// ── קבוצת UI/מדור לתצוגה ──
const sectionOf = (key) => {
  if (key.startsWith('inp-') || key === 'style-set-select') return 'book-meta';
  if (key.startsWith('select-shaar-') || key.startsWith('builder-') || key.startsWith('data-builder-')) return 'shaar';
  if (key.startsWith('cbg-') || key.startsWith('data-cbg-')) return 'backgrounds';
  if (key.startsWith('hdr-')) return 'running-headers';
  if (key.startsWith('f-') || key.startsWith('font-')) return key.includes('note') ? 'notes' : 'fonts';
  if (key.startsWith('s-') || key.startsWith('size-')) return key.includes('note') || key.includes('dtoc') || key.includes('gtoc') ? (key.includes('toc') ? 'toc' : 'notes') : (key.includes('toc') ? 'toc' : 'fonts');
  if (key.startsWith('mode-h')) return 'headings';
  if (key.startsWith('h2-') || key.startsWith('h3-') || key.startsWith('odd-h')) return 'headings';
  if (key.startsWith('fn-') || key.startsWith('note-') || key.startsWith('en-line')) return 'notes';
  if (key.startsWith('page-num')) return 'folio';
  if (key.startsWith('prop-')) return 'grid';
  if (key.startsWith('dim-')) return 'ornaments';
  if (key.startsWith('drop-word') || key.startsWith('avoid-') || key.startsWith('body-') || key.startsWith('line-height') || key.startsWith('auto-')) return 'body';
  if (key.includes('toc')) return 'toc';
  if (key.includes('shaar')) return 'shaar';
  return 'misc';
};

const controlOf = (t) => (t === 'boolean' ? 'checkbox' : t === 'enum' ? 'select' : t === 'dimension' || t === 'color' || t === 'font-stack' ? 'text' : 'text');

// ── בניית הרשומות — איחוד מפתחות: default ∪ פריסטים (השוואה דו-כיוונית, §6.3) ──
const ALL_KEYS = [...new Set([
  ...Object.keys(DEFAULT),
  ...PRESET_NAMES.flatMap((n) => Object.keys(PRESETS[n])),
])].sort();
const PRESET_ONLY_UI = (k) => k.startsWith('file-'); // בוררי קבצים — מצב UI; התוכן שלהם נשמר ב-data-*
const entries = [];
for (const key of ALL_KEYS) {
  const inDefaults = key in DEFAULT;
  const observed = [DEFAULT[key], ...PRESET_NAMES.map((n) => PRESETS[n][key]).filter((v) => v !== undefined)].filter((v) => v !== undefined);
  const { type, enum: enumValues, unit } = classify(key, observed);
  const uiOnly = isUiOnly(key) || (PRESET_ONLY_UI(key) && !(key in DEFAULT));
  const defaultValue = key in DEFAULT ? DEFAULT[key] : PRESETS[PRESET_NAMES.find((n) => key in PRESETS[n])][key];
  const source = key in DEFAULT ? `${ORANGE}:default_settings.json` : `${ORANGE}:setting_sets`;
  entries.push({
    legacyKey: key,
    canonicalKey: key, // זהות שם בשלב זה — מיפוי שאינו זהה בשם/טיפוס יינעל כאן כשיידרש (תכנית שלב 30)
    schemaVersion: 1,
    source,
    fileSha256: LOCK.defaultSettings,
    defaultValue,
    type,
    enum: enumValues,
    unit,
    affectsLayout: !uiOnly,
    consumerId: uiOnly ? 'ui-only' : (sectionOf(key) === 'book-meta' ? 'ui-only' : 'engine'),
    ui: { section: sectionOf(key), control: controlOf(type), labelKey: `settings.${key}` },
  });
}

const registry = {
  schemaVersion: 1,
  generatedBy: 'scripts/migration/gen-settings-registry.mjs',
  source: ORANGE,
  sourceSha256: LOCK,
  totalKeys: entries.length,
  uiOnlyKeys: entries.filter((e) => e.consumerId === 'ui-only').length,
  affectsLayoutKeys: entries.filter((e) => e.affectsLayout).length,
  settings: entries,
};

writeFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`);

// ── מטריצת ההגדרות (docs/migration/settings-matrix.md) ──
const groups = new Map();
for (const e of entries) {
  if (!groups.has(e.ui.section)) groups.set(e.ui.section, []);
  groups.get(e.ui.section).push(e);
}
const byKey = (a, b) => a.legacyKey.localeCompare(b.legacyKey);
const lines = [];
lines.push('# מטריצת ההגדרות — מרשם מלא מהמלאי הנעול (שלב 30)');
lines.push('');
lines.push(`**מקור:** ${ORANGE} · default_settings.json (SHA-256 ${LOCK.defaultSettings.slice(0, 16)}…) + שלושה פריסטים + LAYOUT_DEPENDENCY_MAP.md.`);
lines.push(`**היקף:** ${entries.length} מפתחות — ${registry.affectsLayoutKeys} משפיעי פריסה, ${registry.uiOnlyKeys} UI-only (אינם נכנסים ל־EffectiveSettings/configHash).`);
lines.push('**כללי סיווג:** (א) UI-only = קלט משתמש חולף/מצב עורך בלבד (inp-*, style-set-select, active-theme-select, enable-shaar-box-editor); (ב) כל השאר affectsLayout=true מעקרון הזהירות — היעדר מ-configHash גורם להחמצת שינוי פריסה, תיוג שווא רק מרעיש; (ג) טיפוס/enum נגזרים מתחומי הערכים שנצפתו (default+פריסטים) — ערך שלא נצפה נדחה בפירוש (path+קוד), אינו מוחלף בשקט; (ד) drop-word-mode:"window" נשמר כערך legacy חוקי — אין המרה אוטומטית.');
lines.push('');
lines.push('| מפתח legacy | טיפוס | ברירת מחדל (מקור) | enum | יחידה | affectsLayout | consumer | מדור UI |');
lines.push('|---|---|---|---|---|---|---|---|');
for (const [, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  for (const e of [...list].sort(byKey)) {
    const def = typeof e.defaultValue === 'boolean' ? String(e.defaultValue) : JSON.stringify(e.defaultValue);
    lines.push(`| \`${e.legacyKey}\` | ${e.type} | ${def} | ${e.enum ? e.enum.map((v) => `\`${v}\``).join(', ') : '—'} | ${e.unit ?? '—'} | ${e.affectsLayout ? '✓' : '—'} | ${e.consumerId} | ${e.ui.section}/${e.ui.control} |`);
  }
}
lines.push('');
lines.push('## החלטות זניחה/מיפוי');
lines.push('');
lines.push('- אין מפתח שנזנח בשלב זה: כל 248 המפתחות מיובאים או נדחים בפירוש (path+קוד).');
lines.push('- מיפוי שאינו זהה בשם או בטיפוס יינעל כאן כשיידרש — עד אז canonicalKey === legacyKey.');
writeFileSync(join(repoRoot, 'docs', 'migration', 'settings-matrix.md'), `${lines.join('\n')}\n`);

console.log(`registry.json: ${entries.length} מפתחות (${registry.affectsLayoutKeys} פריסה, ${registry.uiOnlyKeys} UI-only); settings-matrix.md נכתב`);
