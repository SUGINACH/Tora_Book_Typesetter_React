/**
 * assets.ts — מניפסטי נכסים חזותיים v2: שערים ועיטורים (שלב 68; אפיון §7, §13; M8).
 *
 * מודול טהור — אפס תלויות ואפס API של Node (רץ גם ב-Worker וב-Tauri; גרף §5).
 * הגישה זהה למניפסט הגופנים (שלב 23): מקור אמת אחד בקוד, מחולל דטרמיניסטי
 * שמייצא את המניפסט מהקבצים בפועל, ומאמת שמאמת את הדיסק מול המניפסט —
 * שניהם מייבאים את הפונקציות מכאן (לקח ADR-001: אין כפילות נוסחאות).
 *
 * עקרונות:
 *   1. מזהים קנוניים נגזרים מהתוכן (shaar:v2|סוג|sha16#אינדקס; orn:v2|קובץ|sha16#אינדקס)
 *      — מרחב המזהים הישן משותף ואינו ייחודי (65 קבוצות חוצות-קבצים + כפילות
 *      אחת בתוך section_dividers.json — החלטה D-004); המזהה הקנוני נושא קובץ+אינדקס
 *      וה-legacyId נשמר לשימור הפרובננס.
 *   2. תיבות הטקסט של השערים נרשמות נאמנה כשברי-עמוד ללא חיתוך וללא תיקון שקט:
 *      בנתוני המקור יש תיבות שחורגות מהעמוד (עד 127% ברוחב — מיקום על דף-כפול
 *      וירטואלי) ותיבות מנוונות (left+right > 100%). חיתוך/הצמדה ייעשו רק בצריכה
 *      (אזורים בטוחים — שלב 69), לא ברישום. חלוקה מדויקת ללא עיגול (ADR-001:
 *      העיגול מרוכז ב-measurement-api בלבד).
 *   3. 27 "חריצי תפקיד" מובנים (17 סגנון + 10 ממד) — נעולים מול מרשם ההגדרות
 *      ו-settings-matrix.md (ברירות Orange: section-divider-style=spear,
 *      note-rule-style=star, hdr-divider-style=gray; השאר none).
 *
 * החרצות המתועדות מטבלת החריצים (סיבה לכל אחת): cbg-h0Open-mode, cbg-h2Open-mode,
 * cbg-regular-mode — בוררי נכס שער (SVG), לא ציור מובנה — שייכים לצד הנכסים;
 * h2-title-orn-mode — מתג אב של קבוצת h2-title-ornament-* (הבוררים בפועל הם הארבעה);
 * hdr-c-type — סוג תוכן כותרת רצה (מדיניות שלב 67; "spear" שם הוא אחד משני סוגי
 * תוכן, לא חריץ ציור); drop-word-mode — לא ציור; dim-secdiv-h/w — גאומטריית
 * המפריד מוזרקת כ-chapterEndDividerLu (שלב 66) ותימדד מהנכס בפועל (שלב 69+),
 * לא חריץ מובנה.
 */

import { ContentModelError } from './errors.js';

/** גרסת הסכמה של מניפסטי הנכסים (v2 — שלב 68; v1 תועדה בשלב 2). */
export const ASSETS_MANIFEST_SCHEMA_VERSION = 2 as const;

/** העמוד הפיזי של שער — A4 (מ"מ). עוגן המרה לאזורים הבטוחים (שלב 69). */
export const SHAAR_PHYSICAL_PAGE_MM: Readonly<{ width: number; height: number }> = Object.freeze({
  width: 210,
  height: 297,
});

/** סוגי השערים — אחד לקובץ מקור. */
export const SHAAR_KINDS: readonly string[] = Object.freeze(['main', 'back', 'sub']);

/** מיפוי קובץ מקור → סוג שער (המחולל והמאמת מייבאים מכאן — מקור אמת אחד). */
export const SHAAR_FILE_KINDS: Readonly<Record<string, string>> = Object.freeze({
  'shaar_main.json': 'main',
  'shaar_back.json': 'back',
  'shaar_sub.json': 'sub',
});

/** קובצי העיטורים ותפקידם הסמנטי (§13; מהם נגזר גם סוג הקובץ במניפסט). */
export const ORNAMENT_FILE_ROLES: Readonly<Record<string, { kind: string; role: string }>> = Object.freeze({
  'ornaments_up_down.json': {
    kind: 'up-down',
    role: 'עיטורים אנכיים — מעל ומתחת לבלוק (up/down)',
  },
  'ornaments_left_right.json': {
    kind: 'left-right',
    role: 'עיטורים אופקיים — שני צדי הבלוק (left/right)',
  },
  'header_ornaments.json': {
    kind: 'header',
    role: 'מאגר עיטורי כותרות H2/H3',
  },
  'section_dividers.json': {
    kind: 'section-divider',
    role: 'מפרידי סעיפים (section-divider)',
  },
  'note_rules.json': {
    kind: 'note-rules',
    role: 'קווי מפריד אזור הערות (note-rule)',
  },
});

/** הציורים המובנים — נקודת ההגדרה היחידה (ההיסטוריה של Orange). */
export const BUILTIN_DRAWINGS: readonly string[] = Object.freeze(['none', 'spear', 'plain', 'star', 'gray']);

