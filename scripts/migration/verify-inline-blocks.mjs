#!/usr/bin/env node
/**
 * verify-inline-blocks — אימות InlineItem, ContentBlock, מסגרת המסמך
 * ומסמך המיפוי מהישן (שלב 16).
 * אסמכתא: אפיון §3.1, §3.3, §6.2 · תכנית 100 השלבים, שלב 16.
 *
 * בדיקות:
 *   1. מבנה: ה־API הציבורי של content-model חשוף דרך ה־index בלבד.
 *   2. זמן ריצה: ששת סוגי ה־InlineItem; בלוקים רקורסיביים עם גזירת
 *      מזהים; מסמך מלא parts←simanim←blocks + ארבעה זרמי הערות;
 *      round-trip ביט-ביט; דחיות מאומתות בזמן יצירה.
 *   3. סריקות אכיפה: אין אקראיות/זמן/DOM/מונים; כל מפתח קטלוגי רשום;
 *      טוהר ייבוא; אין sentinel תוכן (\u0001/\u0002) בקוד המודל.
 *   4. כיסוי טבלת i18n + מסמך המיפוי מכסה את כל טיפוסי הישן.
 *   5. רגרסיה: test:packages, build, typecheck, lint, deps.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 * תלויות: אפס (Node 22 בלבד).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };
const run = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: repoRoot, stdio: 'pipe' }); return 0; } catch { return 1; }
};

// ---------- 1. מבנה ----------
console.log('1) מבנה: API ציבורי דרך index בלבד');
const cm = await import('@tora/content-model');
const REQUIRED_EXPORTS = [
  'INLINE_ITEM_KINDS', 'isInlineItem', 'makeAnchorItem', 'makeExplicitBreak', 'makeInlineBox',
  'makeMarker', 'makeNoteReference', 'makeTextItem',
  'BLOCK_ROLES', 'HEADING_LEVELS', 'MAX_BLOCK_DEPTH', 'blockDepth', 'deriveAnchorId',
  'deriveNodeId', 'isContentBlock', 'makeContentBlock',
  'LEGACY_METADATA_KEYS', 'NOTE_KINDS', 'SHAAR_DESIGNS', 'allBlocks', 'findOrphanNotes',
  'isTorahDocument', 'makeTorahDocument', 'parseDocument', 'serializeDocument',
];
for (const name of REQUIRED_EXPORTS) {
  (name in cm ? ok : fail)(`ייצוא: ${name}`);
}
(cm.contentModelErrorCatalogSize() === 58 ? ok : fail)(`קטלוג content-model: ${cm.contentModelErrorCatalogSize()} קודים (בדיוק 58: 8 span + 19 atom + 5 inline + 12 block + 14 document)`);

// ---------- 2. זמן ריצה ----------
console.log('\n2) זמן ריצה: inline, בלוקים, מסמך ו־round-trip');
const DOC = 'tora-canonical';
const body = (s, e) => cm.makeSourceSpan(DOC, 'body', s, e);
const atom = (t, s) => cm.makeTextAtom(t, body(s, s + t.length));
{
  // ששת סוגי ה-inline
  const text = cm.makeTextItem([atom('אמר', 0), atom(' ', 3), atom('רבא', 4)]);
  const ref = cm.makeNoteReference('fn-1', body(10, 12));
  const anchor = cm.makeAnchorItem(cm.deriveAnchorId(body(20, 30)), body(20, 30));
  const brk = cm.makeExplicitBreak(body(40, 40));
  const box = cm.makeInlineBox('box-1', body(50, 60));
  const marker = cm.makeMarker('drop-word', body(70, 74));
  const allKinds = [text, ref, anchor, brk, box, marker].every((i) => cm.isInlineItem(i));
  (allKinds && cm.INLINE_ITEM_KINDS.length === 6 ? ok : fail)('ששת סוגי ה־InlineItem נבנים ועוברים בדיקה מבנית');
}
{
  // בלוקים רקורסיביים: H2 עם ילדים כמו ast-builder הישן
  const para = cm.makeContentBlock({
    role: 'body',
    source: body(0, 20),
    inline: [cm.makeTextItem([atom('פסקה', 0)])],
  });
  const h2 = cm.makeContentBlock({
    role: 'heading',
    headingLevel: 2,
    source: body(0, 25),
    inline: [cm.makeTextItem([atom('סימן א', 21)])],
    children: [para],
  });
  (cm.isContentBlock(h2) && cm.blockDepth(h2) === 2 && h2.styleId === 'heading-2'
    ? ok : fail)('ContentBlock רקורסיבי: H2 עם ילדים, מזהה נגזר node:v1');
  (cm.deriveNodeId(body(5, 9)) === cm.deriveNodeId(body(5, 9)) &&
    cm.deriveAnchorId(body(5, 9)).startsWith('anchor:v1|')
    ? ok : fail)('גזירת NodeId/AnchorId דטרמיניסטית');
}
function buildSample() {
  const paragraph = cm.makeContentBlock({
    role: 'body',
    source: body(0, 30),
    inline: [
      cm.makeTextItem([atom('אמר רבא', 0)]),
      cm.makeNoteReference('fn-1', body(12, 14)),
      cm.makeTextItem([atom('כך', 16)]),
    ],
  });
  const h2 = cm.makeContentBlock({
    role: 'heading',
    headingLevel: 2,
    source: body(0, 30),
    inline: [cm.makeTextItem([atom('סימן', 25)])],
    children: [paragraph],
  });
  const fnBody = cm.makeContentBlock({
    role: 'note-body',
    source: cm.makeSourceSpan(DOC, 'footnote', 0, 6),
    inline: [cm.makeTextItem([cm.makeTextAtom('הערה', cm.makeSourceSpan(DOC, 'footnote', 0, 4))])],
  });
  return cm.makeTorahDocument({
    schemaVersion: 1,
    documentId: DOC,
    metadata: [{ key: 'שם הספר', value: 'דוגמה', source: cm.makeSourceSpan(DOC, 'metadata', 0, 5) }],
    parts: [
      {
        id: cm.makeNodeId('part-1'),
        title: 'חלק',
        simanim: [
          {
            id: cm.makeNodeId('siman-1'),
            simanNumber: 1,
            shaarDesign: 'main',
            blocks: [h2],
          },
        ],
      },
    ],
    notes: {
      footnotes: [{ noteId: 'fn-1', kind: 'footnote', block: fnBody }],
      endnotes: [], sidenotes: [], editorial: [],
    },
    customStyleIds: [],
    sourceHash: '',
    sourceLength: 40,
  });
}
{
  const doc = buildSample();
  const json = cm.serializeDocument(doc);
  const restored = cm.parseDocument(json);
  (cm.isTorahDocument(doc) && cm.allBlocks(doc).length >= 3
    ? ok : fail)('מסמך מלא: parts←simanim←blocks + זרם הערות + metadata');
  (JSON.stringify(restored) === json && cm.serializeDocument(buildSample()) === json
    ? ok : fail)('round-trip ביט-ביט: serialize→parse→serialize ובנייה כפולה — אותה מחרוזת');
  (cm.findOrphanNotes(doc).length === 0 ? ok : fail)('הפניות לזרמי הערות נפתרות (fn-1 קיים)');
  const orphanDoc = cm.makeTorahDocument({
    ...doc,
    notes: {
      ...doc.notes,
      endnotes: [
        {
          noteId: 'en-orphan',
          kind: 'endnote',
          block: cm.makeContentBlock({ role: 'note-body', source: cm.makeSourceSpan(DOC, 'endnote', 0, 4) }),
        },
      ],
    },
  });
  (cm.findOrphanNotes(orphanDoc).includes('en-orphan')
    ? ok : fail)('הערה יתומה מדווחת — לא נבלעת בשקט');
}
{
  const expectThrow = (key, fn) => {
    try { fn(); fail(`היה צפוי ${key}`); }
    catch (e) {
      (e instanceof cm.ContentModelError && e.catalogKey === key && cm.isRegisteredContentModelErrorKey(key)
        ? ok : fail)(`דחייה בזמן יצירה: ${key}`);
    }
  };
  expectThrow('errors.block.HEADING_LEVEL_REQUIRED', () =>
    cm.makeContentBlock({ role: 'heading', source: body(0, 4) }));
  expectThrow('errors.block.HEADING_LEVEL_FORBIDDEN', () =>
    cm.makeContentBlock({ role: 'body', headingLevel: 3, source: body(0, 4) }));
  expectThrow('errors.block.INVALID_HEADING_LEVEL', () =>
    cm.makeContentBlock({ role: 'heading', headingLevel: 9, source: body(0, 4) }));
  expectThrow('errors.block.DUPLICATE_NODE_ID', () => {
    const block = cm.makeContentBlock({ role: 'body', source: body(0, 4) });
    return cm.makeTorahDocument({
      ...buildSample(),
      parts: [{ ...buildSample().parts[0], simanim: [{ ...buildSample().parts[0].simanim[0], blocks: [block, block] }] }],
    });
  });
  expectThrow('errors.inline.MIXED_STREAMS', () =>
    cm.makeTextItem([
      cm.makeTextAtom('א', body(0, 1)),
      cm.makeTextAtom('ב', cm.makeSourceSpan(DOC, 'footnote', 0, 1)),
    ]));
  expectThrow('errors.inline.INVALID_ID', () => cm.makeNoteReference('', body(0, 2)));
  const doc = buildSample();
  expectThrow('errors.document.UNRESOLVED_NOTE_REFERENCE', () =>
    cm.makeTorahDocument({
      ...doc,
      parts: [
        {
          ...doc.parts[0],
          simanim: [
            {
              ...doc.parts[0].simanim[0],
              blocks: [
                cm.makeContentBlock({
                  role: 'body',
                  source: body(100, 110),
                  inline: [cm.makeNoteReference('fn-404', body(100, 102))],
                }),
              ],
            },
          ],
        },
      ],
    }));
  expectThrow('errors.document.DUPLICATE_METADATA_KEY', () =>
    cm.makeTorahDocument({
      ...doc,
      metadata: [...doc.metadata, { key: 'שם הספר', value: 'x', source: cm.makeSourceSpan(DOC, 'metadata', 9, 10) }],
    }));
  expectThrow('errors.document.INVALID_SIMAN_NUMBER', () =>
    cm.makeTorahDocument({
      ...doc,
      parts: [{ ...doc.parts[0], simanim: [{ ...doc.parts[0].simanim[0], simanNumber: 0 }] }],
    }));
  expectThrow('errors.document.INVALID_SOURCE_HASH', () =>
    cm.makeTorahDocument({ ...doc, sourceHash: 'zz' }));
  expectThrow('errors.document.NOT_A_DOCUMENT', () => cm.parseDocument('{oops'));
}
(cm.LEGACY_METADATA_KEYS.length === 10 && cm.LEGACY_METADATA_KEYS.includes('שם הספר') &&
  cm.LEGACY_METADATA_KEYS.includes('פרטים נוספים')
  ? ok : fail)('עשרת מפתחות ה־metadata ההכרחיים מהישן רשומים');
(cm.SHAAR_DESIGNS.length === 3 && cm.NOTE_KINDS.length === 4
  ? ok : fail)('עיצובי שער (main/back/sub) וארבעה זרמי הערות');

// ---------- 3. סריקות אכיפה ----------
console.log('\n3) סריקות אכיפה: דטרמיניזם, טוהר ואיסור sentinel');
const srcDir = join(repoRoot, 'packages', 'content-model', 'src');
const srcFiles = [];
const scan = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.ts')) srcFiles.push(p);
  }
};
scan(srcDir);
const stripLiterals = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  .replace(/`(?:[^`\\$]|\\.|\$\{[^}]*\})*`/g, '``');
const forbiddenPatterns = [
  [/Math\.random/, 'Math.random'],
  [/crypto\.randomUUID|uuid\/v4/, 'UUID אקראי'],
  [/Date\.now|new Date\s*\(/, 'תלות בזמן'],
  [/\bwindow\b/, 'גלובל window'],
  [/\bdocument\b/, 'גלובל document'],
  [/\+\+ *[a-z]*count|\bcounter\b * *= * *0/, 'מונה גלובלי'],
];
let violations = 0;
for (const f of srcFiles) {
  const text = stripLiterals(readFileSync(f, 'utf8'));
  for (const [re, label] of forbiddenPatterns) {
    if (re.test(text)) { violations++; fail(`${f.split('packages/')[1]}: אסור ${label}`); }
  }
  for (const m of readFileSync(f, 'utf8').matchAll(/'(errors\.[a-z]+\.[A-Z0-9_]+)'/g)) {
    if (!cm.isRegisteredContentModelErrorKey(m[1])) { violations++; fail(`מפתח לא רשום בקטלוג: ${m[1]}`); }
  }
  // איסור sentinel תוכן בקוד המודל (אפיון §6.2; השלד הישן השתמש בו)
  if (/\\u000[12]/.test(stripLiterals(readFileSync(f, 'utf8')))) {
    violations++; fail(`${f.split('packages/')[1]}: sentinel תוכן \u0001/\u0002 אסור במודל`);
  }
}
(violations === 0 ? ok : fail)('content-model: אין אקראיות/זמן/DOM/מונים; כל מפתח רשום; אין sentinel');
let importImpure = 0;
for (const f of srcFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (spec.startsWith('node:') || spec.startsWith('@tora/') && spec !== '@tora/content-model') importImpure++;
  }
}
(importImpure === 0 ? ok : fail)('content-model/src: אין ייבוא node: או @tora/* אחר (חבילת שורש בגרף)');

// ---------- 4. i18n ומסמך המיפוי ----------
console.log('\n4) טבלת i18n ומסמך המיפוי');
const tablePath = join(repoRoot, 'docs', 'i18n', 'error-keys.md');
(existsSync(tablePath) ? ok : fail)('docs/i18n/error-keys.md קיים');
if (existsSync(tablePath)) {
  const table = readFileSync(tablePath, 'utf8');
  const keys = Object.keys(cm.CONTENT_MODEL_ERROR_CATALOG);
  const missing = keys.filter((k) => !table.includes(`\`${k}\``));
  (missing.length === 0
    ? ok : fail)(`הטבלה מכסה את כל ${keys.length} מפתחות content-model${missing.length ? ' — חסרים: ' + missing.join(', ') : ''}`);
}
const mappingPath = join(repoRoot, 'docs', 'migration', 'content-model-mapping.md');
(existsSync(mappingPath) ? ok : fail)('docs/migration/content-model-mapping.md קיים');
if (existsSync(mappingPath)) {
  const mapping = readFileSync(mappingPath, 'utf8');
  const legacyTypes = [
    'body', 'drop-word', 'dibbur-hamatchil', 'heading', 'footnote', 'footnote-marker',
    'endnote', 'endnote-marker', 'side-note', 'editorial-note', 'metadata', 'page-number',
    'running-header', 'section-divider', 'paren-text', 'custom',
    'ParsedDocument', 'ParsedNode', 'BookMetadata', 'noteRules', 'customStyles',
    'LayoutMode', 'TextPosition', 'PageType', 'ColumnLayout', 'simanNumber', 'subNumber',
    'sourceLine', 'children', 'customStyleId', 'sourceHash',
  ];
  const missingTypes = legacyTypes.filter((t) => !mapping.includes(t));
  (missingTypes.length === 0
    ? ok : fail)(`מסמך המיפוי מכסה את כל ${legacyTypes.length} הטיפוסים/השדות מהישן${missingTypes.length ? ' — חסרים: ' + missingTypes.join(', ') : ''}`);
}

// ---------- 5. רגרסיה ----------
console.log('\n5) רגרסיה');
(run('npm', ['run', 'test:packages']) === 0 ? ok : fail)('test:packages — PASS');
(run('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
(run('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages — PASS');
(run('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(run('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`מודל התוכן המלא תקין — ${checks} בדיקות ירוקות. InlineItem ו־ContentBlock מבטאים את כל הישן בלי DOM ובלי sentinel; round-trip ביט-ביט.`);
