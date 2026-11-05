/**
 * helpers.ts — עזרים משותפים לסוויטת ה־E2E הממוקדת (שלב 85; אפיון §17.1).
 *
 * עקרונות:
 *   1. האורקל הסמנטי הוא ה־CLI (תכנית שלב 85: "השוואת layoutHash ל־CLI כאורקל
 *      סמנטי"). ה־documentId חייב להיקבע ל־'cli-reference' — כמו בשלד
 *      הארכיטקטוני (tests/e2e-skeleton) — אחרת ה־itemIds ב־IR נבדלים וההשוואה
 *      תיכשל שלא לצורך. שם המסמך ב־UI הוא ה־documentId (שלב 77).
 *   2. אין מצב גולמי בדפדפן: כל טענה עוברת דרך ה־DOM של האפליקציה הבנויה
 *      (data-testid/data-setting-key/data-run-phase/data-layout-hash) —
 *      אין גישה ל־stores מבחוץ.
 *   3. אין sleeps — המתנה רק על תנאי נצפה (waitFor* / expect) או על
 *      הנפשת פריים (requestAnimationFrame) להוכחות שליליות.
 */
import { type Page, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const APP_URL = 'http://localhost:4173/';

/** ה־CLI הרשמי (§12.2) — אורקל הסמנטי של השלב. */
export const CLI_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'main.js');
/** מסמך הייחוס של השלד הארכיטקטוני — הקלט המשותף לאפליקציה ול־CLI. */
export const REFERENCE_SOURCE = join(REPO_ROOT, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
/** ה־documentId של ריצות ה־CLI — חובה להתאים בצד האפליקציה (ראו ראש הקובץ). */
export const ORACLE_DOCUMENT_ID = 'cli-reference';

export async function gotoApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
}

/**
 * ייבוא קובץ טקסט דרך כפתור "ייבוא טקסט" — ה־filechooser של האפליקציה.
 * ממתין לסיום הייבוא (קריאת הקובץ אסינכרונית ← ניתוח ← כתיבה):
 * השם נקבע לשם הקובץ והמקור בעורך. בלי המתנה, setDocumentName אחרי
 * הייבוא נדרס על ידי סיומו — תנאי מירוץ שנתגלה באימות האורקל (ה־documentId
 * חוזר לשם הקובץ וה־IR נבדל מה־CLI שלא לצורך).
 */
export async function importTextViaChooser(page: Page, filePath: string): Promise<void> {
  const chooserP = page.waitForEvent('filechooser');
  await page.getByTestId('import-text').click();
  const chooser = await chooserP;
  await chooser.setFiles(filePath);
  const expectedName = filePath.split(/[\\/]/).pop() ?? '';
  await expect(page.getByTestId('document-name')).toHaveValue(expectedName, { timeout: 15_000 });
  await expect(page.getByTestId('source-editor')).not.toBeEmpty({ timeout: 15_000 });
}