/** חריץ תפקיד מובנה — הגדרה שבוחרת ציור מובנה (style) או קובעת את ממדו (dimension). */
export interface BuiltinRoleSlot {
  /** המפתח הקנוני במרשם ההגדרות. */
  readonly key: string;
  readonly kind: 'style' | 'dimension';
  /** ברירת המחדל הנעולה: שם ציור (style) או ערך עם יחידה (dimension). */
  readonly defaultValue: string;
  /** תיאור התפקיד בעברית. */
  readonly role: string;
}

/**
 * 27 חריצי תפקיד מובנים — 17 סגנון + 10 ממד. הסדר קנוני וקפוא.
 * המאמת נועל את הברירות מול settings-matrix.md ואת המפתחות מול המרשם.
 */
export const BUILTIN_ROLE_SLOTS: readonly BuiltinRoleSlot[] = Object.freeze([
  // ── 17 סגנון ──
  { key: 'h2-ornament-top-style', kind: 'style', defaultValue: 'none', role: 'עיטור עליון לכותרת H2' },
  { key: 'h2-ornament-bottom-style', kind: 'style', defaultValue: 'none', role: 'עיטור תחתון לכותרת H2' },
  { key: 'h2-ornament-set', kind: 'style', defaultValue: 'none', role: 'ערכת עיטורים לכותרת H2' },
  { key: 'h2-title-ornament-top-style', kind: 'style', defaultValue: 'none', role: 'עיטור עליון לשורת הכותרת H2' },
  { key: 'h2-title-ornament-bottom-style', kind: 'style', defaultValue: 'none', role: 'עיטור תחתון לשורת הכותרת H2' },
  { key: 'h2-title-ornament-l', kind: 'style', defaultValue: 'none', role: 'עיטור צד שמאל לשורת הכותרת H2' },
  { key: 'h2-title-ornament-r', kind: 'style', defaultValue: 'none', role: 'עיטור צד ימין לשורת הכותרת H2' },
  { key: 'h3-ornament-set', kind: 'style', defaultValue: 'none', role: 'ערכת עיטורים לכותרת H3' },
  { key: 'h3-ornament-l', kind: 'style', defaultValue: 'none', role: 'עיטור צד שמאל לכותרת H3' },
  { key: 'h3-ornament-r', kind: 'style', defaultValue: 'none', role: 'עיטור צד ימין לכותרת H3' },
  { key: 'col-divider-style', kind: 'style', defaultValue: 'none', role: 'מפריד בין טורים' },
  { key: 'hdr-divider-style', kind: 'style', defaultValue: 'gray', role: 'קו מפריד מתחת לכותרת רצה' },
  { key: 'note-rule-style', kind: 'style', defaultValue: 'star', role: 'קו מפריד אזור הערות' },
  { key: 'note-header-orn-l', kind: 'style', defaultValue: 'none', role: 'עיטור שמאלי לכותרת אזור ההערות' },
  { key: 'note-header-orn-r', kind: 'style', defaultValue: 'none', role: 'עיטור ימני לכותרת אזור ההערות' },
  { key: 'section-divider-style', kind: 'style', defaultValue: 'spear', role: 'מפריד סעיפים' },
  { key: 'page-num-frame', kind: 'style', defaultValue: 'none', role: 'מסגרת מספר עמוד' },
  // ── 10 ממד ──
  { key: 'dim-h2-top-h', kind: 'dimension', defaultValue: '1.25em', role: 'גובה עיטור עליון H2' },
  { key: 'dim-h2-top-w', kind: 'dimension', defaultValue: '65%', role: 'רוחב עיטור עליון H2' },
  { key: 'dim-h2-btm-h', kind: 'dimension', defaultValue: '1.25em', role: 'גובה עיטור תחתון H2' },
  { key: 'dim-h2-btm-w', kind: 'dimension', defaultValue: '65%', role: 'רוחב עיטור תחתון H2' },
  { key: 'dim-h2-title-side-h', kind: 'dimension', defaultValue: '1.1em', role: 'גובה עיטורי צד בשורת הכותרת H2' },
  { key: 'dim-h2-title-side-w', kind: 'dimension', defaultValue: '20px', role: 'רוחב עיטורי צד בשורת הכותרת H2' },
  { key: 'dim-h3-side-h', kind: 'dimension', defaultValue: '1em', role: 'גובה עיטורי צד H3' },
  { key: 'dim-h3-side-w', kind: 'dimension', defaultValue: '50px', role: 'רוחב עיטורי צד H3' },
  { key: 'dim-note-side-h', kind: 'dimension', defaultValue: '0.9em', role: 'גובה עיטורי צד לכותרת ההערות' },
  { key: 'dim-note-side-w', kind: 'dimension', defaultValue: '40px', role: 'רוחב עיטורי צד לכותרת ההערות' },
]);

// ─────────────────────────── viewBox ותיבות טקסט ───────────────────────────

/** ממדי viewBox של SVG (שני המספרים האחרונים — רוחב וגובה). */
export interface AssetViewBox {
  readonly width: number;
  readonly height: number;
}

const VIEWBOX_RE = /viewBox\s*=\s*"((?:[^"\\]|\\.)*)"/;

/**
 * חילוץ viewBox מטקסט SVG — null-safe: אין viewBox, או פחות/יותר מ-4 מספרים,
 * או רוחב/גובה לא-חיוביים או לא-סופיים ⇒ null (בלי זריקה).
 */
