/**
 * cli.test.ts — בדיקות שלב 34: CLI reference runner (§12.2, §17, §20).
 *
 * מה מוכח כאן:
 *   1. ריצת reference fixture מלאה ← artifacts (layout/manifest/request/
 *      report + ledger ב-trace; preview.html ב-html) על הספק האמיתי.
 *   2. שתי ריצות שלמות של ה־CLI ⇐ אותו layoutHash (דטרמיניזם ברמת התהליך).
 *   3. שם קובץ שונה ⇐ אותו hash (§17.2#8) — documentId קבוע.
 *   4. שגיאת קלט ממוקמת: קובץ חסר ⇒ exit 3 + path+reason; JSON שגוי ⇒ exit 3.
 *   5. דגלים שגויים ⇒ exit 2; --help ⇒ 0.
 *   6. גופן לא קיים ⇒ exit 4 עם spec; repeat>1 עובר (אותו hash).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs, runCli, runAuditCli, EXIT_CODES, EXIT_INPUT, EXIT_USAGE, EXIT_FONT, EXIT_SUCCESS, EXIT_AUDIT } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const FIXTURE = join(here, 'fixtures', 'reference-source.txt');

interface Case {
  tmp: string;
  out: string;
}

let current: Case | undefined;

beforeEach(async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'tora-cli-'));
  current = { tmp, out: join(tmp, 'artifacts') };
});

afterEach(async () => {
  if (current !== undefined) await rm(current.tmp, { recursive: true, force: true });
  current = undefined;
});

function args(over: Record<string, string | number | boolean> = {}) {
  const c = current as Case;
  const base: Record<string, string | number | boolean> = {
    input: FIXTURE,
    out: c.out,
    'fonts-manifest': join(repoRoot, 'assets', 'fonts', 'manifest.json'),
    'fonts-dir': join(repoRoot, 'assets', 'fonts'),
    ...over,
  };
  const argv: string[] = [];
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === 'boolean') { if (v) argv.push(`--${k}`); continue; }
    argv.push(`--${k}`, String(v));
  }
  const parsed = parseCliArgs(argv);
  if (!parsed.ok || parsed.help) throw new Error(`bad args fixture: ${JSON.stringify(parsed)}`);
  return parsed.args;
}

describe('שלב 34: CLI reference runner — artifacts', () => {
  test('ריצת reference fixture מלאה ← כל ה-artifacts הקנוניים', async () => {
    const outcome = await runCli(args({ trace: 'decisions', html: true }));
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    const c = current as Case;
    const layout = JSON.parse(await readFile(join(c.out, 'layout.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(join(c.out, 'manifest.json'), 'utf8'));
    const request = JSON.parse(await readFile(join(c.out, 'request.json'), 'utf8'));
    const report = JSON.parse(await readFile(join(c.out, 'report.json'), 'utf8'));
    const ledger = JSON.parse(await readFile(join(c.out, 'ledger.json'), 'utf8'));
    const html = await readFile(join(c.out, 'preview.html'), 'utf8');

    expect(layout.schemaVersion).toBe(1);
    expect(Array.isArray(layout.pages)).toBe(true);
    expect(layout.pages.length).toBeGreaterThan(0);
    expect(manifest.layoutHash).toBe(report.layoutHash);
    expect(manifest.inputHash.length).toBe(64);
    expect(manifest.fontsManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(request.sourceSha256.length).toBe(64);
    expect(request.parserVersion).toBe('content-model@0.1.0');
    expect(Array.isArray(ledger.records)).toBe(true);
    expect(ledger.records.length).toBeGreaterThan(0);
    expect(report.deterministic).toBe(true);
    expect(report.repeats).toBe(1);
    expect(report.audit.ok).toBe(true);
    expect(report.audit.high).toBe(0);
    expect(report.pages).toBe(layout.pages.length);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('data-page');
    // אין חותמות זמן בפלט הקנוני (§15.1)
    for (const f of ['layout.json', 'manifest.json', 'report.json']) {
      const t = await readFile(join(c.out, f), 'utf8');
      expect(t).not.toMatch(/20\d\d-\d\d-\d\dT/);
    }
  }, 120_000);

  test('שתי ריצות CLI שלמות ⇐ אותו layoutHash; שם קובץ שונה ⇐ אותו hash (§17.2#8)', async () => {
    const c = current as Case;
    const copyA = join(c.tmp, 'book-a.txt');
    const copyB = join(c.tmp, 'a-completely-different-name.txt');
    await cp(FIXTURE, copyA);
    await cp(FIXTURE, copyB);
    const a = await runCli(args({ input: copyA, repeat: 3 }));
    const b = await runCli(args({ input: copyB }));
    expect(a.exitCode).toBe(EXIT_SUCCESS);
    expect(b.exitCode).toBe(EXIT_SUCCESS);
    expect((a.report as { layoutHash: string }).layoutHash).toBe((b.report as { layoutHash: string }).layoutHash);
    expect((a.report as { repeats: number }).repeats).toBe(3);
  }, 180_000);

  // ── תיקון שורש 2026-11-09 (כישלון העמדה באתר החי): הגופן חייב להגיע ──
  // בפועל לצד preview.html — קידומת fonts/ כפולה (fonts/fonts/…) + אי-העתקה
  // הותירו את ה-@font-face על 404 בכל preview.html שהופק אי-פעם, והדפדפן
  // הציג גופן חלופי במדדים זרים.
  test('--html מעתיק את גופן הגוף לפלט ומעגן אותו בנתיב אחד (fonts/<file>); ביט-ביט זהה למקור', async () => {
    const outcome = await runCli(args({ html: true }));
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    const c = current as Case;
    const html = await readFile(join(c.out, 'preview.html'), 'utf8');
    // נתיב יחיד — לא fonts/fonts/
    expect(html).toContain('src:url("fonts/Guttman-Rashi-Normal.woff2")');
    expect(html).not.toContain('fonts/fonts/');
    // הקובץ עצמו קיים לצד ה-preview וזהה ביט-ביט למקור שה-@font-face צריך
    const copied = await readFile(join(c.out, 'fonts', 'Guttman-Rashi-Normal.woff2'));
    const source = await readFile(join(repoRoot, 'assets', 'fonts', 'Guttman-Rashi-Normal.woff2'));
    expect(copied.byteLength).toBe(source.byteLength);
    expect(copied.equals(source)).toBe(true);
    // הריצות ב-preview עוגנות למשפחה ההאשית בגרש בודד בתוך מאפיין ה-style
    // (מרכאות כפולות ב-style="" חתכו את המאפיין; בלוק ה-<style> של
    // ה-@font-face חוקי וממשיך להשתמש במרכאות כפולות — שם זה CSS גלוי)
    expect(html).toContain(`;font-family:'tora-font-v1-`);
    expect(html).not.toContain(';font-family:"tora-');
    // תיקון 2026-11-09/ב': כיוון טבעי לפי הריצה (בלי bidi-override — הוא
    // מראה כל מילה במחרוזת החזותית) + data-run-direction לנעילה
    expect(html).not.toContain('unicode-bidi');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-run-direction="rtl"');
  }, 120_000);
});

describe('שלב 34: שגיאות ממוקמות וקודי יציאה', () => {
  test('קובץ קלט חסר ⇒ exit 3 + path וסיבה בפרמטרים', async () => {
    const c = current as Case;
    const missing = join(c.tmp, 'no-such-book.txt');
    await expect(runCli(args({ input: missing }))).rejects.toMatchObject({
      exitCode: EXIT_INPUT,
      catalogKey: 'errors.cli.INPUT_UNREADABLE',
      params: { path: missing },
    });
  });

  test('הגדרות שאינן JSON ⇒ exit 3 ממוקד לקובץ ההגדרות', async () => {
    const c = current as Case;
    const bad = join(c.tmp, 'settings.json');
    await writeFile(bad, '{not json', 'utf8');
    await expect(runCli(args({ settings: bad }))).rejects.toMatchObject({
      exitCode: EXIT_INPUT,
      catalogKey: 'errors.cli.SETTINGS_INVALID',
      params: { path: bad },
    });
  });

  test('הגדרה שלא במרשם ⇒ exit 3 (דו-כיווניות שלב 30 נאכפת גם ב-CLI)', async () => {
    const c = current as Case;
    const bad = join(c.tmp, 'settings.json');
    await writeFile(bad, JSON.stringify({ 'no-such-key': 1 }), 'utf8');
    await expect(runCli(args({ settings: bad }))).rejects.toMatchObject({
      exitCode: EXIT_INPUT,
      catalogKey: 'errors.cli.SETTINGS_INVALID',
      params: { path: bad },
    });
  });

  test('גופן לא קיים במניפסט ⇒ exit 4 + spec', async () => {
    await expect(runCli(args({ 'body-font': 'No-Such-Font.woff2' }))).rejects.toMatchObject({
      exitCode: EXIT_FONT,
      catalogKey: 'errors.cli.FONT_NOT_FOUND',
      params: { spec: 'No-Such-Font.woff2' },
    });
  });

  test('דגלים שגויים ⇒ exit 2; --help ⇒ 0', async () => {
    expect(parseCliArgs(['--input', 'x']).ok).toBe(false); // חסר --out
    expect(parseCliArgs(['--nonsense', '1']).ok).toBe(false);
    expect(parseCliArgs(['--trace', 'bogus', '--input', 'a', '--out', 'b']).ok).toBe(false);
    const help = parseCliArgs(['--help']);
    expect(help.ok && help.help).toBe(true);
  });

  test('כל קודי היציאה החוקיים מוגדרים וזהים לתיעוד (שלב 38: +7 ממצאי ביקורת)', () => {
    expect(EXIT_CODES).toEqual([0, 2, 3, 4, 5, 6, 7]);
    expect(EXIT_USAGE).toBe(2);
    expect(EXIT_AUDIT).toBe(7);
  });

  test('מצב ביקורת עצמאי (§12): audit על artifacts קיימים; דגלי layout/input אינם מתערבבים', async () => {
    // הרצת layout מלאה קודם
    const layoutOutcome = await runCli(args());
    expect(layoutOutcome.exitCode).toBe(EXIT_SUCCESS);
    const c = current as Case;
    // ביקורת בקריאה נפרשת על ה-artifacts
    const auditOutcome = await runAuditCli(join(c.out, 'layout.json'), undefined);
    expect(auditOutcome.exitCode).toBe(EXIT_SUCCESS);
    expect(auditOutcome.audit?.ok).toBe(true);
    expect(auditOutcome.audit?.counts.HIGH).toBe(0);
    expect(auditOutcome.audit?.stats.contentAtoms).toBeGreaterThan(100);
    // audit.json נכתב
    const auditJson = JSON.parse(await readFile(join(c.out, 'audit.json'), 'utf8'));
    expect(auditJson.ok).toBe(true);
    // דגלים סותרים נדחים
    expect(parseCliArgs(['--layout', 'x', '--input', 'y']).ok).toBe(false);
    expect(parseCliArgs(['--layout', 'x']).ok).toBe(true);
    expect(parseCliArgs([]).ok).toBe(false);
  });

  test('דגל שגוי/חסר ערך ⇒ exit 2 בניתוח', () => {
    expect(parseCliArgs(['--input']).ok).toBe(false);
    expect(parseCliArgs(['--input', 'a', '--out', 'b', '--repeat', '0']).ok).toBe(false);
  });

  test('שלב 40: דגל מנוע — legacy נעול (אין מסלול צד); bogus נדחה; ברירת מחדל next', async () => {
    // legacy ⇒ דחייה מקוטלגת לפני כל ריצה — המנוע כלל לא מופעל, אין artifacts
    const c = current as Case;
    await expect(runCli(args({ engine: 'legacy' }))).rejects.toMatchObject({
      exitCode: EXIT_USAGE,
      catalogKey: 'errors.cli.ENGINE_LEGACY_LOCKED',
      params: { baseline: 'docs/migration/baseline' },
    });
    // ערך לא חוקי ⇒ שגיאת שימוש
    expect(parseCliArgs(['--input', 'a', '--out', 'b', '--engine', 'bogus']).ok).toBe(false);
    // ברירת מחדל next — רץ ומניפסט נושא את הדגל
    const outcome = await runCli(args({ engine: 'next' }));
    expect(outcome.exitCode).toBe(EXIT_SUCCESS);
    expect((outcome.report as { engine: string }).engine).toBe('next');
    const manifest = JSON.parse(await readFile(join(c.out, 'manifest.json'), 'utf8'));
    expect(manifest.engine).toBe('next');
  });
});

describe('שלב 68: נכסים חזותיים v2 ב-CLI — מניפסטים, זהות נעולה ושגיאות ממוקמות', () => {
  test('דגלי המניפסטים: ברירות מחדל, ערכים מפורשים ודחיית שמות בלתי-מוכרים', () => {
    const base = parseCliArgs(['--input', 'a', '--out', 'b']);
    if (!base.ok) throw new Error('base args should parse');
    expect(base.args.shaarManifest).toBe('assets/shaar/manifest.json');
    expect(base.args.ornamentsManifest).toBe('assets/ornaments/manifest.json');
    const explicit = parseCliArgs(['--input', 'a', '--out', 'b', '--shaar-manifest', 'x.json', '--ornaments-manifest', 'y.json']);
    if (!explicit.ok) throw new Error('explicit args should parse');
    expect(explicit.args.shaarManifest).toBe('x.json');
    expect(explicit.args.ornamentsManifest).toBe('y.json');
    expect(parseCliArgs(['--input', 'a', '--out', 'b', '--shaar', 'x']).ok).toBe(false);
  });

  test('request.json נושא assetsManifestSha256 אמיתי ודטרמיניסטי; layoutHash אינו מושפע (§6.7)', async () => {
    const c = current as Case;
    const outA = join(c.tmp, 'a');
    const outB = join(c.tmp, 'b');
    const a = await runCli(args({ out: outA }));
    const b = await runCli(args({ out: outB }));
    expect(a.exitCode).toBe(EXIT_SUCCESS);
    expect(b.exitCode).toBe(EXIT_SUCCESS);
    const reqA = JSON.parse(await readFile(join(outA, 'request.json'), 'utf8')) as { assets: { assetsManifestSha256: string } };
    const reqB = JSON.parse(await readFile(join(outB, 'request.json'), 'utf8')) as { assets: { assetsManifestSha256: string } };
    expect(reqA.assets.assetsManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(reqA.assets.assetsManifestSha256).not.toBe('0'.repeat(64));
    expect(reqA.assets.assetsManifestSha256).toBe(reqB.assets.assetsManifestSha256);
    // הזהות אינה נכנסת ל-layoutHash — שתי הריצות זהות גם בעמודים וגם ב-hash
    expect((a.report as { layoutHash: string }).layoutHash).toBe((b.report as { layoutHash: string }).layoutHash);
  }, 180_000);

  test('מניפסט שערים מושחת ⇒ exit 3 + errors.cli.ASSETS_MANIFEST_INVALID עם נתיב וסיבה', async () => {
    const c = current as Case;
    const bad = join(c.tmp, 'bad-shaar-manifest.json');
    await writeFile(bad, JSON.stringify({ schemaVersion: 1, kind: 'shaar' }), 'utf8');
    await expect(runCli(args({ 'shaar-manifest': bad }))).rejects.toMatchObject({
      exitCode: EXIT_INPUT,
      catalogKey: 'errors.cli.ASSETS_MANIFEST_INVALID',
      params: { path: bad },
    });
  });
});
