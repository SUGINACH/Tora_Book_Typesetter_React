/**
 * policy.ts — המדיניות התורנית המורכבת: LayoutPolicy + מדיניות העימוד
 * (שלב 58; אפיון §10, §12). היצרן קורא EffectiveSettings ומפיק את כל
 * ה־hooks בבת אחת; מינימלית/מלאה על אותו מנוע — המנוע אינו משתנה.
 *
 * rollback = policyVersion קודם (המרשם מזהה גרסאות; שער M7).
 */
import type { EffectiveSettings, LayoutPolicy } from '@tora/layout-api';
import { LEGACY_HEADING_DEFAULTS, legacyHeadingBehaviorOf, parsePctDimension, parseEmDimension, type HeadingBehavior } from './headings.js';
import { TORAH_RULE_REGISTRY, headingBehaviorIds, torahRegistrySignature } from './registry.js';

/** גרסת המדיניות — עולה כשסמנטיקת כלל משתנה (rollback משווה). */
export const TORAH_POLICY_VERSION = 1 as const;
export const TORAH_POLICY_ID = 'tora-legacy-v1' as const;

/** מדיניות העימוד שמחולל המועמדים צורך (ממשקי שלבים 52–56). */
export interface TorahPaginationPolicy {
  readonly allowIntraParagraphBreaks: boolean;
  readonly headingEscortLines: number;
  readonly atomicNoteBodies: boolean;
  readonly boundaryStride: number;
}

/** מדיניות שריון ההערות (ADR-005). */
export interface TorahNotePolicy {
  readonly separatorHeightLu: number;
  readonly allowLongNoteSplit: boolean;
}

/** התנהגויות הכותרות לפי רמה — מוזרק למחולל במקום מספרים קשיחים. */
export type HeadingBehaviorOf = (level: number) => HeadingBehavior;

/** המדיניות התורנית המלאה — כל מה שהמארח מזריק למנוע. */
export interface TorahPolicy {
  readonly policyId: string;
  readonly version: number;
  /** חלק LayoutPolicy (חוזה typeset; §12) — hooks כלליים. */
  readonly layout: LayoutPolicy;
  /** מדיניות העימוד למחולל המועמדים (שלב 52). */
  readonly pagination: TorahPaginationPolicy;
  /** מדיניות ההערות (ADR-005; שלב 53). */
  readonly notes: TorahNotePolicy;
  /** התנהגות כותרת לפי רמה — הליבה אינה מכירה H2 (§10). */
  readonly headingBehaviorOf: HeadingBehaviorOf;
  /** חתימת הכללים הפעילים — נכנסת ל־policy hash בפלט. */
  readonly rulesSignature: string;
  /** מזהי ההתנהגויות — נעילת policy/config hash (שער M6/M7). */
  readonly headingIds: string;
}

function readBool(settings: EffectiveSettings, key: string, fallback: boolean): boolean {
  const raw = (settings.values as Record<string, unknown>)[key];
  if (typeof raw === 'boolean') return raw;
  return fallback;
}

function readInt(settings: EffectiveSettings, key: string, fallback: number): number {
  const raw = (settings.values as Record<string, unknown>)[key];
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return raw;
  return fallback;
}

/**
 * יצירת המדיניות התורנית מהגדרות אפקטיביות.
 *
 * @param settings ההגדרות האפקטיביות המאומתות (settings-schema; שלב 30)
 * @param overrides התנהגויות כותרת מותאמות (מבחנים/עתיד: מדיניות נוספת) —
 *        מזריקים רמות ספציפיות; השאר לפי ברירות המחדל של legacy.
 */