export function parseViewBox(svg: string): AssetViewBox | null {
  if (typeof svg !== 'string') return null;
  const m = VIEWBOX_RE.exec(svg);
  if (m === null) return null;
  const parts = (m[1] as string).trim().split(/[\s,]+/).filter((s) => s.length > 0);
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const width = nums[2] as number;
  const height = nums[3] as number;
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

/** תיבת טקסט של שער באחוזים — כפי שנמצאת במקור (שוליים: שמאל/ימין/מעלה/מטה). */
export interface ShaarPercentBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** תיבת טקסט כשברי-עמוד (0..1 בתחום העמוד; ערכים חורגים נרשמים נאמנה). */
export interface PageFractions {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * תיבת טקסט (אחוזים) ← שברי-עמוד. חלוקה מדויקת ב-100 ללא עיגול (ADR-001).
 *
 * ערכים שליליים או לא-סופיים ⇒ errors.assets.TEXTBOX_OUT_OF_PAGE (אין תיבה
 * "מתחת למקור העמוד"). ערכים החורגים מ-100% חוקיים ונרשמים כמו שהם — בנתוני
 * המקור תיבות שער-אחורי/משנה ממוקמות על דף-כפול וירטואלי ומגיעות עד 127%;
 * תיבות מנוונות (left+right > 100%) נשמרות נאמנה — אין תיקון שקט. החיתוך
 * לעמוד בפועל קורה בצריכה (אזורים בטוחים, שלב 69).
 */
export function textBoxToPageFractions(box: ShaarPercentBox): PageFractions {
  const b = box as unknown as Record<string, unknown>;
  for (const k of ['left', 'top', 'right', 'bottom'] as const) {
    const v = b[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw assetError('errors.assets.TEXTBOX_OUT_OF_PAGE', `השדה ${k} אינו מספר סופי: ${String(v)}`);
    }
    if (v < 0) {
      throw assetError('errors.assets.TEXTBOX_OUT_OF_PAGE', `השדה ${k} שלילי: ${v} — התיבה מתחת למקור העמוד`);
    }
  }
  return {
    left: box.left / 100,
    top: box.top / 100,
    right: box.right / 100,
    bottom: box.bottom / 100,
  };
}

/** עוגן פינה — x נמדד מימין (עמוד RTL), y מלמעלה; שניהם שברי-עמוד. */
export interface BoxAnchor {
  readonly x: number;
  readonly y: number;
}

/** ארבע פינות תיבת הטקסט — פיזיות (tl=שמאל-עליון חזותי), בקואורדינטות RTL. */
export interface BoxAnchors {
  readonly tl: BoxAnchor;
  readonly tr: BoxAnchor;
  readonly bl: BoxAnchor;
  readonly br: BoxAnchor;
}

/**
 * פינות תיבת הטקסט בקואורדינטות RTL (x מימין, y מלמעלה): tl.x = 1 − left,
 * tr.x = right, שורות לפי top ו-1 − bottom. עמוד מלא (כל השוליים 0) ⇒
 * tl=(1,0), tr=(0,0), bl=(1,1), br=(0,1).
 */
export function textBoxAnchorsOf(f: PageFractions): BoxAnchors {
  return {
    tl: { x: 1 - f.left, y: f.top },
    tr: { x: f.right, y: f.top },
    bl: { x: 1 - f.left, y: 1 - f.bottom },
    br: { x: f.right, y: 1 - f.bottom },
  };
}

/** תיבת טקסט במ"מ פיזיים (A4) — לאזורים הבטוחים של שלב 69. חלוקה/כפל מדויקים. */
export interface TextBoxMm {
  readonly leftMm: number;
  readonly topMm: number;
  readonly rightMm: number;
  readonly bottomMm: number;
}

/** שברי-עמוד של תיבת הטקסט חתוכה לעמוד — האזור הבטוח (§11.2; שלב 69). */
export interface SafeAreaFractions {
  /** מיקום האזור משמאל העמוד (0..1). */
  readonly left: number;
  /** מיקום האזור מראש העמוד (0..1). */
  readonly top: number;
  /** רוחב האזור (0..1). */
  readonly width: number;
  /** גובה האזור (0..1). */
  readonly height: number;
}

/**
 * האזור הבטוח של עיצוב שער — תיבת הטקסט חתוכה לתחום העמוד (§11.2; שלב 69):
 * תיבה פנימית [left, 1−right]×[top, 1−bottom], נחתכת ל-[0,1] בכל ציר.
 * תיבה חסרה (null) או מנוונת/פרושה מחוץ לעמוד (חיתוך ריק — נתוני המקור
 * של שער-אחורי/משנה ממוקמים על דף-כפול וירטואלי) ⇒ null: אין אזור
 * בטוח מהעיצוב, והצרכן (תבנית העמוד) נופל במפורש לברירת המחדל
 * המתועדת — תיבת השוליים הקבועה. אין תיקון שקט של הגאומטריה.
 */
export function safeAreaOf(textBox: PageFractions | null): SafeAreaFractions | null {
  if (textBox === null) return null;
  const x0 = Math.max(0, Math.min(1, textBox.left));
  const x1 = Math.max(0, Math.min(1, 1 - textBox.right));
  const y0 = Math.max(0, Math.min(1, textBox.top));
  const y1 = Math.max(0, Math.min(1, 1 - textBox.bottom));
  const width = x1 - x0;
  const height = y1 - y0;
  if (!(width > 0) || !(height > 0)) return null;
  return { left: x0, top: y0, width, height };
}

/** שברי-עמוד ← מ"מ פיזיים לפי A4 הנעול (עוגן המרה יחיד). */
export function pageFractionsToMm(f: PageFractions): TextBoxMm {
  return {
    leftMm: f.left * SHAAR_PHYSICAL_PAGE_MM.width,
    topMm: f.top * SHAAR_PHYSICAL_PAGE_MM.height,
    rightMm: f.right * SHAAR_PHYSICAL_PAGE_MM.width,
    bottomMm: f.bottom * SHAAR_PHYSICAL_PAGE_MM.height,
  };
}

// ─────────────────────────── מזהים קנוניים ───────────────────────────

const HEX64_RE = /^[0-9a-f]{64}$/;

function assetError(catalogKey: string, reason: string): ContentModelError {
  return new ContentModelError(catalogKey, { reason }, reason);
}

/**
 * מזהה קנוני של עיצוב שער — נגזר מהתוכן: סוג השער + 16 הספרות הראשונות של
 * SHA-256 של קובץ המקור + האינדקס בקובץ. `shaar:v2|main|4ac3285bbd68337f#0`.
 * קלט שאינו סוג חוקי / hash בן 64 hex / אינדקק שלם בטוח אי-שלילי ⇒
 * errors.assets.INVALID_ASSET_ID_INPUT.
 */
export function shaarAssetId(kind: string, fileSha256: string, index: number): string {
  if (!SHAAR_KINDS.includes(kind)) {
    throw assetError('errors.assets.INVALID_ASSET_ID_INPUT', `סוג שער לא חוקי: ${kind} (חוקיים: ${SHAAR_KINDS.join('|')})`);
  }
  if (typeof fileSha256 !== 'string' || !HEX64_RE.test(fileSha256)) {
    throw assetError('errors.assets.INVALID_ASSET_ID_INPUT', `fileSha256 אינו 64 hex: ${String(fileSha256)}`);
  }
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    throw assetError('errors.assets.INVALID_ASSET_ID_INPUT', `אינדקס אינו שלם בטוח אי-שלילי: ${String(index)}`);
  }
  return `shaar:v2|${kind}|${fileSha256.slice(0, 16)}#${index}`;
}

/**
 * מזהה קנוני של עיצוב עיטור — נגזר מהתוכן: שם הקובץ (ללא '|' ו-'#' כדי שהמזהה
 * יישאר חד-משמעי) + sha16 של הקובץ + אינדקס. `orn:v2|section_dividers.json|bdf527f5639ae3ad#100`.
 */
export function ornamentAssetId(file: string, fileSha256: string, index: number): string {
  if (typeof file !== 'string' || file.length === 0 || file.includes('|') || file.includes('#')) {
    throw assetError('errors.assets.INVALID_ASSET_ID_INPUT', `שם קובץ עיטור לא חוקי: ${String(file)}`);
  }
  if (typeof fileSha256 !== 'string' || !HEX64_RE.test(fileSha256)) {
    throw assetError('errors.assets.INVALID_ASSET_ID_INPUT', `fileSha256 אינו 64 hex: ${String(fileSha256)}`);
  }
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    throw assetError('errors.assets.INVALID_ASSET_ID_INPUT', `אינדקס אינו שלם בטוח אי-שלילי: ${String(index)}`);
  }
  return `orn:v2|${file}|${fileSha256.slice(0, 16)}#${index}`;
}

