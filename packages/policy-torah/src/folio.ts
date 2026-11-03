/**
 * folio.ts — כותרות רצות, פוליו וגימטריה (שלב 67; אפיון §10.1, §11.1, §16;
 * פרק ח/M7 — שער הפרק).
 *
 * חלקי העמוד הקבועים — מדויקים ועקביים כמו בישנה, אך מבוססי עוגנים
 * אמיתיים: הכותרות הרצות נבנות אחרי שהעוגנים ידועים (headingAnchorsOf —
 * שלב 60), וגובהן שמור ב-Page Template כבר בשלב הפריסה (headerHeightLu —
 * שלב 50). הגימטריה — domain formatter נפרד (לא Intl.NumberFormat),
 * דטרמיניסטי לחלוטין.
 */
import { splitShaarTitle } from './headings.js';

// ─────────────────────────── גימטריה ───────────────────────────

const GEMATRIA_HUNDREDS: readonly string[] = Object.freeze(['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']);
const GEMATRIA_TENS: readonly string[] = Object.freeze(['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']);
const GEMATRIA_ONES: readonly string[] = Object.freeze(['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']);

/**
 * גימטריה — האלגוריתם ההיסטורי במדויק (toGematria): טו/טז במקום יה/יו;
 * מאות עד תתק (999). תחום ההגדרה: 1..999 (ספרים אינם חורגים); מחוץ לתחום
 * או לא-חיובי ⇒ מחרוזת ריקה (דטרמיניסטי; לא Intl.NumberFormat).
 */
export function gematriaOf(n: number): string {
  if (!Number.isSafeInteger(n) || n <= 0 || n > 999) return '';
  if (n === 15) return 'טו';
  if (n === 16) return 'טז';
  let num = n;
  let str = '';
  const h = Math.floor(num / 100);
  if (h > 0) {
    str += GEMATRIA_HUNDREDS[h] ?? '';
    num %= 100;
  }
  const t = Math.floor(num / 10);
  const o = num % 10;
  if (t === 1 && (o === 5 || o === 6)) {
    str += o === 5 ? 'טו' : 'טז';
  } else {
    str += GEMATRIA_TENS[t]! + GEMATRIA_ONES[o]!;
  }
  return str;
}

/**
 * גימטריה עם גרשיים (toGematriaWithGeresh): אות בודדת ⇒ גרש (א');
 * רבת-אותיות ⇒ גרשיים לפני האות האחרונה (ד׳).
 */
export function gematriaWithGereshOf(n: number): string {
  const raw = gematriaOf(n);
  if (raw.length === 0) return '';
  if (raw.length === 1) return `${raw}'`;
  return `${raw.slice(0, -1)}"${raw.slice(-1)}`;
}

// ─────────────────────────── פוליו ומספור ───────────────────────────

/** פורמט המספר המודפס (page-num-format). */
export type FolioFormat = 'gematria' | 'numbers';

/** מדיניות פוליו (§11.1: page-num-initial-value; שערים לא ממוספרים). */
export interface FolioPolicy {
  readonly format: FolioFormat;
  /** page-num-initial-value — המספר הלוגי של העמוד הפיזי הראשון. */
  readonly initialValue: number;
}

/** תווית הפוליו של עמוד. */
export interface FolioLabel {
  /** המספר הלוגי (פיזי − 1 + התחלתי) — תמיד קיים (מודל פיזי/לוגי). */
  readonly logical: number;
  /** התווית המודפסת; null = נסתר (עמודי שער — folio: 'hide' בתבנית; §11.1). */
  readonly printed: string | null;
}

/** מדיניות פוליו מההגדרות. */
export function folioPolicyOf(settings: { readonly values: Readonly<Record<string, unknown>> }): FolioPolicy {
  const rawFormat = String(settings.values['page-num-format'] ?? 'gematria');
  const rawInitial = settings.values['page-num-initial-value'];
  let initial = 1;
  if (typeof rawInitial === 'string' && /^-?\d+$/.test(rawInitial.trim())) initial = Number(rawInitial.trim());
  else if (typeof rawInitial === 'number' && Number.isSafeInteger(rawInitial)) initial = rawInitial;
  if (initial < 0 || initial > 9999) initial = 1;
  return Object.freeze({
    format: rawFormat === 'numbers' ? 'numbers' as const : 'gematria' as const,
    initialValue: initial,
  });
}