export function createTorahPolicy(
  settings: EffectiveSettings,
  overrides?: Readonly<Partial<Record<number, Partial<HeadingBehavior>>>>,
): TorahPolicy {
  // התנהגויות כותרות: legacy בסיס + הגדרות odd/mode + overrides מוזרקים (מאומתים).
  // ההגדרות (מרשם ההגדרות — מקור Orange הנעול): odd-h0/odd-h1=true, odd-h2=false
  // (כפיית recto); mode-h1='sub_shaar' (שער משנה) עם חלופה 'new_page_1col'
  // (כשהשער מוסתר — legacy showSubShaar) — הכל דרך המדיניות, לא במנוע.
  const behaviors = new Map<number, HeadingBehavior>();
  for (let level = 0; level <= 7; level++) behaviors.set(level, legacyHeadingBehaviorOf(level));
  {
    // parity לפי odd-h{level} (ברירת המחדל = legacy)
    const parityOf = (level: 0 | 1 | 2): boolean | undefined => {
      const key = `odd-h${level}`;
      const raw = (settings.values as Record<string, unknown>)[key];
      return typeof raw === 'boolean' ? raw : undefined;
    };
    for (const level of [0, 1, 2] as const) {
      const parity = parityOf(level);
      if (parity !== undefined) {
        const base = behaviors.get(level)!;
        behaviors.set(level, Object.freeze({ ...base, startOnRecto: parity, level }));
      }
    }
    // mode-h1: sub_shaar (ברירת מחדל) או new_page_1col (שער מוסתר — פותחת עמוד רגיל)
    const modeH1 = (settings.values as Record<string, unknown>)['mode-h1'];
    if (modeH1 === 'new_page_1col') {
      const base = behaviors.get(1)!;
      behaviors.set(1, Object.freeze({ ...base, forcePageTemplate: 'body', level: 1 }));
    }
    // H2 — ריווח עליון ועיטורים לפי scope (§10.1 H2; שלב 61): הממדים הגולמיים
    // מההגדרות (אחוז מגובה הטור, יחס-em לקו); scope 'none' מאפס את העיטורים
    // (הריווח העליון נשאר — הוא אינו עיטור); המנוע ממדד ל-LU בפועל
    const values = settings.values as Record<string, unknown>;
    const scope = ['both', 'siman_only', 'title_only', 'none'].includes(String(values['h2-orn-scope']))
      ? values['h2-orn-scope'] as 'both' | 'siman_only' | 'title_only' | 'none'
      : 'both';
    const pct = parsePctDimension(values['h2-top-distance'], 0.22);
    const topEm = parseEmDimension(values['dim-h2-top-h'], 1.25);
    const btmEm = parseEmDimension(values['dim-h2-btm-h'], 1.25);
    // H3 — עיטורי צד של המחסום הרוחבי (§10.1 H3; ADR-006; שלב 62): כשאחד
    // מעיטורי הצד פעיל (h3-ornament-l/r ≠ none), גובה הפס כולל את העיטור
    // הנמדד (dim-h3-side-h — יחס-em לקו הכותרת הראשון; המנוע ממדד ל-LU)
    const ornL = String(values['h3-ornament-l'] ?? 'none');
    const ornR = String(values['h3-ornament-r'] ?? 'none');
    const h3OrnEm = ornL !== 'none' || ornR !== 'none' ? parseEmDimension(values['dim-h3-side-h'], 1) : 0;
    const h3Base = behaviors.get(3)!;
    behaviors.set(3, Object.freeze({ ...h3Base, level: 3, barrierOrnamentEm: h3OrnEm }));
    const h2Base = behaviors.get(2)!;
    behaviors.set(2, Object.freeze({
      ...h2Base,
      level: 2,
      openerSpacing: {
        spaceBeforePct: pct,
        ornamentTopEm: scope === 'none' ? 0 : topEm,
        ornamentBottomEm: scope === 'none' ? 0 : btmEm,
      },
      ornaments: { scope, topAssetIds: [], bottomAssetIds: [] },
    }));
  }
  if (overrides !== undefined) {
    for (const [levelRaw, patch] of Object.entries(overrides)) {
      const level = Number(levelRaw);
      const base = behaviors.get(level) ?? legacyHeadingBehaviorOf(level);
      const merged: HeadingBehavior = Object.freeze({ ...base, ...patch, level });
      behaviors.set(level, merged);
    }
  }
  const headingBehaviorOf: HeadingBehaviorOf = (level: number): HeadingBehavior => {
    const b = behaviors.get(level);
    if (b !== undefined) return b;
    return legacyHeadingBehaviorOf(level);
  };

  // מדיניות העימוד: legacy — תוך-פסקאי מותר, escort לפי H2 (ברירת מחדל 2),
  // הערות אטומיות, stride 1
  const pagination: TorahPaginationPolicy = Object.freeze({
    allowIntraParagraphBreaks: true,
    headingEscortLines: LEGACY_HEADING_DEFAULTS[2]!.escortLines,
    atomicNoteBodies: true,
    boundaryStride: 1,
  });

  // מדיניות ההערות (ADR-005 ברירות מחדל; הפרדה מדודה נקבעת בחיבור הייצור)
  const notes: TorahNotePolicy = Object.freeze({
    separatorHeightLu: readInt(settings, 'fn-separator-height', 0),
    allowLongNoteSplit: readBool(settings, 'fn-allow-split', false),
  });

  // חלק LayoutPolicy (§12): ה־hooks הכלליים; H0/H1 forcePageTemplate ממומש
  // דרך ההתנהגויות במחולל; pageTemplate hook לבחירת תבנית לפי סוג+parity
  const layout: LayoutPolicy = {
    policyId: TORAH_POLICY_ID,
    pageTemplate: (ctx) => ({ templateId: `tpl:body:${ctx.parity}` }),
    legalBreaks: () => ({ allow: true }),
    hardConstraints: () => ({ violated: false }),
    score: () => ({ quality: {} }),
  };

  return Object.freeze({
    policyId: TORAH_POLICY_ID,
    version: TORAH_POLICY_VERSION,
    layout,
    pagination,
    notes,
    headingBehaviorOf,
    rulesSignature: torahRegistrySignature(),
    headingIds: headingBehaviorIds(),
  });
}

