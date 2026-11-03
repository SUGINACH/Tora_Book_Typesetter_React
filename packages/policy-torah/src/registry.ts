/**
 * registry.ts — מרשם הכללים התורניים: legacy ← policy id + גרסה (שלב 58).
 *
 * כל כלל legacy ממופה ל־policy id יציב עם גרסה; rollback = גרסה קודמת
 * (שער M7). המרשם הוא מקור הסמכות ל"איזה הגדרות נכנסות לאיזה hook" —
 * ההרחבה של כלל תורני חדש = רשומה חדשה כאן, לא עריכת המנוע.
 */
import { headingBehaviorId, legacyHeadingBehaviorOf, type HeadingBehavior } from './headings.js';

/** רשומת כלל במרשם — כלל legacy אחד ← hook + מקור הגדרות. */
export interface TorahRuleEntry {
  /** מזהה הכלל הקנוני — יציב בין גרסאות (rollback משווה לפיו). */
  readonly ruleId: string;
  /** גרסת הכלל — עולה כשהסמנטיקה משתנה; rollback = גרסה קודמת. */
  readonly version: number;
  /** ה־hook שהכלל מממש (ממשקי המנוע; §10). */
  readonly hook: 'heading-behavior' | 'legal-breaks' | 'note-reservation' | 'first-word' | 'dibbur' | 'drop-word' | 'bracket-display' | 'chapter-balance' | 'running-header' | 'folio' | 'gematria';
  /** מקורות הגדרות ה־legacy (מפתחות EffectiveSettings). */
  readonly settingsKeys: readonly string[];
  /** תיאור אנושי — לפנקס ול־WORKLOG. */
  readonly description: string;
}

/**
 * המרשם — כל כללי התורה שהועברו עד כה (M7 ירחיב; M8 ישלים נכסים).
 * סדר קבוע לדטרמיניזם; מזהה ייחודי.
 */