/** המתנה לסיום ייבוא דוגמה (fetch אסינכרוני ← ניתוח ← כתיבה) — לפני setDocumentName. */
export async function waitForImportedSample(page: Page, samplePath: string): Promise<void> {
  const expectedName = samplePath.replace(/^\.\//, '');
  await expect(page.getByTestId('document-name')).toHaveValue(expectedName, { timeout: 15_000 });
  await expect(page.getByTestId('source-editor')).not.toBeEmpty({ timeout: 15_000 });
}

/** קובץ זמני מחוץ לריפו (tests/e2e אינה כותבת לתוך מלאי ה־git). */
export function writeTemp(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'tora-e2e-'));
  const p = join(dir, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

/** שם המסמך = ה־documentId של הריצה (שלב 77). מי שקורא ממתין קודם לסיום ייבוא. */
export async function setDocumentName(page: Page, name: string): Promise<void> {
  await page.getByTestId('document-name').fill(name);
  await expect(page.getByTestId('document-name')).toHaveValue(name);
}

export async function openSettings(page: Page): Promise<void> {
  const btn = page.getByTestId('toggle-settings');
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
}

/** שינוי הגדרת select מהמרשם דרך הטופס הנגול (SettingRow). */
export async function setSettingSelect(page: Page, key: string, value: string): Promise<void> {
  const row = page.locator(`[data-setting-key="${key}"]`);
  await expect(row).toBeVisible();
  await row.locator('select[data-setting-control="select"]').selectOption(value);
}

/** הרצת עימוד והמתנה ל־done; נכשל מפורש בהגעה ל־error/cancelled. */
export async function runAndWaitDone(page: Page, timeout = 240_000): Promise<void> {
  await page.getByTestId('run-typeset').click();
  const phase = page.getByTestId('run-typeset');
  await expect(phase).toHaveAttribute('data-run-phase', /done|error|cancelled/, { timeout });
  await expect(phase).toHaveAttribute('data-run-phase', 'done', { timeout: 5_000 });
}

/** ה־hash המלא של התוצאה המתקבלת (64 תווי hex) — מה־UI, לא מהמודל. */
export async function layoutHashOf(page: Page): Promise<string> {
  const v = await page.locator('[data-layout-hash]').getAttribute('data-layout-hash');
  expect(v).not.toBeNull();
  expect(String(v)).toMatch(/^[0-9a-f]{64}$/);
  return String(v);
}

export interface CliLayout {
  layoutHash: string;
  pages: number;
  findings: readonly { readonly code: string; readonly severity: string }[];
}

let cliSeq = 0;

/**
 * ריצת ה־CLI (אורקל): קודי יציאה 0 (הצלחה) ו־7 (ממצאי ביקורת HIGH) שניהם
 * ריצה תקינה של המנוע; כל קוד אחר הוא כשל אמת.
 */
export function cliLayoutRun(opts: { input: string; settings?: Record<string, unknown> }): CliLayout {
  const out = mkdtempSync(join(tmpdir(), `e2e-cli-${++cliSeq}-`));
  const args = [CLI_BIN, '--input', opts.input, '--out', out];
  if (opts.settings !== undefined) {
    const sp = join(out, 'layer.json');
    writeFileSync(sp, JSON.stringify(opts.settings), 'utf8');
    args.push('--settings', sp);
  }
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (r.status !== 0 && r.status !== 7) {
    throw new Error(`CLI נכשל (${r.status}): ${String(r.stderr).slice(0, 400)}`);
  }
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as { layoutHash: string; pages: number };
  const audit = JSON.parse(readFileSync(join(out, 'audit.json'), 'utf8')) as { findings?: { code: string; severity: string }[] };
  return { layoutHash: report.layoutHash, pages: report.pages, findings: audit.findings ?? [] };
}

/** הטקסט שמכריח ממצא HIGH אחד עם span (מילה בלתי־שבירה של 300 אותיות). */
export const OVERFLOW_LONG_WORD = 'א'.repeat(300);
export const OVERFLOW_TEXT =
  'פרק ראשון\n' +
  'שורה רגילה ראשונה בפסקה זו עם מילים רגילות למדי.\n\n' +
  OVERFLOW_LONG_WORD +
  '\n\nפסקה אחרונה קצרה.\n';

/** קלט שהפרסר דוחה — sentinel בקבוק (מקור: בדיקות הרכיב של שלב 80). */
export const PARSE_ERROR_TEXT = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט עם \u0001 sentinel\n';

/**
 * הוכחה שלילית שהריצה חסומה: לחיצה על "עדכן ועמד מחדש" ואז הנפשת שני
 * פריימים — אילו הוגש job, הפאזה הייתה מוחלפת סינכרונית בתוך הקליק (begin
 * רץ באותו בלוק); פריים עבר והפאזה idle ⇐ לא הוגש שום job.
 */
export async function expectRunBlocked(page: Page): Promise<void> {
  await page.getByTestId('run-typeset').click();
  await page.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
  await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'idle');
}