const SHAAR_KINDS: ReadonlySet<string> = new Set(['main-shaar', 'back-shaar', 'sub-shaar']);

/**
 * תווית הפוליו של עמוד פיזי: המספר הלוגי תמיד נגזר (פיזי − 1 + התחלתי);
 * ההדפסה — לפי הפורמט; עמודי שער אינם ממוספרים (printed=null; התבניות
 * כבר נושאות folio:'hide' משלב 50 — כאן המדיניות משלימה את המודל הלוגי).
 */
export function folioLabelOf(
  physicalPageIndex: number,
  pageKind: string,
  policy: FolioPolicy,
): FolioLabel {
  const logical = policy.initialValue + (physicalPageIndex - 1);
  if (SHAAR_KINDS.has(pageKind)) return { logical, printed: null };
  if (logical <= 0) return { logical, printed: null };
  return { logical, printed: policy.format === 'gematria' ? gematriaOf(logical) : String(logical) };
}

// ─────────────────────────── כותרות רצות ───────────────────────────

/** סוגי חריץ כותרת רצה (hdr-{l,c,r}-type; המקורות ההיסטוריים). */
export type RunningHeadSlotType =
  | 'none'
  | 'book_title'
  | 'book_title_split_r'
  | 'book_title_split_l'
  | 'h1_full'
  | 'h1_primary'
  | 'h2_without_siman'
  | 'custom';

/** ההקשר שהכותרות הרצות נבנות ממנו — אחרי שהעוגנים ידועים (§11.1). */
export interface RunningHeadContext {
  /** שם הספר (book-title). */
  readonly bookTitle: string;
  /** כותרת ה-H1 הפעילה בעמוד (מהעוגנים; ריקה לפני הראשונה). */
  readonly currentH1Title: string;
  /** כותרת ה-H2 הפעילה (מהעוגנים; ללא תגית הסימן). */
  readonly currentH2Title: string;
}

/** מדיניות כותרות רצות (hdr-*; §11.1). */
export interface RunningHeadPolicy {
  /** hdr-distinct-even-odd — עמודים זוגיים/אי-זוגיים שונים (recto/verso). */
  readonly distinctEvenOdd: boolean;
  /** hdr-h1-title-mode — full (כל הכותרת) | primary (החלק שלפני המקף — פיצול שלב 60). */
  readonly h1TitleMode: 'full' | 'primary';
  /** חריצי recto (אי-זוגי) — ימין/מרכז/שמאל. */
  readonly recto: { readonly right: RunningHeadSlotType; readonly center: RunningHeadSlotType; readonly left: RunningHeadSlotType };
  /** חריצי verso (זוגי) — כש-distinctEvenOdd; אחרת זהים ל-recto. */
  readonly verso: { readonly right: RunningHeadSlotType; readonly center: RunningHeadSlotType; readonly left: RunningHeadSlotType };
  /** טקסטים מותאמים אישית (hdr-*-custom). */
  readonly customTexts: Readonly<Record<string, string>>;
}

/** ברירות המחדל של Orange לפי חריץ (נעולות): ימין=חצי-ראשון, מרכז=H2 בלי סימן, שמאל=חצי-שני. */
const SLOT_DEFAULTS: Readonly<Record<'l' | 'c' | 'r', RunningHeadSlotType>> = Object.freeze({
  r: 'book_title_split_r',
  c: 'h2_without_siman',
  l: 'book_title_split_l',
});