/**
 * מדיניות מינימלית — אותו מנוע, בלי כללים תורניים (כל ההתנהגויות inline
 * בסיסיות; שער השלב: "policy מינימלית/מלאה על אותו מנוע").
 */
export function createMinimalPolicy(settings: EffectiveSettings): TorahPolicy {
  const overrides: Partial<Record<number, Partial<HeadingBehavior>>> = {};
  for (let level = 0; level <= 7; level++) {
    // גם forcePageTemplate/startOnRecto נמחקים — כותרת inline אינה דורשת
    // תבנית ואינה כופה recto (שלבים 59–60)
    overrides[level] = { flowRole: 'inline', forcePageBreak: false, escortLines: 0, forcePageTemplate: undefined, startOnRecto: undefined, openerSpacing: undefined };
  }
  const full = createTorahPolicy(settings, overrides);
  return Object.freeze({
    ...full,
    policyId: 'tora-minimal-v1' as const,
    pagination: Object.freeze({ ...full.pagination, headingEscortLines: 0 }),
  });
}

/** אימות מדיניות — רשימת בעיות (ריקה = תקינה). */
export function torahPolicyIssues(p: unknown): string[] {
  const issues: string[] = [];
  const v = p as Record<string, unknown> | null;
  if (typeof v !== 'object' || v === null) return ['not-an-object'];
  if (typeof v.policyId !== 'string' || v.policyId.length === 0) issues.push('policyId');
  if (!Number.isSafeInteger(v.version) || (v.version as number) < 1) issues.push('version');
  if (typeof v.layout !== 'object' || v.layout === null || typeof (v.layout as Record<string, unknown>).policyId !== 'string') issues.push('layout');
  if (typeof v.headingBehaviorOf !== 'function') { issues.push('headingBehaviorOf'); return issues; }
  // כל רמה 0–7 מחזירה התנהגות תקינה עם הרמה הנכונה
  const fn = v.headingBehaviorOf as (level: number) => HeadingBehavior;
  for (let level = 0; level <= 7; level++) {
    const b = fn(level);
    if (b.level !== level) issues.push(`headingBehaviorOf(${level}).level`);
    if (b.flowRole === 'page-opener' && !b.forcePageBreak) issues.push(`headingBehaviorOf(${level}).opener-force`);
    if (b.flowRole === 'full-width-barrier' && b.forcePageBreak) issues.push(`headingBehaviorOf(${level}).barrier-force`);
  }
  if (typeof v.rulesSignature !== 'string' || v.rulesSignature.length === 0) issues.push('rulesSignature');
  return issues;
}

/** מספר הכללים הרשומים — לבדיקות כיסוי המרשם. */
export function torahRuleCount(): number {
  return TORAH_RULE_REGISTRY.length;
}
