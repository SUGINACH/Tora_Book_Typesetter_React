#!/usr/bin/env node
/**
 * verify-export-pdf — אימות שלב 89: [ADR-009] יסודות export-pdf מבוססי
 * גליפים (תכנית 89; אפיון §15.4; ADR-009).
 *
 * שעת השלב: "טקסט אמיתי ניתן לחילוץ, גופנים מוטמעים, גאומטריה מול IR"
 * + "אין window.print במסלול PDF הסמכותי".
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };

const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const FIXTURE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
const tmp = mkdtempSync(join(tmpdir(), 'verify-export-pdf-'));
const out1 = join(tmp, 'a');
const out2 = join(tmp, 'b');
const run = (out) => spawnSync(process.execPath, [BIN, '--input', FIXTURE, '--out', out, '--pdf'], { cwd: repoRoot, encoding: 'utf8' });
const r1 = run(out1);
if (r1.status !== 0) {
  fail(`CLI --pdf נכשל: ${String(r1.stderr).slice(0, 400)}`);
} else {
  ok('CLI --pdf ⇒ exit 0');
  const pdf = readFileSync(join(out1, 'book.pdf'));
  const txt = pdf.toString('latin1');
  const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
  const rh = await import(join(repoRoot, 'packages', 'render-html', 'dist', 'index.js'));
  const source = JSON.parse(readFileSync(join(out1, 'request.json'), 'utf8')).source;
  const layout = la.parseLayoutDocument(readFileSync(join(out1, 'layout.json'), 'utf8'));

  console.log('\n1) מבנה');
  txt.startsWith('%PDF-1.7') ? ok('%PDF-1.7') : fail('כותרת');
  /%%EOF\s*$/.test(txt) ? ok('%%EOF') : fail('%%EOF חסר');
  /xref\n0 \d+\n/.test(txt) ? ok('xref') : fail('xref חסר');
  const pageCount = (txt.match(/\/Type \/Page[^s]/g) ?? []).length;
  pageCount === layout.pages.length ? ok(`עמודים ${pageCount} === IR`) : fail(`עמודים ${pageCount} ≠ ${layout.pages.length}`);

  console.log('\n2) MediaBox מול IR');
  let boxesOk = true;
  layout.pages.forEach((p, i) => {
    const wpt = (p.size.width / 65536).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    const hpt = (p.size.height / 65536).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    const m = txt.match(new RegExp(`/MediaBox \\[0 0 ([0-9.]+) ([0-9.]+)\\]`, 'g'));
    const one = (m ?? [])[i];
    if (one === undefined || !one.includes(wpt) || !one.includes(hpt)) boxesOk = false;
  });
  boxesOk ? ok('MediaBox === גודל העמוד (pt מ-LU)') : fail('MediaBox חורג');

  console.log('\n3) גופן מוטמע (subset + ToUnicode)');
  /\/FontFile2 \d+ 0 R/.test(txt) ? ok('/FontFile2 קיים') : fail('/FontFile2 חסר');
  /\/ToUnicode \d+ 0 R/.test(txt) ? ok('/ToUnicode קיים') : fail('/ToUnicode חסר');
  const streamsAll = [...txt.matchAll(/stream\n([\S\s]*?)\nendstream/g)].map((m) => m[1]);
  const sfnt = streamsAll.find((s) => s.length > 1000 && s.charCodeAt(0) === 0 && s.charCodeAt(1) === 1) ?? null;
  if (sfnt !== null) {
    const b = Buffer.from(sfnt, 'latin1');
    const numTables = (b[4] << 8) | b[5];
    let maxpOff = -1;
    for (let i = 0; i < numTables; i += 1) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
      if (tag === 'maxp') maxpOff = (b[o + 8] << 24 | b[o + 9] << 16 | b[o + 10] << 8 | b[o + 11]) >>> 0;
    }
    const numGlyphs = maxpOff >= 0 ? ((b[maxpOff + 4] << 8) | b[maxpOff + 5]) : -1;
    ok(`FontFile2 — sfnt חוקי (${b.length} bytes; subset numGlyphs=${numGlyphs})`);
    numGlyphs > 0 && numGlyphs < 200 ? ok(`subset קטן (${numGlyphs} גליפים — השימוש בלבד)`) : fail('subset אינו קטן — חשד להטמעה מלאה');
  } else {
    fail('FontFile2 — sfnt לא זוהה');
  }

  console.log('\n4) חילוץ טקסט דרך ToUnicode — השוואה מול ה-IR');
  const touSrc = streamsAll.find((s) => s.includes('begincmap')) ?? '';
  const touMap = new Map();
  for (const m of (touSrc.matchAll(/<([0-9a-fA-F]{4})> <([0-9a-fA-F]*)>/g) ?? [])) {
    const gid = parseInt(m[1], 16);
    const hex = m[2] ?? '';
    let t = '';
    for (let i = 0; i + 4 <= hex.length; i += 4) t += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    touMap.set(gid, t);
  }
  touMap.size > 0 ? ok(`ToUnicode — ${touMap.size} מיפויים`) : fail('ToUnicode ריק');
  const contentStreams = streamsAll.filter((s) => s.startsWith('BT'));
  contentStreams.length === layout.pages.length ? ok(`זרמי תוכן ${contentStreams.length} === עמודים`) : fail(`זרמי תוכן ${contentStreams.length} ≠ ${layout.pages.length}`);

  // בניית הציפייה לכל עמוד: רצף הציור של drawPage (קווים→ריצות; סמנים)
  const expectedPerPage = layout.pages.map((p) => {
    const list = [];
    for (const it of p.items) {
      if (it.kind === 'line') {
        for (const r of it.runs) {
          if (r.glyphs.length > 0 && r.text.length > 0) list.push({ kind: 'ir-run', run: r });
          else if (r.glyphs.length === 0 && r.text.length > 0) list.push({ kind: 'cmap-run', text: r.text });
        }
      } else if (it.kind === 'note-marker' && it.label.length > 0) {
        list.push({ kind: 'marker', text: it.label, rect: it.rect, baseline: it.baseline });
      }
    }
    return list;
  });

  let textOk = 0;
  let textBad = 0;
  let geoOk = 0;
  let geoBad = 0;
  let totalExpected = 0;
  layout.pages.forEach((p, pi) => {
    const cs = contentStreams[pi] ?? '';
    const blocks = [...cs.matchAll(/BT([\S\s]*?)ET/g)].map((m) => m[1]);
    const expected = expectedPerPage[pi] ?? [];
    totalExpected += expected.length;
    if (blocks.length !== expected.length) {
      console.log(`    [עמוד ${pi}] blocks=${blocks.length} expected=${expected.length} — חוסר התאמה`);
    }
    expected.forEach((exp, i) => {
      const blk = blocks[i];
      if (blk === undefined) { textBad += 1; geoBad += 1; return; }
      const gids = [...blk.matchAll(/<([0-9a-fA-F]{4})> Tj/g)].map((m) => parseInt(m[1], 16));
      const extractedRaw = gids.map((g) => (touMap.get(g) ?? '\uFFFD')).join('');
      const extracted = extractedRaw.replace(/^ +/, '').replace(/ +$/, '');
      let wanted = '';
      if (exp.kind === 'ir-run') wanted = rh.logicalTextOfRun(exp.run, source).replace(/^ +/, '').replace(/ +$/, '');
      else wanted = exp.text;
      // ה-PDF מצייר את הסדר החזותי (מערך הגליפים); ריצה עברית טהורה —
      // היפוך תווי של הלוגי; ריצת ltr — זהה ללוגי.
      const reversed = [...wanted].reverse().join('');
      if (extracted === wanted || extracted === reversed) textOk += 1;
      else { textBad += 1; if (textBad <= 3) console.log(`    חריג טקסט [${pi}#${i}]: ${JSON.stringify(extracted.slice(0, 40))} vs ${JSON.stringify(wanted.slice(0, 40))}`); }
      // גאומטריה: הגליף הראשון בקצה השמאלי של תיבת הריצה; y=H−baseline.
      const firstTd = blk.match(/(-?[0-9.]+) (-?[0-9.]+) Td/);
      if (firstTd === null) { geoBad += 1; return; }
      const x = parseFloat(firstTd[1]);
      const y = parseFloat(firstTd[2]);
      const pageH = p.size.height / 65536;
      let wantX = 0;
      let wantY = pageH;
      if (exp.kind === 'ir-run') {
        wantX = exp.run.startLu / 65536;
        wantY = pageH - (lineBaselineOf(p, exp.run) / 65536);
      } else if (exp.kind === 'marker') {
        wantX = exp.rect.x / 65536;
        wantY = pageH - (exp.baseline / 65536);
      } else {
        // cmap-run: לא נבדק גאומטרית כאן (אין לו תיבה ב-IR)
        geoOk += 1;
        return;
      }
      if (Math.abs(x - wantX) <= 0.01 && Math.abs(y - wantY) <= 0.01) geoOk += 1;
      else { geoBad += 1; if (geoBad <= 3) console.log(`    חריג גאומטריה [${pi}#${i}]: x=${x}/${wantX.toFixed(3)} y=${y}/${wantY.toFixed(3)}`); }
    });
  });
  (textBad === 0 ? ok : fail)(`חילוץ === הסדר החזותי של ה-IR (${textOk}/${totalExpected}; ${textBad} חריגות)`);
  (geoBad === 0 && geoOk > 0 ? ok : fail)(`גאומטריה נאמנה (${geoOk}; ${geoBad} חריגות)`);

  console.log('\n5) דטרמיניזם');
  const r2 = run(out2);
  if (r2.status === 0) {
    const h1 = createHash('sha256').update(readFileSync(join(out1, 'book.pdf'))).digest('hex');
    const h2 = createHash('sha256').update(readFileSync(join(out2, 'book.pdf'))).digest('hex');
    (h1 === h2 ? ok : fail)(`שתי ריצות ⇒ book.pdf זהה ביט-ביט (${h1.slice(0, 16)}…)`);
    const rep1 = JSON.parse(readFileSync(join(out1, 'report.json'), 'utf8'));
    const rep2 = JSON.parse(readFileSync(join(out2, 'report.json'), 'utf8'));
    (rep1.layoutHash === rep2.layoutHash ? ok : fail)('layoutHash זהה — ה-PDF אינו משפיע');
  } else {
    fail('ריצה שנייה נכשלה');
  }

  console.log('\n6) אין window.print במסלול');
  const appShell = readFileSync(join(repoRoot, 'src', 'components', 'layout', 'AppShell.tsx'), 'utf8');
  (!/window\.print\(/.test(appShell) ? ok : fail)('AppShell נקי מ-window.print');
  (/\/Producer \(export-pdf/.test(txt) ? ok : fail)('Producer — export-pdf (לא הדפסת דפדפן)');
}

function lineBaselineOf(page, run) {
  for (const it of page.items) {
    if (it.kind === 'line') {
      for (const r of it.runs) if (r === run) return it.baseline;
    }
  }
  return 0;
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
