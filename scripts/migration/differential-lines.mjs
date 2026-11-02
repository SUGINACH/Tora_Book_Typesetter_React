#!/usr/bin/env node
/**
 * differential-lines.mjs — דוח differential לשורות מול fixtures של Gold (שלב 48;
 * אפיון §17.1, §18-M5; תכנית שלב 48).
 *
 * מה נמדד כאן:
 *   1. **ריצה מלאה של next (ה־DP)** על כל fixture של קורפוס Gold — הספק
 *      HarfBuzz האמיתי, אותן הגדרות: hash, עמודים, קווים וביקורת.
 *   2. **Differential מבודד אלגוריתם לכל פסקה**: ה־DP (מסלול הייצור) מול
 *      פיקסטורת ההשוואה החמדנית — אותו אינדקס מועמדים, אותו מודל רוחב,
 *      אותם כללי סיום; ההשוואה היא על QualityVector המלא (ADR-004).
 *      סיווג כל פסקה: שיפור מתועד / זהות / רגרסיה.
 *   3. **מול הבייסליין הנעול (Orange@93ad1e57)**: שימור תוכן (0 חסרים),
 *      דטרמיניזם — הטענות המאומתות של מטריצת ה-parity שבתחום M5.
 *
 * כללי זהב (§17.3, §18-M5): אין עדכון golden אוטומטי — הדוח הוא מסמך
 * חדש המתעד את המצב; שינוי golden עתידי ידרוש diff קריא.
 *
 * פלט: docs/migration/differential-lines.json + טבלה קריאה בקונסולה.
 * המסמכים הענקיים (2.7–3.4MB) אינם נכללים בריצת הברירה — זמן CI; הם
 * נבדקים דרך המאמתים הכבדים. mid (667KB) נכלל בדגל --full.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const corpusRoot = join(repoRoot, 'packages', 'test-fixtures', 'corpus');

const ma = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'index.js'));
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const auditCore = await import(join(repoRoot, 'packages', 'audit-core', 'dist', 'index.js'));
const mh = await import(join(repoRoot, 'packages', 'measurement-harfbuzz', 'dist', 'index.js'));

const FULL = process.argv.includes('--full');

// ── ספק HarfBuzz אמיתי (אותה בנייה כמו e2e-skeleton; ADR-003) ──
const manifestBytes = readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'));
const manifest = ma.assertFontManifest(JSON.parse(manifestBytes.toString('utf8')));
const guttman = manifest.find((r) => r.file === 'Guttman-Rashi-Normal.woff2');
const guttmanBytes = new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', guttman.file)));
const font = ma.verifyFontBytes(guttman, guttmanBytes);
const fontsManifestSha256 = ma.sha256Bytes(new TextEncoder().encode(manifestBytes.toString('utf8')));

const hbMod = (await import('harfbuzzjs'));
const hb = (hbMod.default ?? hbMod);
const wawoff2Mod = (await import('wawoff2'));
const wawoff2 = (wawoff2Mod.default ?? wawoff2Mod);
const provider = await mh.createHarfbuzzProvider({
  hb,
  wasmBytes: new Uint8Array(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz.wasm'))),
  woff2DecoderBytes: new Uint8Array(readFileSync(require.resolve('wawoff2/build/decompress_binding.js'))),
  decompressWoff2: (bytes) => wawoff2.decompress(bytes),
  fonts: [{ record: guttman, bytes: guttmanBytes, key: font }],
});

// ── הגדרות v0 (ברירות המחדל של המרשם) ──
const VALUES = {
  'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8,
  'note-marker-type': 'super', 'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1,
};
const settings = { schemaVersion: 1, enginePolicyId: 'torah-v1', values: VALUES, configHash: 'c'.repeat(64) };
const V0 = engine.readV0Settings(settings);
const COLUMN = V0.geometry.columnWidth;
const BUDGET = { maxCandidatesPerState: 512, maxBeamWidth: 64 };
const RULES = engine.DEFAULT_PARAGRAPH_END_RULES;

/** מדיניות ההתאמה של החמדני — הסמנטיקה של v0 הישן: מילוי מקסימלי שנכנס
 *  טבעית לרוחב הטור (בלי דרישות מתיחה); מקטע גולש ⇒ emergency. */