function slotTypeOf(settings: { readonly values: Readonly<Record<string, unknown>> }, slot: 'l' | 'c' | 'r', evenOdd: 'recto' | 'verso'): RunningHeadSlotType {
  const key = evenOdd === 'recto' ? `hdr-${slot}-type` : `hdr-${slot}-even-type`;
  const raw = String(settings.values[key] ?? settings.values[`hdr-${slot}-type`] ?? SLOT_DEFAULTS[slot]);
  const valid: readonly RunningHeadSlotType[] = ['none', 'book_title', 'book_title_split_r', 'book_title_split_l', 'h1_full', 'h1_primary', 'h2_without_siman', 'custom'];
  return (valid as readonly string[]).includes(raw) ? raw as RunningHeadSlotType : 'none';
}

/** מדיניות כותרות רצות מההגדרות (ברירות Orange נעולות). */
export function runningHeadPolicyOf(settings: { readonly values: Readonly<Record<string, unknown>> }): RunningHeadPolicy {
  const distinct = settings.values['hdr-distinct-even-odd'] === true || settings.values['hdr-distinct-even-odd'] === undefined;
  const mode = String(settings.values['hdr-h1-title-mode'] ?? 'full');
  return Object.freeze({
    distinctEvenOdd: distinct,
    h1TitleMode: mode === 'primary' ? 'primary' as const : 'full' as const,
    recto: Object.freeze({
      right: slotTypeOf(settings, 'r', 'recto'),
      center: slotTypeOf(settings, 'c', 'recto'),
      left: slotTypeOf(settings, 'l', 'recto'),
    }),
    verso: Object.freeze({
      right: slotTypeOf(settings, 'r', 'verso'),
      center: slotTypeOf(settings, 'c', 'verso'),
      left: slotTypeOf(settings, 'l', 'verso'),
    }),
    customTexts: Object.freeze({
      r: String(settings.values['hdr-r-custom'] ?? ''),
      c: String(settings.values['hdr-c-custom'] ?? ''),
      l: String(settings.values['hdr-l-custom'] ?? ''),
    }),
  });
}

function slotTextOf(type: RunningHeadSlotType, ctx: RunningHeadContext, policy: RunningHeadPolicy, slot: 'l' | 'c' | 'r'): string {
  switch (type) {
    case 'none':
      return '';
    case 'book_title':
      return ctx.bookTitle;
    case 'book_title_split_r': {
      // חצי ראשון של שם הספר (עד אמצעו) — הימני; דטרמיניסטי
      const t = ctx.bookTitle.trim();
      return t.slice(0, Math.ceil(t.length / 2)).trim();
    }
    case 'book_title_split_l': {
      const t = ctx.bookTitle.trim();
      return t.slice(Math.ceil(t.length / 2)).trim();
    }
    case 'h1_full':
      return ctx.currentH1Title;
    case 'h1_primary':
      return splitShaarTitle(ctx.currentH1Title).primary; // פיצול כותרת — שלב 60
    case 'h2_without_siman':
      return ctx.currentH2Title;
    case 'custom':
      return policy.customTexts[slot] ?? '';
    default:
      return '';
  }
}

/**
 * הכותרת הרצה של עמוד — טהורה ודטרמיניסטית; נבנית אחרי שהעוגנים ידועים
 * (ההקשר מסופק על-ידי הקורא מ-headingAnchorsOf + כותרות המסמך); גובה
 * השורה שמור בתבנית כבר בפריסה (headerHeightLu) — אין הפתעות גובה.
 * same_as_even (§11.1): הקורא מחליט להשתמש בתוצאת ה-recto גם ל-verso —
 * התבניות מתעדות sameAs כשאין הבדל גאומטרי (שלב 50).
 */
export function runningHeadOf(
  physicalPageIndex: number,
  ctx: RunningHeadContext,
  policy: RunningHeadPolicy,
): { readonly right: string; readonly center: string; readonly left: string } {
  const isRecto = physicalPageIndex % 2 === 1;
  const slots = isRecto || !policy.distinctEvenOdd ? policy.recto : policy.verso;
  return Object.freeze({
    right: slotTextOf(slots.right, ctx, policy, 'r'),
    center: slotTextOf(slots.center, ctx, policy, 'c'),
    left: slotTextOf(slots.left, ctx, policy, 'l'),
  });
}