// ─────────────────────────── מבני מניפסט ───────────────────────────

/** אזכור מקור נעול — הריפו וה-commit שממנו הועברו הנכסים. */
export interface AssetsSourceRef {
  readonly repo: string;
  readonly commit: string;
}

/**
 * רישוי נכסים — תיעוד ישר: במקור (Orange) לא תועד רישיון לקובצי ה-SVG;
 * הבעלות נעולה בקטגוריית מלאי ההעברה. אין נכס בלי אזכור רישוי מפורש.
 */
export interface AssetsLicenseRef {
  readonly status: 'source-undocumented';
  readonly inventoryCategory: string;
}

/** רשומת קובץ מקור במניפסט. */
export interface AssetsFileEntry {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly kind: string;
  readonly count: number;
}

/** עיצוב שער — מזהה קנוני + legacyId + גאומטריה נגזרת. */
export interface ShaarDesignRecord {
  readonly id: string;
  readonly legacyId: string;
  readonly file: string;
  readonly index: number;
  readonly kind: string;
  readonly name: string;
  readonly svgSha256: string;
  readonly viewBox: AssetViewBox;
  readonly textBox: PageFractions | null;
  readonly anchors: BoxAnchors | null;
}

/** עיצוב עיטור — אין תיבת טקסט (העיטורים אינם מסגרת תוכן). */
export interface OrnamentDesignRecord {
  readonly id: string;
  readonly legacyId: string;
  readonly file: string;
  readonly index: number;
  readonly name: string;
  readonly svgSha256: string;
  readonly viewBox: AssetViewBox;
}