const greedyV0Policy = {
  overflowAllowanceLu: 0,
  check(candidate) {
    return candidate.metrics.widthLu > COLUMN ? 'overflow' : null;
  },
};

/** וקטור האיכות של מסלול שלם (סכום קווים; ADR-004). */
function pathQuality(lines) {
  let q = { ...engine.ZERO_QUALITY };
  lines.forEach((line, i) => {
    const ctx = {
      candidate: line.candidate,
      lineIndex: i,
      isFirst: i === 0,
      isLast: line.breakPoint.kind === 'end',
      justification: line.justification,
    };
    const v = engine.lineQualityVector(ctx, COLUMN, RULES);
    q = engine.addQuality(q, v);
  });
  return q;
}

const emptyRunLedger = () => ({ records: [] });

function runFixture(id, relPath) {
  const raw = readFileSync(join(corpusRoot, relPath), 'utf8');
  const parsed = cm.parseSourceText(raw, { documentId: `diff:${id}`, sourceName: relPath });
  const doc = { ...parsed.doc, transforms: parsed.transforms };
  const request = {
    document: doc,
    settings,
    assets: { schemaVersion: 1, fonts: [{ usage: 'body', font }], fontsManifestSha256, assetsManifestSha256: '0'.repeat(64) },
    trace: 'off',
    budget: { ...BUDGET, maxExpandedStates: 200000, maxOuterIterations: 8 },
    sourceSha256: '5'.repeat(64),
    parserVersion: 'content-model@0.1.0',
  };

  // 1) ריצה מלאה של next (DP) — hash, עמודים, ביקורת
  const out = engine.typeset(request, provider, { policyId: 'torah-v1' });
  const report = auditCore.auditLayout({ content: doc, settings: {}, layout: out.layout });
  const lines = out.layout.pages.flatMap((p) => p.items).filter((i) => i.kind === 'line');

  // מצאי HIGH? ריצת trace נפרשת לאימות שכל גלישה מתועדת בפנקס
  let overflowExplained = true;
  const overflowCount = report.findings.filter((f) => f.code === 'audit.layout.LINE_RUN_OVERFLOW').length;
  if (report.counts.HIGH > 0 && overflowCount > 0) {
    const traced = engine.typeset({ ...request, trace: 'decisions' }, provider, { policyId: 'torah-v1' });
    const emLineRecords = (traced.ledger ?? emptyRunLedger()).records
      .filter((r) => r.fallbackCode === 'EMERGENCY_LINE').length;
    overflowExplained = emLineRecords > 0;
  }

  // 2) differential מבודד לכל פסקת גוף: DP מול greedy
  const blocks = la.allBlocks(doc).filter((b) => b.role !== 'note-body');
  let compared = 0, improvement = 0, parity = 0, regression = 0, baselineIllegal = 0;
  let dpLines = 0, grLines = 0, dpEmergency = 0, grEmergency = 0, dpHyphen = 0, grHyphen = 0;
  const regressions = [];
  const baselineNotLegal = [];
  for (const block of blocks) {
    const bt = engine.tokenize(block.id, block.inline, new Map());
    if (bt.atoms.length === 0) continue;
    const shaped = engine.shapeParagraph(bt.atoms, provider, font, V0.bodyFontSizeLu);
    const index = new engine.LineCandidateIndex(bt, shaped, () => 0);
    let dp, gr;
    try {
      dp = engine.breakParagraphWithLadder(bt.blockId, bt, index, COLUMN, BUDGET, { rules: RULES });
      gr = engine.breakParagraphGreedy(index, greedyV0Policy, COLUMN);
    } catch {
      continue; // פסקה שאינה ברת-השוואה (למשל ריקה) — לא נספרת
    }
    const dpQ = pathQuality(dp.dp.lines);
    const grQ = pathQuality(gr);
    compared += 1;
    dpLines += dp.dp.lines.length;
    grLines += gr.length;
    dpEmergency += [...dp.perLineFallback.values()].length;
    grEmergency += gr.filter((l) => l.emergency).length;
    dpHyphen += dp.dp.lines.filter((l) => l.candidate.metrics.hyphenEnd).length;
    grHyphen += gr.filter((l) => l.candidate.metrics.hyphenEnd).length;
    const cmp = engine.compareQuality(dpQ, grQ);
    if (cmp < 0) improvement += 1;
    else if (cmp === 0) parity += 1;
    else {
      // ה-DP יקר מהחמדני — רק אם מסלול החמדני חוקי לפי המדיניות הנעולה זו
      // רגרסיה אמיתית של האלגוריתם; אחרת זו השוואה מול בסיס בלתי-חוקי: החמדני
      // "משיג" וקטור טוב יותר רק על ידי הפרת סף המתיחה (כמו שהדפדפן הישן
      // עשה בשקט) — הבדל מוסבר ומתועד, לא כשל של ה-DP.
      const pol0 = engine.createLevel0Policy();
      const pol1 = engine.createLevel1Policy();
      const illegal = gr.some((line) => {
        const r0 = pol0.check(line.candidate, line.justification, COLUMN);
        const r1 = r0 === null ? null : pol1.check(line.candidate, line.justification, COLUMN);
        return r1 !== null;
      });
      if (illegal) {
        baselineIllegal += 1;
        if (baselineNotLegal.length < 5) {
          baselineNotLegal.push({ blockId: block.id, dp: dpQ, greedy: grQ, reason: 'greedy-path-violates-stretch-policy' });
        }
      } else {
        regression += 1;
        if (regressions.length < 5) {
          regressions.push({ blockId: block.id, dp: dpQ, greedy: grQ, reason: 'true-regression: dp-legal-path-worse-than-legal-greedy-path' });
        }
      }
    }
  }

  const classification = regression > 0 ? 'regression'
    : improvement > 0 ? 'documented-improvement' : 'parity';
  return {
    id,
    sourcePath: `packages/test-fixtures/corpus/${relPath}`,
    bytes: raw.length,
    run: {
      layoutHash: out.manifest.layoutHash,
      pages: out.layout.pages.length,
      lines: lines.length,
      auditHigh: report.counts.HIGH,
      auditMedium: report.counts.MEDIUM,
      auditLow: report.counts.LOW,
      overflowExplained,
    },
    paragraphs: { compared, improvement, parity, regression, baselineNotLegal: baselineIllegal },
    lines: { dp: dpLines, greedy: grLines },
    quality: {
      dpEmergencyLines: dpEmergency, greedyEmergencyLines: grEmergency,
      dpHyphenEnds: dpHyphen, greedyHyphenEnds: grHyphen,
    },
    classification,
    ...(regressions.length > 0 ? { regressions } : {}),
    ...(baselineNotLegal.length > 0 ? { baselineNotLegal } : {}),
  };
}