export const TORAH_RULE_REGISTRY: readonly TorahRuleEntry[] = Object.freeze([
  // ── כותרות (§10.1; שלבים 58–63) ──
  { ruleId: 'heading.h0.opener', version: 2, hook: 'heading-behavior', settingsKeys: ['odd-h0'], description: 'H0 פותח עמוד/פרק — forcePageTemplate (body), פתיחת עמוד, recto (parity)' },
  { ruleId: 'heading.h1.shaar', version: 2, hook: 'heading-behavior', settingsKeys: ['mode-h1', 'odd-h1'], description: 'H1 שער משנה/חלק — sub-shaar, פתיחת עמוד, recto (parity), פיצול כותרת' },
  { ruleId: 'heading.h2.chapter', version: 3, hook: 'heading-behavior', settingsKeys: ['h2-orn-scope', 'h2-top-distance', 'h2-auto-siman', 'h2-reset-siman', 'dim-h2-top-h', 'dim-h2-btm-h'], description: 'H2 פותח פרק — ריווח עליון ועיטורים לפי scope (measured boxes; שלב 61)' },
  { ruleId: 'heading.h3.barrier', version: 2, hook: 'heading-behavior', settingsKeys: ['dim-h3-side-h', 'h3-ornament-l', 'h3-ornament-r'], description: 'H3 כותרת רוחבית — barrier חוצת-טורים (ADR-006), לא פותחת עמוד; עיטור צד נמדד בגובה הפס' },
  { ruleId: 'heading.h456.inline', version: 2, hook: 'heading-behavior', settingsKeys: ['f-h4', 's-h4', 'f-h5', 's-h5', 'f-h6', 's-h6'], description: 'H4–H6 כותרות inline — ליווי לפי רמה (escort) + סגנון מדידה (גופן/גודל); letter-spacing — תחום מועמדי-הקו' },
  { ruleId: 'heading.h7.sidenote', version: 1, hook: 'heading-behavior', settingsKeys: [], description: 'H7 הערת צד — זרם sidenote מעוגן לשורה' },
  { ruleId: 'heading.escort.min2', version: 1, hook: 'heading-behavior', settingsKeys: [], description: 'ליווי ברירת מחדל: לפחות שתי שורות גוף אחרי כותרת' },
  // ── שבירות חוקיות (§9.1; מנוע מזריק משלב 52; מרשם משלב 58) ──
  { ruleId: 'breaks.intra-paragraph', version: 1, hook: 'legal-breaks', settingsKeys: [], description: 'שבירת טור בתוך פסקה — מותרת כברירת מחדל' },
  { ruleId: 'breaks.note-atomic', version: 1, hook: 'legal-breaks', settingsKeys: [], description: 'גוף הערה אטומי — עובר עם העוגן או נפסל' },
  // ── הערות (§10.3; ADR-005) ──
  { ruleId: 'notes.reservation', version: 1, hook: 'note-reservation', settingsKeys: ['fn-layout-mode', 'fn-columns', 'fn-reset-mode'], description: 'שריון הערות שוליים בתוך החיפוש (ADR-005)' },
  // ── כללים עדינים (§10.2; שלב 64) ──
  { ruleId: 'first-word.window', version: 2, hook: 'first-word', settingsKeys: ['drop-word-mode', 'drop-word-count', 'drop-word-min-lines', 'font-first-word', 'size-first-word'], description: 'first-word-window — sunken/inline/bold/none כמדיניות מדידה (שלב 64); אין החלה על continuation' },
  { ruleId: 'dibbur.hamatchil', version: 2, hook: 'dibbur', settingsKeys: ['auto-dh'], description: 'דיבור המתחיל — זיהוי span סמנטי (המפרידים ומגבלת האורך במדיניות, לא ברנדרר; שלב 64)' },
  { ruleId: 'drop.word', version: 1, hook: 'drop-word', settingsKeys: ['drop-word-mode', 'drop-word-count', 'drop-word-min-lines'], description: 'drop-word בסוף פרק — חלופת שבירה, לא מחיקת רווחים' },
  // ── סוגריים (§10.4; שלב 65) ──
  { ruleId: 'brackets.cross-page', version: 1, hook: 'bracket-display', settingsKeys: [], description: 'סוגריים חוצי עמוד — המחסנית במצב; אין protectParens' },
  // ── איזון (§10.5; שלב 66) ──
  { ruleId: 'balance.chapter-end', version: 2, hook: 'chapter-balance', settingsKeys: ['drop-word-mode', 'section-divider-style'], description: 'איזון סוף פרק בשלוש רמות (§10.5; שלב 66) — המדד גובה regions בפועל; רמה 1 דרך עלות אי-איזון ברכיב 8' },
  // ── מסגרת (§11; שלב 67) ──
  { ruleId: 'headers.running', version: 1, hook: 'running-header', settingsKeys: ['hdr-distinct-even-odd', 'hdr-l-type', 'hdr-c-type', 'hdr-r-type', 'hdr-h1-title-mode', 'hdr-title-split'], description: 'כותרות רצות recto/verso לפי scopes' },
  { ruleId: 'folio.numbering', version: 1, hook: 'folio', settingsKeys: ['page-num-format', 'page-num-initial-value', 'page-num-position'], description: 'פוליו — גימטריה/מספרים, מספר התחלתי' },
  { ruleId: 'gematria.formatter', version: 1, hook: 'gematria', settingsKeys: ['page-num-format'], description: 'גימטריה כ־domain formatter דטרמיניסטי' },
]);

export function torahRuleIssues(): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < TORAH_RULE_REGISTRY.length; i++) {
    const r = TORAH_RULE_REGISTRY[i]!;
    if (typeof r.ruleId !== 'string' || r.ruleId.length === 0) { issues.push(`[${i}].ruleId`); continue; }
    if (seen.has(r.ruleId)) issues.push(`[${i}].ruleId:duplicate`);
    seen.add(r.ruleId);
    if (!Number.isSafeInteger(r.version) || (r.version as number) < 1) issues.push(`[${i}].version`);
    if (typeof r.description !== 'string' || r.description.length === 0) issues.push(`[${i}].description`);
  }
  return issues;
}

/** חתימת המרשם — נעילת "אותם כללים" בין ריצות (rollback משווה גרסאות). */
export function torahRegistrySignature(): string {
  return TORAH_RULE_REGISTRY.map((r) => `${r.ruleId}@${r.version}`).join(';');
}

/** ההתנהגויות לכל הרמות — המרשם בצורת lookup למנוע. */
export function legacyHeadingBehaviors(): ReadonlyMap<number, HeadingBehavior> {
  const m = new Map<number, HeadingBehavior>();
  for (let level = 0; level <= 7; level++) m.set(level, legacyHeadingBehaviorOf(level));
  return m;
}

/** מזהי ההתנהגויות — לנעילת policy/config hash בפלט (שער M6/M7). */
export function headingBehaviorIds(): string {
  return [...legacyHeadingBehaviors().entries()]
    .sort((a, b) => a[0]! - b[0]!)
    .map(([level, b]) => `${level}:${headingBehaviorId(b)}`)
    .join(';');
}