/** מניפסט שערים v2. */
export interface ShaarManifest {
  readonly schemaVersion: 2;
  readonly kind: 'shaar';
  readonly source: AssetsSourceRef;
  readonly license: AssetsLicenseRef;
  readonly files: readonly AssetsFileEntry[];
  readonly designs: readonly ShaarDesignRecord[];
}

/** מניפסט עיטורים v2 — 967 עיצובים + 27 חריצי תפקיד מובנים. */
export interface OrnamentsManifest {
  readonly schemaVersion: 2;
  readonly kind: 'ornaments';
  readonly source: AssetsSourceRef;
  readonly license: AssetsLicenseRef;
  readonly files: readonly AssetsFileEntry[];
  readonly designs: readonly OrnamentDesignRecord[];
  readonly builtinSlots: readonly BuiltinRoleSlot[];
}

// ─────────────────────────── פרסור (מבני) ───────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqString(v: Record<string, unknown>, k: string, what: string): string {
  const x = v[k];
  if (typeof x !== 'string' || x.length === 0) throw manifestInvalid(`${what}.${k} אינו מחרוזת לא-ריקה`);
  return x;
}

function reqFinite(v: Record<string, unknown>, k: string, what: string): number {
  const x = v[k];
  if (typeof x !== 'number' || !Number.isFinite(x)) throw manifestInvalid(`${what}.${k} אינו מספר סופי`);
  return x;
}

function reqSafeInt(v: Record<string, unknown>, k: string, what: string, min: number): number {
  const x = v[k];
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < min) {
    throw manifestInvalid(`${what}.${k} אינו שלם בטוח ≥ ${min}`);
  }
  return x;
}

function reqHex64(v: Record<string, unknown>, k: string, what: string): string {
  const x = v[k];
  if (typeof x !== 'string' || !HEX64_RE.test(x)) throw manifestInvalid(`${what}.${k} אינו 64 hex`);
  return x;
}

function reqArray(v: Record<string, unknown>, k: string, what: string): unknown[] {
  const x = v[k];
  if (!Array.isArray(x)) throw manifestInvalid(`${what}.${k} אינו מערך`);
  return x;
}

function manifestInvalid(reason: string): ContentModelError {
  return new ContentModelError('errors.assets.MANIFEST_INVALID', { reason }, reason);
}

function parseSourceRef(v: unknown, what: string): AssetsSourceRef {
  if (!isRecord(v)) throw manifestInvalid(`${what}.source אינו אובייקט`);
  return { repo: reqString(v, 'repo', `${what}.source`), commit: reqString(v, 'commit', `${what}.source`) };
}

function parseLicenseRef(v: unknown, what: string): AssetsLicenseRef {
  if (!isRecord(v)) throw manifestInvalid(`${what}.license אינו אובייקט`);
  const status = reqString(v, 'status', `${what}.license`);
  if (status !== 'source-undocumented') {
    throw manifestInvalid(`${what}.license.status חייב 'source-undocumented' (תיעוד ישר — במקור לא תועד רישיון)`);
  }
  return { status, inventoryCategory: reqString(v, 'inventoryCategory', `${what}.license`) };
}

function parseFileEntry(v: unknown, what: string): AssetsFileEntry {
  if (!isRecord(v)) throw manifestInvalid(`${what}.files[] אינו אובייקט`);
  return {
    file: reqString(v, 'file', `${what}.files[]`),
    sha256: reqHex64(v, 'sha256', `${what}.files[]`),
    bytes: reqSafeInt(v, 'bytes', `${what}.files[]`, 1),
    kind: reqString(v, 'kind', `${what}.files[]`),
    count: reqSafeInt(v, 'count', `${what}.files[]`, 0),
  };
}

function parseViewBoxRecord(v: unknown, what: string): AssetViewBox {
  if (!isRecord(v)) throw manifestInvalid(`${what}.viewBox אינו אובייקט`);
  const width = reqFinite(v, 'width', `${what}.viewBox`);
  const height = reqFinite(v, 'height', `${what}.viewBox`);
  if (!(width > 0) || !(height > 0)) throw manifestInvalid(`${what}.viewBox ממדים אינם חיוביים`);
  return { width, height };
}

function parseAnchor(v: unknown, what: string): BoxAnchor {
  if (!isRecord(v)) throw manifestInvalid(`${what} אינו אובייקט`);
  return { x: reqFinite(v, 'x', what), y: reqFinite(v, 'y', what) };
}

function parseAnchors(v: unknown, what: string): BoxAnchors {
  if (!isRecord(v)) throw manifestInvalid(`${what} אינו אובייקט`);
  return {
    tl: parseAnchor(v.tl, `${what}.tl`),
    tr: parseAnchor(v.tr, `${what}.tr`),
    bl: parseAnchor(v.bl, `${what}.bl`),
    br: parseAnchor(v.br, `${what}.br`),
  };
}

function parsePageFractions(v: unknown, what: string): PageFractions {
  if (!isRecord(v)) throw manifestInvalid(`${what} אינו אובייקט`);
  return {
    left: reqFinite(v, 'left', what),
    top: reqFinite(v, 'top', what),
    right: reqFinite(v, 'right', what),
    bottom: reqFinite(v, 'bottom', what),
  };
}