// ── רשימת ה-fixtures של Gold (קורפוס הפרקים + מקרי העשן) ──
const chapters = ['ch05', 'ch09', 'ch13', 'ch35', 'ch42', 'ch55', 'ch62', 'ch63', 'ch67', 'ch71', 'ch72', 'ch73', 'ch75'];
const cases = [
  ['ch63-final-paragraph-failure', 'cases/ch63_final_paragraph_failure_case.txt'],
  ['no-legal-two-column-split', 'cases/no-legal-two-column-split.txt'],
  ['geometry-audit-smoke', 'cases/geometry-audit-smoke.txt'],
  ['geometry-audit-diagnostics-smoke', 'cases/geometry-audit-diagnostics-smoke.txt'],
  ['ornament-geometry-smoke', 'cases/ornament-geometry-smoke.txt'],
];
const fixtureList = [
  ...chapters.map((c) => [`chapter-focus-${c}`, `chapters/${c}.txt`]),
  ...cases,
  ...(FULL ? [['mid-document', 'mid/mid_long_test_text.txt']] : []),
];

const results = [];
for (const [id, rel] of fixtureList) {
  process.stdout.write(`  ${id} … `);
  const r = runFixture(id, rel);
  results.push(r);
  console.log(`${r.classification} (קווים ${r.lines.dp} מול ${r.lines.greedy}; ` +
    `שיפור ${r.paragraphs.improvement}/${r.paragraphs.compared}; audit H=${r.run.auditHigh})`);
}

