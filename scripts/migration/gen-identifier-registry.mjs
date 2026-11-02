#!/usr/bin/env node
/**
 * gen-identifier-registry — הפקת נגזרות מרשם המזהים (שלב 17).
 *
 * מקור אחד: docs/migration/identifiers.json (מוקפא). הסקריפט מפיק ממנו:
 *   1. packages/content-model/src/parser/registry-data.ts — נתוני התחביר
 *      שהפרסר צורך בפועל (בנויים בזמן יצירה מה־JSON; יציבים ודטרמיניסטיים).
 *   2. docs/migration/identifiers.md — המסמך הקריא לבני אדם.
 *
 * סנכרון נאכף: המאמת (verify-parser.mjs) מריץ את הסקריפט הזה ומשווה
 * ביט-ביט — עריכה ידנית של הנגזרות נתפסת.
 *
 * שימוש: node scripts/migration/gen-identifier-registry.mjs
 * יציאה: 0 = נכתב; 1 = שגיאה.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(repoRoot, 'docs', 'migration', 'identifiers.json');
const TS_OUT = join(repoRoot, 'packages', 'content-model', 'src', 'parser', 'registry-data.ts');
const MD_OUT = join(repoRoot, 'docs', 'migration', 'identifiers.md');

const registry = JSON.parse(readFileSync(SRC, 'utf8'));

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

// ─────────────────────────── 1. registry-data.ts ───────────────────────────
const tsLines = [];
tsLines.push('/**');
tsLines.push(' * registry-data.ts — נתוני מרשם המזהים והתוחמים — נוצר אוטומטית (שלב 17).');
tsLines.push(' *');
tsLines.push(' * מקור הסמכות: docs/migration/identifiers.json (מוקפא).');
tsLines.push(' * יצירה: node scripts/migration/gen-identifier-registry.mjs');
tsLines.push(' * אין לערוך ידנית — המאמת משווה ביט-ביט מול ה־JSON.');
tsLines.push(' */');
tsLines.push('');
tsLines.push("export const REGISTRY_SCHEMA_VERSION = " + JSON.stringify(registry.schemaVersion) + " as const;");
tsLines.push("export const REGISTRY_FROZEN_AT = " + JSON.stringify(registry.frozenAt) + " as const;");
tsLines.push('');
tsLines.push('/** רשומת מרשם אחת — כמו ב־identifiers.json (סוג נוחא לקריאה). */');
tsLines.push('export interface IdentifierRecord {');
tsLines.push('  readonly recordId: string;');
tsLines.push('  readonly category: string;');
tsLines.push('  readonly legacyId: string;');
tsLines.push('  readonly status: string;');
tsLines.push('  readonly syntax: {');
tsLines.push('    readonly kind: string;');
tsLines.push('    readonly pattern?: string;');
tsLines.push('    readonly flags?: string;');
tsLines.push('    readonly prefix?: string;');
tsLines.push('    readonly open?: string;');
tsLines.push('    readonly close?: string;');
tsLines.push('    readonly [key: string]: unknown;');
tsLines.push('  };');
tsLines.push('  readonly stream: string;');
tsLines.push('  readonly precedence: number;');
tsLines.push('  readonly fixtureId: string;');
tsLines.push('  readonly mapping: { readonly target: string; readonly detail: string };');
tsLines.push('  readonly policyStage?: number;');
tsLines.push('}');
tsLines.push('');
tsLines.push("export const IDENTIFIER_RECORDS: readonly IdentifierRecord[] = Object.freeze([");
for (const r of registry.records) {
  tsLines.push('  Object.freeze({');
  tsLines.push(`    recordId: ${JSON.stringify(r.recordId)},`);
  tsLines.push(`    category: ${JSON.stringify(r.category)},`);
  tsLines.push(`    legacyId: ${JSON.stringify(r.legacyId)},`);
  tsLines.push(`    status: ${JSON.stringify(r.status)},`);
  tsLines.push('    syntax: Object.freeze({');
  for (const [k, v] of Object.entries(r.syntax)) {
    tsLines.push(`      ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  }
  tsLines.push('    }),');
  tsLines.push(`    stream: ${JSON.stringify(r.stream)},`);
  tsLines.push(`    precedence: ${r.precedence},`);
  tsLines.push(`    fixtureId: ${JSON.stringify(r.fixtureId)},`);
  tsLines.push(`    mapping: Object.freeze({ target: ${JSON.stringify(r.mapping.target)}, detail: ${JSON.stringify(r.mapping.detail)} }),`);
  if (r.policyStage !== undefined) {
    tsLines.push(`    policyStage: ${r.policyStage},`);
  }
  tsLines.push('  }),');
}
tsLines.push(']);');
tsLines.push('');
tsLines.push('/** מפת הקדימויות — סדר הצינור הישן נשמר במדויק. */');
tsLines.push('export const PIPELINE_STAGES: readonly string[] = Object.freeze(');
tsLines.push('  ' + JSON.stringify(registry.precedence.pipelineStages, null, 2).replace(/\n/g, '\n  '));
tsLines.push(');');
tsLines.push('');

const ts = tsLines.join('\n');
mkdirSync(dirname(TS_OUT), { recursive: true });
writeFileSync(TS_OUT, ts + '\n', 'utf8');

// ─────────────────────────── 2. identifiers.md ───────────────────────────
const md = [];
md.push('# מרשם מזהי הטקסט ותוחמי הקלט — הישן → חדש (שלב 17)');
md.push('');
md.push('**מקור הסמכות:** `docs/migration/identifiers.json` (מוקפא, machine-readable) — מסמך זה מופק ממנו בלבד.');
md.push('**הפקה:** `node scripts/migration/gen-identifier-registry.mjs` · אין לערוך ידנית.');
md.push(`**הוקפא:** ${registry.frozenAt} · **רשומות:** ${registry.records.length} · ${registry.authority}`);
md.push('');
md.push('**מטרה:** תאימות קלט מושלמת ומוכחת מול מקור מלא — אותו קובץ טקסט ישן ייפרסר לאותם בלוקים, כותרות, הערות, סגנונות ו־metadata, בלי placeholder חצי־סמנטי ובלי אטום אבוד.');
md.push('');
md.push('## סדר הסריקה והקדימויות');
md.push('');
md.push('סדר הצינור הישן (React lock `src/parser/index.ts`) נשמר במדויק:');
md.push('');
for (const s of registry.precedence.pipelineStages) md.push(`${s}`);
md.push('');
md.push(`- **לפי שורה:** ${registry.precedence.perLine}`);
md.push(`- **בתוך שורה:** ${registry.precedence.inline}`);
md.push(`- **כלל הכרעה:** ${registry.precedence.conflictRule}`);
md.push('');
md.push('## היקף הסריקה');
md.push('');
md.push(registry.scanScope.method + '.');
md.push('');
md.push('| מקור נעול | תפקיד בסריקה | קבצים |');
md.push('|---|---|---|');
for (const s of registry.scanScope.lockedSources) {
  md.push(`| ${s.id} | ${s.role} | \`${s.files}\` |`);
}
md.push('');
md.push('## רשומות המרשם');
md.push('');
const byCat = {};
for (const r of registry.records) (byCat[r.category] ??= []).push(r);
const catTitles = {
  'block-rule': 'כללי בלוק (מבנה הקלט)',
  'line-marker': 'מזהי שורה',
  'inline-delimiter': 'תוחמים בתוך שורה',
  'parser-behavior': 'התנהגויות פרסר (חשבונאות תווים)',
  'structure': 'מבנה ומשמעות (מספור, שערים)',
  'settings-driven': 'מונעי הגדרות/נכסים — ביתם בשלב מאוחר',
  'layout-computed': 'מחושבי פריסה',
  'generated': 'תוכן נגזר',
  'asset': 'נכסים',
  'page-furniture': 'ריהוט עמוד',
  'negative': 'כללים שליליים (איסורים)',
};
for (const [cat, recs] of Object.entries(byCat)) {
  md.push(`### ${catTitles[cat] ?? cat}`);
  md.push('');
  for (const r of recs) {
    md.push(`#### \`${r.recordId}\``);
    md.push('');
    md.push(`- **מזהה בישן:** ${r.legacyId}`);
    md.push(`- **סטטוס:** ${r.status} · **זרם:** ${r.stream} · **קדימות:** ${r.precedence}`);
    if (r.syntax.kind === 'regex' && r.syntax.pattern) {
      md.push(`- **תחביר:** \`${r.syntax.pattern}\`${r.syntax.flags ? ` (flags: ${r.syntax.flags})` : ''}`);
    } else if (r.syntax.kind === 'prefix' && r.syntax.prefix) {
      md.push(`- **תחביר:** קידומת \`${r.syntax.prefix}\``);
    } else if (r.syntax.kind === 'delimiters' && r.syntax.open) {
      md.push(`- **תחביר:** תוחמים \`${r.syntax.open}\` … \`${r.syntax.close}\``);
    } else if (r.syntax.kind === 'rule' && r.syntax.example) {
      md.push(`- **דוגמה:** \`${r.syntax.example}\``);
    }
    if (r.syntax.note) md.push(`- **הערת תחביר:** ${r.syntax.note}`);
    if (r.syntax.configurable) md.push(`- **ניתן להגדרה:** ${r.syntax.configurable}`);
    md.push(`- **מיפוי:** ${r.mapping.target} — ${r.mapping.detail}${r.policyStage ? ` (שלב ${r.policyStage})` : ''}`);
    md.push(`- **fixture:** \`packages/test-fixtures/corpus/identifiers/${r.fixtureId}.txt\``);
    md.push('- **מקורות:**');
    for (const s of r.sources) {
      md.push(`  - ${s.repo} @ ${s.commit.slice(0, 8)} · \`${s.path}\` שורות ${s.lines} · sha256 \`${s.sha256.slice(0, 16)}…\``);
    }
    if (r.edgeCases.length > 0) {
      md.push('- **מקרי קצה:**');
      for (const e of r.edgeCases) {
        md.push(`  - **${e.case}** — ישן: ${e.legacyBehavior} · חדש: ${e.newBehavior} · החלטה: ${e.decision}`);
      }
    }
    md.push('');
  }
}
md.push('---');
md.push('');
md.push('**חוזה החשבונאות (שער השלב):** כל תו במקור מסווג בדיוק לאחת מהקטגוריות: אטום תוכן (איזה זרם שהוא), ערך metadata, syntax span (מזהה/תוחם/מפריד/קיצוץ), או explicit-break. אין רווחים, אין חפיפות בין קטגוריות, ואין תו שנעלם בשקט; כל הסרה נרשמת בספר הטרנספורמציות.');
md.push('');

mkdirSync(dirname(MD_OUT), { recursive: true });
writeFileSync(MD_OUT, md.join('\n') + '\n', 'utf8');

console.log(`OK: ${registry.records.length} records`);
console.log(`  -> ${TS_OUT}`);
console.log(`  -> ${MD_OUT}`);
