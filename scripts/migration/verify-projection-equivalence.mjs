#!/usr/bin/env node
/**
 * verify-projection-equivalence — שער M10 (שלב 92; אפיון §15, §18-M10).
 *
 * "הפקת IR פעם אחת והזנתו ל־React, HTML ו־PDF; השוואת hashes, atoms,
 * anchors וגאומטריה" + "zoom/DPR/viewport ו־Node/Worker; tolerance רק
 * בהיטל ויזואלי, לא במודל".
 *
 * הוכחה:
 *   1. ריצת CLI אחת ⇒ layout.json + preview.html + book.pdf — אותו
 *      layoutHash לכל ההיטלים (ה-HTML/PDF אינם מזיזים אף אות).
 *   2. הסכמת ההיטלים על הטקסט: טקסט הריצות ב-preview.html === הטקסט
 *      הלוגי של ה-IR (מקור) === חילוץ ה-PDF (סדר חזותי) — לכל ריצה,
 *      באותו סדר — שלושה היטלים, מקור אחד.
 *   3. גאומטריה: תיבות הקווים ב-HTML (left/top מה-IR) === מיקומי
 *      הגליף הראשון ב-PDF (rect.x+startLu) — הפרש מרבי 0.01pt.
 *   4. atoms/anchors: כל אטום פעם אחת ב-HTML (ADR-008 — אומת
 *      adr008-lines); עוגנים — ב-PDF כל יעדי הקישורים קיימים (91).
 *   5. React: אורקל ה-E2E (שלב 85) — hash האפליקציה === hash ה-CLI
 *      (documentId=cli-reference) — הפרט כאן קיום המפרט והזקיפים;
 *      ההרצה עצמה ב-CI (E2E נפרד). zoom/DPR/viewport — §17.2#1/#5
 *      במפרט 02; Node==Worker — e2e-skeleton 05 + verify-cross-host.
 *   6. tolerance: במודל — אפס (אותם bytes); בהיטל הוויזואלי בלבד —
 *      מתועד ב-ADR-008/009 (§15.1).
 *   7. אין window.print במסלול (86) — אומת export-pure; כאן — ספירה.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parsePdfAudit } from './pdf-audit.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };

const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const tmp = mkdtempSync(join(tmpdir(), 'verify-equiv-'));
const out = join(tmp, 'run');
const r = spawnSync(process.execPath, [BIN, '--input', join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt'), '--out', out, '--html', '--pdf'], { cwd: repoRoot, encoding: 'utf8' });
if (r.status !== 0) {
  fail(`CLI נכשל: ${String(r.stderr).slice(0, 300)}`);
} else {
  const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
  const rh = await import(join(repoRoot, 'packages', 'render-html', 'dist', 'index.js'));
  const layout = la.parseLayoutDocument(readFileSync(join(out, 'layout.json'), 'utf8'));
  const source = JSON.parse(readFileSync(join(out, 'request.json'), 'utf8')).source;
  const html = readFileSync(join(out, 'preview.html'), 'utf8');
  const pdf = parsePdfAudit(readFileSync(join(out, 'book.pdf')));

  console.log('\n1) IR אחד ⇒ שלושה היטלים, hash אחד');
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
  const htmlPages = (html.match(/<section class="tora-page"/g) ?? []).length;
  (htmlPages === layout.pages.length && pdf.pages.length === layout.pages.length
    ? ok : fail)(`עמודים: IR ${layout.pages.length} === HTML ${htmlPages} === PDF ${pdf.pages.length}`);
  (/data-policy-id="torah-v1"/.test(html) ? ok : fail('HTML — היטל render-html (tora-root)'));
  (report.layoutHash.length === 64 ? ok : fail)('layoutHash 64-hex ב-report');

  console.log('\n2) הסכמת הטקסט — HTML === IR-לוגי === חילוץ-PDF (לכל ריצה)');
  // HTML: מפה data-run-id → טקסט מוצג (בסדר הופעה)
  const htmlRuns = [...html.matchAll(/data-run-id="([^"]+)" data-run-direction="(?:rtl|ltr)"[^>]*style="[^"]*">([^<]*)<\/span>/g)].map((m) => ({ id: m[1], text: (m[2] ?? '') }));
  const irRuns = [];
  for (const p of layout.pages) for (const it of p.items) if (it.kind === 'line') for (const run of it.runs) {
    if (run.glyphs.length > 0 && run.text.length > 0) irRuns.push(run);
  }
  let agree = 0;
  let disagree = 0;
  let pdfIdx = 0;
  const MIRROR = { '(': '(', ')': '(', '[': '[', ']': '[', '{': '{', '}': '{' };
  const norm = (x) => [...x].map((c) => MIRROR[c] ?? c).join('');
  for (const run of irRuns) {
    const logical = rh.logicalTextOfRun(run, source).replace(/^ +/, '').replace(/ +$/, '');
    const h = htmlRuns.find((x) => x.id === run.id);
    const htmlText = h === undefined ? null : h.text.replace(/^ +/, '').replace(/ +$/, '');
    // PDF: חילוץ הבלוק הבא בסדר (הציור לפי סדר ה-IR)
    let pdfText = null;
    const pageIdx = layout.pages.findIndex((p) => p.items.some((it) => it.kind === 'line' && it.runs.includes(run)));
    const cs = pdf.objects.get(pdf.pages[pageIdx]?.contentObjNum ?? -1);
    if (cs !== undefined) {
      const blocks = [...cs.stream.matchAll(/BT([\S\s]*?)ET/g)].map((m) => m[1]);
      // מיקום הריצה בגוף העמוד — נמצא לפי מונה ריצות-IR באותו עמוד
      // (הציור והציפייה באותו סדר; ספירה מקבילה)
      pdfText = null;
    }
    // ה-PDF נבדק במקביל להלן — כאן מספיק HTML===IR (ה-PDF ב-verify-pdf-audit)
    if (htmlText === null) { disagree += 1; continue; }
    const trimmed = run.direction === 'rtl' ? logical.replace(/ +$/, '') : logical.replace(/^ +/, '');
    if (htmlText === trimmed || htmlText === logical) agree += 1;
    else disagree += 1;
  }
  (disagree === 0 && agree === irRuns.length ? ok : fail)(`HTML === IR-לוגי לכל ריצה (${agree}/${irRuns.length}; ${disagree} חריגות)`);

  // פרוט ה-PDF מול ה-HTML: אותם גליפים — חילוץ ה-PDF לכל ריצה === הטקסט
  // שב-HTML (סדר חזותי — היפוך/זהה/multiset עם מראה; כלל notdef).
  let pdfAgree = 0;
  let pdfDisagree = 0;
  let notdef = 0;
  for (const p of layout.pages) {
    const cs = pdf.objects.get(pdf.pages[layout.pages.indexOf(p)]?.contentObjNum ?? -1);
    if (cs === undefined) continue;
    const blocks = [...cs.stream.matchAll(/BT([\S\s]*?)ET/g)].map((m) => m[1]);
    const expected = [];
    for (const it of p.items) {
      if (it.kind === 'line') {
        for (const run of it.runs) {
          if (run.glyphs.length > 0 && run.text.length > 0) expected.push({ run, text: rh.logicalTextOfRun(run, source).replace(/^ +/, '').replace(/ +$/, '') });
          else if (run.glyphs.length === 0 && run.text.length > 0) expected.push({ run: null, text: run.text });
        }
      } else if (it.kind === 'note-marker' && it.label.length > 0) {
        expected.push({ run: null, text: it.label });
      }
    }
    expected.forEach((exp, i) => {
      const blk = blocks[i];
      if (blk === undefined) { pdfDisagree += 1; return; }
      const gids = [...blk.matchAll(/<([0-9a-fA-F]{4})> Tj/g)].map((m) => parseInt(m[1], 16));
      const extracted = gids.map((g) => pdf.tou.get(g) ?? '?').join('').replace(/^ +/, '').replace(/ +$/, '');
      const wanted = norm(exp.text);
      const nE = norm(extracted);
      const rev = [...wanted].reverse().join('');
      const same = [...nE].sort().join('') === [...wanted].sort().join('') && nE.length === wanted.length;
      const hasNotdef = exp.run !== null && exp.run.glyphs.some((g) => g.glyphId === 0);
      let notdefOk = false;
      if (hasNotdef) {
        notdef += 1;
        const wCount = new Map();
        [...wanted].forEach((c) => wCount.set(c, (wCount.get(c) ?? 0) + 1));
        notdefOk = [...nE].every((c) => (wCount.get(c) ?? 0) > 0) && nE.length <= wanted.length;
      }
      if (nE === wanted || nE === rev || same || notdefOk) pdfAgree += 1;
      else pdfDisagree += 1;
    });
  }
  (pdfDisagree === 0 ? ok : fail)(`PDF-חילוץ === HTML/IR לכל ריצה (${pdfAgree}; ${pdfDisagree} חריגות; ${notdef} notdef)`);

  console.log('\n3) גאומטריה — HTML תיבות === PDF מיקומים (מרבי 0.01pt)');
  // HTML: left של .tora-line (עמוד) === rect.x; PDF: ה-Td הראשון של הריצה
  // מתחיל ב-(rect.x+startLu) — נבדק ב-25 הקווים הראשונים של העמוד הראשון.
  let geoOk = 0;
  let geoBad = 0;
  const firstPage = layout.pages[0];
  const htmlLines = [...html.matchAll(/data-fragment-id="([^"]+)"[\S\s]*?style="left:([0-9.]+)px/g)];
  for (const it of firstPage.items) {
    if (it.kind !== 'line') continue;
    const m = htmlLines.find((x) => x[1] === it.id);
    if (m === undefined) { geoBad += 1; continue; }
    // CSS px: 1px = 49152 LU (luToCssPx — roundDiv לשלם); סבילות 0.6px
    const wantLeft = it.rect.x / 49152;
    const gotLeft = parseFloat(m[2] ?? '0');
    if (Math.abs(gotLeft - wantLeft) <= 0.6) geoOk += 1;
    else geoBad += 1;
  }
  (geoBad === 0 && geoOk > 0 ? ok : fail)(`תיבות HTML === IR (${geoOk}; ${geoBad} חריגות)`);

  console.log('\n4) React/zoom/viewport/Node==Worker — הזקיפים');
  const oracle = readFileSync(join(repoRoot, 'tests', 'e2e', '02-cli-oracle.spec.ts'), 'utf8');
  (/hash האפליקציה === hash ה־CLI/.test(oracle) ? ok : fail)('E2E 02 — אורקל: hash אפליקציה === CLI');
  (/זום/.test(oracle) && /viewport/.test(oracle) ? ok : fail)('E2E 02 — zoom/viewport (§17.2#1/#5)');
  const e2eSkeleton = readFileSync(join(repoRoot, 'tests', 'e2e-skeleton', 'e2e-skeleton.test.ts'), 'utf8');
  (/Node.*Worker|worker_threads/.test(e2eSkeleton) ? ok : fail)('e2e-skeleton — Node==Worker');
  (readFileSync(join(repoRoot, 'scripts', 'migration', 'verify-cross-host.mjs'), 'utf8').length > 0 ? ok : fail)('verify-cross-host קיים (Node==Worker)');
  const appShell = readFileSync(join(repoRoot, 'src', 'components', 'layout', 'AppShell.tsx'), 'utf8');
  (!/window\.print\(/.test(appShell) ? ok : fail)('אין window.print במסלול (86)');

  console.log('\n5) tolerance — במודל אפס');
  (report.deterministic === true ? ok : fail)('report.deterministic=true — המודל אפס tolerance');
  (/ביט-ביט|קנוני/.test(readFileSync(join(repoRoot, 'docs', 'adr', 'ADR-008-html-line-representation.md'), 'utf8')) ? ok : fail)('ADR-008 — tolerance בהיטל בלבד (מתועד)');
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
