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
import { parseCliArgs, runCli, EXIT_CODES, EXIT_INPUT, EXIT_USAGE, EXIT_FONT, EXIT_SUCCESS } from '../src/index.js';

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

  test('כל קודי היציאה החוקיים מוגדרים וזהים לתיעוד', () => {
    expect(EXIT_CODES).toEqual([0, 2, 3, 4, 5, 6]);
    expect(EXIT_USAGE).toBe(2);
  });
});
