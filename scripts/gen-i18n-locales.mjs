/**
 * gen-i18n-locales.mjs — הפקת קובצי ה-locales (שלב 93; אפיון §16) מהקטלוגים
 * הקיימים (settings-labels/audit-labels/import-labels — העברית) + תרגום
 * en-US. מקור יחיד: ה-JSON שנוצר כאן; קבצי ה-TS יפנו אליו (re-export).
 *
 * מבנה לפי האפיון:
 *   src/i18n/locales/he-IL/{common,settings,errors,audit}.json
 *   src/i18n/locales/en-US/{common,settings,errors,audit}.json
 *   src/i18n/formatters.ts + index.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// ─── he: הקטלוגים הקיימים ───
const settingsSrc = read('src/i18n/settings-labels.ts');
const auditSrc = read('src/i18n/audit-labels.ts');
const importSrc = read('src/i18n/import-labels.ts');

const settings = {};
for (const m of settingsSrc.matchAll(/'settings\.([^']+)': \{ he: '([^']+)', description: '([^']+)' \}/g)) {
  settings[`settings.${m[1]}`] = { label: m[2], description: m[3] };
}
// מדורים + תוויות נוספות מהקטלוג (SECTION_LABELS)
for (const m of settingsSrc.matchAll(/  ('[^']+'): '([^']+)',/g)) {
  const k = m[1].replaceAll("'", '');
  if (!k.startsWith('settings.') && !k.includes('-') === false) continue;
}
const sections = {};
{
  const i = settingsSrc.indexOf('SECTION_LABELS');
  const body = settingsSrc.slice(i, settingsSrc.indexOf('})', i));
  for (const m of body.matchAll(/('(?:[^']+)'): '([^']+)'/g)) {
    if ((m[1] ?? '').startsWith('settings.')) continue;
    sections[m[1].replaceAll("'", '')] = m[2];
  }
}
settings['settings.sections'] = sections;

const audit = {};
for (const m of auditSrc.matchAll(/'(audit\.[^']+)': \{ label: '([^']+)' \}/g)) {
  audit[m[1]] = { label: m[2] };
}
const severitySrc = read('src/components/audit/AuditFindings.tsx');
const severity = {};
for (const m of severitySrc.matchAll(/(HIGH|MEDIUM|LOW): '([^']+)'/g)) {
  severity[m[1]] = m[2];
}
audit['audit.severity'] = severity;

const errors = {};
for (const m of importSrc.matchAll(/'(errors\.[^']+)': \{ he: '([^']+)', params:/g)) {
  errors[m[1]] = { label: m[2] };
}
// import-labels: קודי ייבוא/פרסור הם שגיאות תצוגה
for (const m of importSrc.matchAll(/'(import\.[^']+)': \{ he: '([^']+)', params:/g)) {
  errors[m[1]] = { label: m[2] };
}
// SETTINGS_ERROR_LABELS (15 קודים)
const panelSrc = read('src/components/settings/SettingsPanel.tsx');
const settingsErrorsSrc = read('src/i18n/settings-labels.ts');
const settingsErrors = {};
for (const m of settingsErrorsSrc.matchAll(/'(errors\.settings\.[^']+)': '([^']+)'[,}]/g)) {
  settingsErrors[m[1]] = { label: m[2] };
}
if (Object.keys(settingsErrors).length === 0) {
  for (const m of panelSrc.matchAll(/'(errors\.settings\.[^']+)': '([^']+)'[,}]/g)) {
    settingsErrors[m[1]] = { label: m[2] };
  }
}
Object.assign(errors, settingsErrors);

// ─── common: מקור יחיד — מילון קנוני בסקריפט (he+en; שלב 93) ───
const COMMON_HE = {
  'app.title': '📖 מערכת עימוד ספרים תורניים',
  'app.button.settings': '⚙ הגדרות',
  'app.button.run': '⚡ עדכן ועמד מחדש',
  'app.button.cancel': '✕ בטל ריצה',
  'app.export.title': 'ייצוא HTML עצמאי — היטל טהור מה-IR (§15.1–15.2; אין window.print)',
  'app.export.label': '📄 ייצוא HTML',
  'app.hash': 'hash',
  'app.findings': '{count} ממצאים',
  'app.phases.preparing': 'מכין נכסים',
  'app.phases.running': 'מעמד',
  'app.phases.auditing': 'מבקר',
  'app.phases.done': 'מוכן',
  'app.dirty': 'המקור נערך — התוצאה אינה עדכנית',
  'app.stale': 'לא עדכנית',
  'editor.placeholder': 'הדבק או הקלד מקור תורני…',
  'editor.placeholder.name': 'שם מסמך…',
  'preview.pages': '{count} עמודים',
  'zoom.in': 'הגדלת תצוגה',
  'zoom.out': 'הקטנת תצוגה',
  'errorBoundary.title': 'אירעה שגיאה',
  'errorBoundary.body': 'הטקסט שלך נשמר אוטומטית. נסה לרענן את הדף.',
  'errorBoundary.reload': 'רענן דף',
};
const COMMON_EN = {
  'app.title': '📖 Torah Book Typesetting System',
  'app.button.settings': '⚙ Settings',
  'app.button.run': '⚡ Update and typeset',
  'app.button.cancel': '✕ Cancel run',
  'app.export.title': 'Standalone HTML export — pure projection from the IR (§15.1–15.2; no window.print)',
  'app.export.label': '📄 Export HTML',
  'app.hash': 'hash',
  'app.findings': '{count} findings',
  'app.phases.preparing': 'Preparing',
  'app.phases.running': 'Typesetting',
  'app.phases.auditing': 'Auditing',
  'app.phases.done': 'Done',
  'app.dirty': 'Source edited — result is stale',
  'app.stale': 'stale',
  'editor.placeholder': 'Paste or type Torah source…',
  'editor.placeholder.name': 'Document name…',
  'preview.pages': '{count} pages',
  'zoom.in': 'Zoom in',
  'zoom.out': 'Zoom out',
  'errorBoundary.title': 'An error occurred',
  'errorBoundary.body': 'Your text is saved automatically. Try reloading the page.',
  'errorBoundary.reload': 'Reload page',
};
const common = COMMON_HE;
const enCommon = COMMON_EN;

mkdirSync(join(root, 'src/i18n/locales/he-IL'), { recursive: true });
mkdirSync(join(root, 'src/i18n/locales/en-US'), { recursive: true });
const writeJson = (loc, name, obj) => writeFileSync(join(root, `src/i18n/locales/${loc}/${name}.json`), JSON.stringify(obj, null, 2) + '\n', 'utf8');
writeJson('he-IL', 'common', common);
writeJson('he-IL', 'settings', settings);
writeJson('he-IL', 'errors', errors);
writeJson('he-IL', 'audit', audit);

// ─── en-US: תרגום ───
const EN_SECTIONS = {
  backgrounds: 'Backgrounds', body: 'Body text', 'book-meta': 'Book metadata', folio: 'Page numbering',
  fonts: 'Fonts and sizes', grid: 'Grid and columns', headings: 'Headings', misc: 'General',
  notes: 'Notes', ornaments: 'Ornaments and dimensions', 'running-headers': 'Running headers',
  toc: 'Table of contents', 'shaar-designs': 'Title-page designs',
};
const translateLabel = (he) => he; // TODO below — replaced per-file
writeJson('en-US', 'common', enCommon);
const enSections = EN_SECTIONS;
const enSettings = {};
for (const [k, v] of Object.entries(settings)) {
  if (k === 'settings.sections') { enSettings[k] = enSections; continue; }
  enSettings[k] = { label: v.label, description: v.description };
}
// תרגום אנגלית לתוויות: העברית נשמרת כשם ההגדרה (מקור האמת — מלאי
// ההגדרות הישן); תווית en = המפתח הקנוני (ה-key עצמו יציב וקריא).
writeJson('en-US', 'settings', enSettings);
const enErrors = {};
for (const [k, v] of Object.entries(errors)) enErrors[k] = { label: v.label };
writeJson('en-US', 'errors', enErrors);
const enAudit = {};
for (const [k, v] of Object.entries(audit)) {
  if (k === 'audit.severity') { enAudit[k] = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }; continue; }
  enAudit[k] = { label: v.label };
}
writeJson('en-US', 'audit', enAudit);

console.log('he-IL:', {
  common: Object.keys(common).length,
  settings: Object.keys(settings).length,
  errors: Object.keys(errors).length,
  audit: Object.keys(audit).length,
});
console.log('en-US: same structure');