function parseBuiltinSlot(v: unknown, what: string): BuiltinRoleSlot {
  if (!isRecord(v)) throw manifestInvalid(`${what} אינו אובייקט`);
  const kind = reqString(v, 'kind', what);
  if (kind !== 'style' && kind !== 'dimension') throw manifestInvalid(`${what}.kind חייב style|dimension`);
  return {
    key: reqString(v, 'key', what),
    kind,
    defaultValue: reqString(v, 'defaultValue', what),
    role: reqString(v, 'role', what),
  };
}

/** פרסור מבני של מניפסט שערים — כשל מבני ⇒ errors.assets.MANIFEST_INVALID (fatal). */
export function parseShaarManifest(v: unknown): ShaarManifest {
  if (!isRecord(v)) throw manifestInvalid('מניפסט שערים אינו אובייקט');
  if (v.schemaVersion !== ASSETS_MANIFEST_SCHEMA_VERSION) {
    throw manifestInvalid(`schemaVersion=${String(v.schemaVersion)} (צפוי ${ASSETS_MANIFEST_SCHEMA_VERSION})`);
  }
  if (v.kind !== 'shaar') throw manifestInvalid(`kind=${String(v.kind)} (צפוי shaar)`);
  const files = reqArray(v, 'files', 'shaar').map((e, i) => parseFileEntry(e, `shaar.files[${i}]`));
  const designs = reqArray(v, 'designs', 'shaar').map((e, i) => {
    const what = `shaar.designs[${i}]`;
    if (!isRecord(e)) throw manifestInvalid(`${what} אינו אובייקט`);
    const hasTextBox = e.textBox !== null && e.textBox !== undefined;
    const hasAnchors = e.anchors !== null && e.anchors !== undefined;
    if (hasTextBox !== hasAnchors) throw manifestInvalid(`${what}: textBox ו-anchors חייבים להופיע יחד`);
    return {
      id: reqString(e, 'id', what),
      legacyId: reqString(e, 'legacyId', what),
      file: reqString(e, 'file', what),
      index: reqSafeInt(e, 'index', what, 0),
      kind: reqString(e, 'kind', what),
      name: reqString(e, 'name', what),
      svgSha256: reqHex64(e, 'svgSha256', what),
      viewBox: parseViewBoxRecord(e.viewBox, what),
      textBox: hasTextBox ? parsePageFractions(e.textBox, `${what}.textBox`) : null,
      anchors: hasAnchors ? parseAnchors(e.anchors, `${what}.anchors`) : null,
    };
  });
  return {
    schemaVersion: ASSETS_MANIFEST_SCHEMA_VERSION,
    kind: 'shaar',
    source: parseSourceRef(v.source, 'shaar'),
    license: parseLicenseRef(v.license, 'shaar'),
    files,
    designs,
  };
}

/** פרסור מבני של מניפסט עיטורים — כשל מבני ⇒ errors.assets.MANIFEST_INVALID (fatal). */
export function parseOrnamentsManifest(v: unknown): OrnamentsManifest {
  if (!isRecord(v)) throw manifestInvalid('מניפסט עיטורים אינו אובייקט');
  if (v.schemaVersion !== ASSETS_MANIFEST_SCHEMA_VERSION) {
    throw manifestInvalid(`schemaVersion=${String(v.schemaVersion)} (צפוי ${ASSETS_MANIFEST_SCHEMA_VERSION})`);
  }
  if (v.kind !== 'ornaments') throw manifestInvalid(`kind=${String(v.kind)} (צפוי ornaments)`);
  const files = reqArray(v, 'files', 'ornaments').map((e, i) => parseFileEntry(e, `ornaments.files[${i}]`));
  const designs = reqArray(v, 'designs', 'ornaments').map((e, i) => {
    const what = `ornaments.designs[${i}]`;
    if (!isRecord(e)) throw manifestInvalid(`${what} אינו אובייקט`);
    return {
      id: reqString(e, 'id', what),
      legacyId: reqString(e, 'legacyId', what),
      file: reqString(e, 'file', what),
      index: reqSafeInt(e, 'index', what, 0),
      name: reqString(e, 'name', what),
      svgSha256: reqHex64(e, 'svgSha256', what),
      viewBox: parseViewBoxRecord(e.viewBox, what),
    };
  });
  const builtinSlots = reqArray(v, 'builtinSlots', 'ornaments').map((e, i) => parseBuiltinSlot(e, `ornaments.builtinSlots[${i}]`));
  return {
    schemaVersion: ASSETS_MANIFEST_SCHEMA_VERSION,
    kind: 'ornaments',
    source: parseSourceRef(v.source, 'ornaments'),
    license: parseLicenseRef(v.license, 'ornaments'),
    files,
    designs,
    builtinSlots,
  };
}

// ─────────────────────────── בעיות סמנטיות ───────────────────────────

/** סובלנות צף לבדיקות תחום על שברים (השוואת שוויון מדויק אינה הוגנת לסכומי צף). */
const FRACTION_EPS = 1e-9;

function fractionsInPage(f: PageFractions): boolean {
  return (
    f.left >= -FRACTION_EPS && f.top >= -FRACTION_EPS && f.right >= -FRACTION_EPS && f.bottom >= -FRACTION_EPS
  );
}

