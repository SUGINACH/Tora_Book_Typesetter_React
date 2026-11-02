/**
 * args.ts — ניתוח טיעוני שורת הפקודה של ה־reference runner (שלב 34; אפיון §12.2).
 *
 * אין תלות חיצונית — מנתח ידני דטרמיניסטי; דגלים לא מוכרים/חסרים ⇒ שגיאת
 * שימוש ממוקמת. נתיבים נשארים כמו שסופקו (הרחבה/קיום נבדקים בטעינה).
 */
import type { TraceLevel } from '@tora/layout-api';

export interface CliArgs {
  readonly input: string;
  readonly out: string;
  readonly settings?: string;
  readonly preset?: string;
  readonly fontsManifest: string;
  readonly fontsDir: string;
  readonly bodyFont: string;
  readonly trace: TraceLevel;
  readonly repeat: number;
  readonly html: boolean;
  /** מצב audit עצמאי (§12: ביקורת בקריאה נפרשת): --layout layout.json. */
  readonly layout?: string;
  readonly request?: string;
  /** דגל מנוע מפורש (שלב 40; §18-M4): legacy|next; ברירת מחדל next. */
  readonly engine: 'legacy' | 'next';
}

export type ArgsResult =
  | { readonly ok: true; readonly args: CliArgs; readonly help: boolean }
  | { readonly ok: false; readonly error: string; readonly hint?: string };

const DEFAULT_FONTS_MANIFEST = 'assets/fonts/manifest.json';
export const DEFAULT_BODY_FONT = 'Guttman-Rashi-Normal.woff2' as const;
const TRACE_LEVELS: readonly TraceLevel[] = ['off', 'summary', 'decisions', 'full'];

export const USAGE = `@tora/cli — Node 22 reference runner (שלב 34; אפיון §12.2)

שימוש:
  engine:layout --input <book.txt> --out <dir> [דגלים]

דגלים:
  --input <path>        מסמך מקור (טקסט תורני בתחביר הפרסר) — חובה
  --out <dir>           ספריית פלט ל-artifacts — חובה
  --settings <path>     שכבת הגדרות מסמך (JSON; על בסיס ברירות המחדל של המרשם)
  --preset <path>       שכבת פריסט (JSON; לפני שכבת המסמך)
  --fonts-manifest <p>  מניפסט גופנים (ברירת מחדל: ${DEFAULT_FONTS_MANIFEST})
  --fonts-dir <path>    ספריית קובצי הגופנים (ברירת מחדל: ספריית המניפסט)
  --body-font <id|file> גופן הגוף לפי fontId או שם קובץ (ברירת מחדל: ${DEFAULT_BODY_FONT})
  --trace <level>       off | summary | decisions | full (ברירת מחדל: off)
  --engine <name>       legacy | next (ברירת מחדל: next; לריצות reference בלבד — שלב 40)
  --repeat <n>          מספר ריצות לאימות דטרמיניזם (ברירת מחדל: 1; חייב להיות זהה)
  --html                יצירת preview.html נוסף דרך render-html
  --layout <path>       מצב ביקורת: audit של layout.json קיים (עם request.json לצדו)
  --request <path>      בקשת המקור לביקורת (ברירת מחדל: request.json לצד ה-layout)
  --help                הצגת הודעה זו

פלט (בספריית --out): layout.json, manifest.json, ledger.json (כש-trace≠off),
request.json (קלט מלא לשחזור), report.json (סיכום קנוני), audit.json (ממצאי
הביקורת, שלב 38) ו-preview.html (עם --html).
מצב ביקורת (engine:audit --layout layout.json): ביקורת בקריאה נפרשת (§12)
על artifacts קיימים; יציאה 7 כשיש ממצאי HIGH.
הרצה חוסמת רשת חיצונית מרגע ההתחלה (אפיון §19 — reference runs offline).

קודי יציאה: 0 הצלחה · 2 שימוש · 3 קלט · 4 גופן/מדידה · 5 מנוע · 6 פלט · 7 ממצאי ביקורת.` as const;

export function parseCliArgs(argv: readonly string[]): ArgsResult {
  const raw = new Map<string, string>();
  const flags = new Set<string>();
  let positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--help' || a === '-h') return { ok: true, help: true, args: nullArgs() };
    if (a === '--html') { flags.add('html'); continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        return { ok: false, error: `הדגל --${key} דורש ערך`, hint: USAGE };
      }
      if (raw.has(key)) {
        return { ok: false, error: `הדגל --${key} סופק פעמיים`, hint: USAGE };
      }
      raw.set(key, next as string);
      i += 1;
      continue;
    }
    positional = [...positional, a];
  }
  if (positional.length > 0) {
    return { ok: false, error: `ארגומנט עודף בלי דגל: ${positional.join(' ')}`, hint: USAGE };
  }

  const input = raw.get('input');
  const out = raw.get('out');
  const layout = raw.get('layout');
  if (layout !== undefined && input !== undefined) {
    return { ok: false, error: 'מצב ביקורת (--layout) אינו מתערבב עם --input', hint: USAGE };
  }
  if (layout === undefined && input === undefined) {
    return { ok: false, error: 'חסר --input <path> (או --layout למצב ביקורת)', hint: USAGE };
  }
  if (layout === undefined && out === undefined) {
    return { ok: false, error: 'חסר --out <dir>', hint: USAGE };
  }

  const traceRaw = raw.get('trace') ?? 'off';
  if (!(TRACE_LEVELS as readonly string[]).includes(traceRaw)) {
    return { ok: false, error: `--trace שגוי: ${traceRaw} (חוקי: ${TRACE_LEVELS.join('|')})`, hint: USAGE };
  }

  const repeatRaw = raw.get('repeat') ?? '1';
  const repeat = Number(repeatRaw);
  if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 100) {
    return { ok: false, error: `--repeat שגוי: ${repeatRaw} (חוקי: שלם 1..100)`, hint: USAGE };
  }

  const engineRaw = raw.get('engine') ?? 'next';
  if (engineRaw !== 'legacy' && engineRaw !== 'next') {
    return { ok: false, error: `--engine שגוי: ${engineRaw} (חוקי: legacy|next)`, hint: USAGE };
  }
  const known = new Set(['input', 'out', 'settings', 'preset', 'fonts-manifest', 'fonts-dir', 'body-font', 'trace', 'repeat', 'layout', 'request', 'engine']);
  for (const k of raw.keys()) {
    if (!known.has(k)) return { ok: false, error: `דגל לא מוכר: --${k}`, hint: USAGE };
  }

  const fontsManifest = raw.get('fonts-manifest') ?? DEFAULT_FONTS_MANIFEST;
  const fontsDir = raw.get('fonts-dir') ?? dirnameOf(fontsManifest);
  return {
    ok: true,
    help: false,
    args: {
      input: input ?? '',
      out: out ?? '',
      settings: raw.get('settings'),
      preset: raw.get('preset'),
      fontsManifest,
      fontsDir,
      bodyFont: raw.get('body-font') ?? DEFAULT_BODY_FONT,
      trace: traceRaw as TraceLevel,
      repeat,
      html: flags.has('html'),
      engine: engineRaw as 'legacy' | 'next',
      ...(layout !== undefined ? { layout } : {}),
      ...(raw.get('request') !== undefined ? { request: raw.get('request') } : {}),
    },
  };
}

function dirnameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx === -1 ? '.' : p.slice(0, idx);
}

function nullArgs(): CliArgs {
  return {
    input: '', out: '', fontsManifest: '', fontsDir: '', bodyFont: '', trace: 'off', repeat: 1, html: false, engine: 'next',
  };
}