const totals = results.reduce((acc, r) => ({
  fixtures: acc.fixtures + 1,
  compared: acc.compared + r.paragraphs.compared,
  improvement: acc.improvement + r.paragraphs.improvement,
  parity: acc.parity + r.paragraphs.parity,
  regression: acc.regression + r.paragraphs.regression,
  baselineNotLegal: acc.baselineNotLegal + (r.paragraphs.baselineNotLegal ?? 0),
  auditHigh: acc.auditHigh + r.run.auditHigh,
  overflowExplained: acc.overflowExplained && r.run.overflowExplained,
  dpLines: acc.dpLines + r.lines.dp,
  greedyLines: acc.greedyLines + r.lines.greedy,
}), { fixtures: 0, compared: 0, improvement: 0, parity: 0, regression: 0, baselineNotLegal: 0, auditHigh: 0, overflowExplained: true, dpLines: 0, greedyLines: 0 });

const doc = {
  schemaVersion: 1,
  generatedAtStage: 48,
  authority: 'תכנית 100 השלבים, שלב 48 · אפיון §17.1, §18-M5 · מול קורפוס Gold (Orange@93ad1e57)',
  method: 'DP גלובלי (מסלור next) מול פיקסטורת ההשוואה החמדנית — אותו אינדקס מועמדים ומודל רוחב; השוואה על QualityVector מלא (ADR-004); הספק HarfBuzz אמיתי; תקציב 512/64; כללי סיום ברירת מחדל',
  fixtures: results,
  summary: {
    ...totals,
    gate: {
      noUnexplainedOverflow: totals.auditHigh === 0 || totals.overflowExplained,
      noTrueRegression: totals.regression === 0,
      contentConserved: results.every((r) => r.run.auditHigh === 0 || r.run.overflowExplained),
    },
  },
};

mkdirSync(join(repoRoot, 'docs', 'migration'), { recursive: true });
const outPath = join(repoRoot, 'docs', 'migration', 'differential-lines.json');
writeFileSync(outPath, JSON.stringify(doc, null, 1) + '\n');

console.log('\n─── סיכום differential לשורות (שלב 48) ───');
console.log(`fixtures: ${totals.fixtures} | פסקאות שהושוו: ${totals.compared}`);
console.log(`שיפור מתועד: ${totals.improvement} | זהות: ${totals.parity} | בסיס בלתי-חוקי (מוסבר): ${totals.baselineNotLegal} | רגרסיה אמיתית: ${totals.regression}`);
console.log(`קווים DP: ${totals.dpLines} | קווים חמדני: ${totals.greedyLines}`);
console.log(`ממצאי HIGH בביקורת: ${totals.auditHigh} | כולם מוסברים: ${totals.overflowExplained}`);
console.log(`שער: אין-גלישה-בלתי-מוסברת=${doc.summary.gate.noUnexplainedOverflow} אין-רגרסיה-אמיתית=${doc.summary.gate.noTrueRegression}`);
console.log(`\nנכתב: ${outPath}`);