function anchorsMatchFractions(f: PageFractions, a: BoxAnchors): boolean {
  const eq = (x: number, y: number) => Math.abs(x - y) <= FRACTION_EPS;
  const expected = textBoxAnchorsOf(f);
  return (
    (eq(a.tl.x, expected.tl.x) && eq(a.tl.y, expected.tl.y) && eq(a.tr.x, expected.tr.x) && eq(a.tr.y, expected.tr.y)
      && eq(a.bl.x, expected.bl.x) && eq(a.bl.y, expected.bl.y) && eq(a.br.x, expected.br.x) && eq(a.br.y, expected.br.y))
  );
}

/**
 * בעיות סמנטיות של מניפסט שערים (הפרסור המבני כבר עבר). רשימה ריקה = תקין.
 * סוגי הבעיות: not-derived (המזהה אינו נגזר מהתוכן), duplicate (מזהה קנוני
 * כפול), out-of-page (שברים שליליים), not-for-file (קובץ/סוג שאינם במניפסט),
 * count:{file} (ספירת העיצובים אינה תואמת), license (אזכור רישוי חסר/שגוי).
 */
export function shaarManifestIssues(m: ShaarManifest): readonly string[] {
  const issues: string[] = [];
  const byFile = new Map<string, AssetsFileEntry>();
  for (const f of m.files) {
    if (SHAAR_FILE_KINDS[f.file] !== f.kind) issues.push(`not-for-file:${f.file} (kind=${f.kind})`);
    if (byFile.has(f.file)) issues.push(`duplicate-file:${f.file}`);
    byFile.set(f.file, f);
  }
  const seen = new Set<string>();
  const perFileCount = new Map<string, number>();
  for (const d of m.designs) {
    const entry = byFile.get(d.file);
    if (entry === undefined) {
      issues.push(`not-for-file:${d.id} (file=${d.file})`);
    } else {
      if (d.kind !== entry.kind) issues.push(`not-for-file:${d.id} (kind=${d.kind} ≠ ${entry.kind})`);
      let expected = d.id;
      try {
        expected = shaarAssetId(entry.kind, entry.sha256, d.index);
      } catch {
        issues.push(`not-derived:${d.file}#${d.index} (סוג/hash לא חוקיים לגזירה)`);
      }
      if (d.id !== expected) issues.push(`not-derived:${d.file}#${d.index} (${d.id} ≠ ${expected})`);
    }
    if (seen.has(d.id)) issues.push(`duplicate:${d.id}`);
    seen.add(d.id);
    perFileCount.set(d.file, (perFileCount.get(d.file) ?? 0) + 1);
    if (d.textBox !== null && d.anchors !== null) {
      if (!fractionsInPage(d.textBox)) issues.push(`out-of-page:${d.id}`);
      if (!anchorsMatchFractions(d.textBox, d.anchors)) issues.push(`anchors-mismatch:${d.id}`);
    }
  }
  for (const f of m.files) {
    if ((perFileCount.get(f.file) ?? 0) !== f.count) {
      issues.push(`count:${f.file} (${perFileCount.get(f.file) ?? 0} ≠ ${f.count})`);
    }
  }
  if (m.license.status !== 'source-undocumented' || m.license.inventoryCategory.length === 0) {
    issues.push('license:manifest');
  }
  return issues;
}

/**
 * בעיות סמנטיות של מניפסט עיטורים. כמו השערים, ובנוסף: not-for-file לקובץ
 * שאינו ב-ORNAMENT_FILE_ROLES, builtinSlots:count — החריצים חייבים להתאים
 * ביט-לביט ל-BUILTIN_ROLE_SLOTS (27 = 17 סגנון + 10 ממד).
 */
export function ornamentsManifestIssues(m: OrnamentsManifest): readonly string[] {
  const issues: string[] = [];
  const byFile = new Map<string, AssetsFileEntry>();
  for (const f of m.files) {
    const role = ORNAMENT_FILE_ROLES[f.file];
    if (role === undefined || role.kind !== f.kind) issues.push(`not-for-file:${f.file} (kind=${f.kind})`);
    if (byFile.has(f.file)) issues.push(`duplicate-file:${f.file}`);
    byFile.set(f.file, f);
  }
  const seen = new Set<string>();
  const perFileCount = new Map<string, number>();
  for (const d of m.designs) {
    const entry = byFile.get(d.file);
    if (entry === undefined) {
      issues.push(`not-for-file:${d.id} (file=${d.file})`);
    } else {
      let expected = d.id;
      try {
        expected = ornamentAssetId(entry.file, entry.sha256, d.index);
      } catch {
        issues.push(`not-derived:${d.file}#${d.index} (שם/hash לא חוקיים לגזירה)`);
      }
      if (d.id !== expected) issues.push(`not-derived:${d.file}#${d.index} (${d.id} ≠ ${expected})`);
    }
    if (seen.has(d.id)) issues.push(`duplicate:${d.id}`);
    seen.add(d.id);
    perFileCount.set(d.file, (perFileCount.get(d.file) ?? 0) + 1);
  }
  for (const f of m.files) {
    if ((perFileCount.get(f.file) ?? 0) !== f.count) {
      issues.push(`count:${f.file} (${perFileCount.get(f.file) ?? 0} ≠ ${f.count})`);
    }
  }
  if (m.builtinSlots.length !== BUILTIN_ROLE_SLOTS.length) {
    issues.push(`builtinSlots:count (${m.builtinSlots.length} ≠ ${BUILTIN_ROLE_SLOTS.length})`);
  } else {
    for (let i = 0; i < BUILTIN_ROLE_SLOTS.length; i += 1) {
      const a = m.builtinSlots[i] as BuiltinRoleSlot;
      const b = BUILTIN_ROLE_SLOTS[i] as BuiltinRoleSlot;
      if (a.key !== b.key || a.kind !== b.kind || a.defaultValue !== b.defaultValue || a.role !== b.role) {
        issues.push(`builtinSlots:count (חריץ ${i}: ${a.key} אינו תואם לנעילה)`);
      }
    }
  }
  if (m.license.status !== 'source-undocumented' || m.license.inventoryCategory.length === 0) {
    issues.push('license:manifest');
  }
  return issues;
}

// ─────────────────────────── זהות נכסים ───────────────────────────

/** זהות נכסים — ערכים סדירים בלבד (ה-CLI מגבב canonicalJson+sha256). */
export interface AssetsIdentity {
  readonly schemaVersion: 2;
  readonly shaar: {
    readonly source: AssetsSourceRef;
    readonly license: AssetsLicenseRef;
    readonly files: readonly { readonly file: string; readonly sha256: string; readonly count: number }[];
    readonly designs: readonly {
      readonly id: string;
      readonly file: string;
      readonly index: number;
      readonly svgSha256: string;
      readonly viewBox: AssetViewBox;
      readonly textBox: PageFractions | null;
    }[];
  };
  readonly ornaments: {
    readonly source: AssetsSourceRef;
    readonly license: AssetsLicenseRef;
    readonly files: readonly { readonly file: string; readonly sha256: string; readonly count: number }[];
    readonly designs: readonly {
      readonly id: string;
      readonly file: string;
      readonly index: number;
      readonly svgSha256: string;
      readonly viewBox: AssetViewBox;
    }[];
    readonly builtinSlots: readonly { readonly key: string; readonly kind: string; readonly defaultValue: string }[];
  };
}

/**
 * זהות הנכסים של שני המניפסטים — דטרמיניסטית (אותם מניפסטים ⇒ אותה זהות
 * ביט-לביט) ורגישה לשינוי: כל שינוי בקובץ, עיצוב, תיבה, viewBox או חריץ
 * משנה אותה. ה-CLI נועל אותה ב-request.json דרך sha256(canonicalJson(·)).
 */
export function assetsIdentity(shaar: ShaarManifest, ornaments: OrnamentsManifest): AssetsIdentity {
  return {
    schemaVersion: ASSETS_MANIFEST_SCHEMA_VERSION,
    shaar: {
      source: { repo: shaar.source.repo, commit: shaar.source.commit },
      license: { status: shaar.license.status, inventoryCategory: shaar.license.inventoryCategory },
      files: shaar.files.map((f) => ({ file: f.file, sha256: f.sha256, count: f.count })),
      designs: shaar.designs.map((d) => ({
        id: d.id,
        file: d.file,
        index: d.index,
        svgSha256: d.svgSha256,
        viewBox: { width: d.viewBox.width, height: d.viewBox.height },
        textBox: d.textBox === null ? null : {
          left: d.textBox.left,
          top: d.textBox.top,
          right: d.textBox.right,
          bottom: d.textBox.bottom,
        },
      })),
    },
    ornaments: {
      source: { repo: ornaments.source.repo, commit: ornaments.source.commit },
      license: { status: ornaments.license.status, inventoryCategory: ornaments.license.inventoryCategory },
      files: ornaments.files.map((f) => ({ file: f.file, sha256: f.sha256, count: f.count })),
      designs: ornaments.designs.map((d) => ({
        id: d.id,
        file: d.file,
        index: d.index,
        svgSha256: d.svgSha256,
        viewBox: { width: d.viewBox.width, height: d.viewBox.height },
      })),
      builtinSlots: ornaments.builtinSlots.map((s) => ({ key: s.key, kind: s.kind, defaultValue: s.defaultValue })),
    },
  };
}

// ─────────────────────────── עזרים למחולל ───────────────────────────

/**
 * קריאת תיבת טקסט מורשת מרשומת עיצוב מקור — הערכים במקור הם מחרוזות מספריות
 * ("43.6"). צורה שגויה ⇒ errors.assets.MANIFEST_INVALID; ההמרה לשברים (כולל
 * בדיקת התחום) — דרך textBoxToPageFractions בלבד.
 */
export function legacyPercentBoxOf(v: unknown): ShaarPercentBox {
  if (!isRecord(v)) throw manifestInvalid('box אינו אובייקט');
  const out: Record<string, number> = {};
  for (const k of ['left', 'top', 'right', 'bottom'] as const) {
    const raw = v[k];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[k] = raw;
      continue;
    }
    if (typeof raw === 'string' && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw.trim()) && Number.isFinite(Number(raw))) {
      out[k] = Number(raw.trim());
      continue;
    }
    throw manifestInvalid(`box.${k} אינו מספר/מחרוזת מספרית: ${String(raw)}`);
  }
  return { left: out.left as number, top: out.top as number, right: out.right as number, bottom: out.bottom as number };
}
