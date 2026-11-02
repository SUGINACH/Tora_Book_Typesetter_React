/**
 * policy-torah.test.ts — בדיקות שלב 58: חבילת policy-torah וממשק ה־hooks
 * (אפיון §10, §4.1; פרק ח/M7).
 *
 * מה מוכח כאן:
 *   1. **מדיניות מלאה נטענת בהזרקה**: createTorahPolicy מפיק את כל
 *      התנהגויות legacy H0–H7 דרך ה־hook headingBehaviorOf.
 *   2. **מדיניות מינימלית לא מפיקה כללים**: הכל inline, בלי פתיחת עמוד,
 *      בלי ליווי — על אותו מנוע (§18-M7).
 *   3. **שקילות ברירות המחדל**: העתק המנוע (heading-defaults.ts) זהה
 *      לברירות policy-torah לכל רמה — כל סטייה נתפסת.
 *   4. **הזרקה במנוע מנצחת רמות**: H5 שהוזרקה כ־barrier מתנהגת כמו H3
 *      legacy; H2 מינימלית אינה סוגרת אזור — הליבה אינה מכירה את המספרים.
 *   5. **המרשם**: מזהים ייחודיים, גרסאות ≥1, חתימות דטרמיניסטיות (rollback
 *      = policy version קודם; שער M7).
 *   6. **אימות מבני**: headingBehaviorIssues / torahPolicyIssues תופסים זיוף.
 *   7. **אין כלל תורני בתוך layout-engine** (שער השלב): סריקת קוד — אין
 *      השוואת headingLevel קשיחה למספר במנוע; הכל דרך ההתנהגות המוזרקת.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_HEADING_DEFAULTS,
  headingBehaviorId,
  headingBehaviorIssues,
  legacyHeadingBehaviorOf,
  TORAH_RULE_REGISTRY,
  torahRegistrySignature,
  headingBehaviorIds,
  torahRuleIssues,
  TORAH_POLICY_ID,
  TORAH_POLICY_VERSION,
  createTorahPolicy,
  createMinimalPolicy,
  torahPolicyIssues,
  torahRuleCount,
  type HeadingBehavior,
} from '../src/index.js';
import { asLu, DecisionLedgerBuilder, type EffectiveSettings } from '@tora/layout-api';
// בדיקות מתזמרות חבילות (פטורות מכללי הגרף; .dependency-cruiser.cjs):
import {
  legacyHeadingBehaviorOf as engineHeadingBehaviorOf,
} from '../../layout-engine/src/pagination/heading-defaults.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../../layout-engine/src/pagination/candidates.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../../layout-engine/src/pagination/templates.js';
import { initialPaginationState } from '../../layout-engine/src/pagination/state.js';
import { searchPages } from '../../layout-engine/src/pagination/search.js';

const here = dirname(fileURLToPath(import.meta.url));

function settings(values: Record<string, unknown> = {}): EffectiveSettings {
  return { schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'test-hash' };
}

// ─────────────────── תשתית מנוע לבדיקות הזרקה (תבניות שלב 50) ───────────────────

let lineSeq = 0;
const LINE = (heightLu: number): PaginatedLine => Object.freeze({
  id: `line-${lineSeq++}`,
  heightLu: asLu(heightLu),
  footnoteRefs: [],
  sidenoteRefs: [],
});

function block(blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock {
  return Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
}

const templates = buildPageTemplateSet({
  geometry: {
    pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
    mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
    columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
  },
  headerHeightLu: asLu(0),
  footerHeightLu: asLu(0),
  columns: 2,
  footnoteColumns: 1,
  folioPosition: 'bottom_center',
  showFolio: false,
  sidenoteWidthLu: null,
} satisfies TemplateSetInput);
const columnHeight = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;

function inputFor(blocks: readonly PaginatedBlock[], headingBehaviorOf?: (level: number) => unknown): CandidateGeneratorInput {
  return {
    blocks, templates, pageKind: 'body',
    ...(headingBehaviorOf !== undefined ? { headingBehaviorOf: headingBehaviorOf as CandidateGeneratorInput['headingBehaviorOf'] } : {}),
  };
}

function initialState(firstBlockId: string) {
  return initialPaginationState({
    firstBlockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
  });
}

// ─────────────────────────── 1. ברירות legacy ───────────────────────────

describe('שלב 58 — ברירות מחדל של legacy (H0–H7)', () => {
  test('לכל רמה 0–7 יש ברירת מחדל קפואה ותקינה', () => {
    for (let level = 0; level <= 7; level++) {
      expect(LEGACY_HEADING_DEFAULTS[level], `רמה ${level}`).toBeDefined();
      const b = legacyHeadingBehaviorOf(level);
      expect(b.level).toBe(level);
      expect(Object.isFrozen(b), `רמה ${level} קפואה`).toBe(true);
      expect(headingBehaviorIssues(b), `רמה ${level} ללא בעיות`).toEqual([]);
    }
    expect(Object.isFrozen(LEGACY_HEADING_DEFAULTS)).toBe(true);
  });

  test('מיפוי התפקידים: H0–H2 פותחי-עמוד; H3 מחסום; H4–H6 inline; H7 זרם צד', () => {
    expect(legacyHeadingBehaviorOf(0).flowRole).toBe('page-opener');
    expect(legacyHeadingBehaviorOf(1).flowRole).toBe('page-opener');
    expect(legacyHeadingBehaviorOf(2).flowRole).toBe('page-opener');
    expect(legacyHeadingBehaviorOf(3).flowRole).toBe('full-width-barrier');
    for (const level of [4, 5, 6]) expect(legacyHeadingBehaviorOf(level).flowRole).toBe('inline');
    expect(legacyHeadingBehaviorOf(7).flowRole).toBe('sidenote-stream');
  });

  test('פותח-עמוד כופה עמוד; מחסום אינו כופה (§10.1: H3 לא "מעצמה")', () => {
    for (const level of [0, 1, 2]) {
      expect(legacyHeadingBehaviorOf(level).forcePageBreak, `H${level}`).toBe(true);
    }
    expect(legacyHeadingBehaviorOf(3).forcePageBreak).toBe(false);
    for (const level of [4, 5, 6, 7]) expect(legacyHeadingBehaviorOf(level).forcePageBreak).toBe(false);
  });

  test('ליווי ברירת מחדל 2 ל־H0–H6; 0 ל־H7 (§10.1: "לפחות שתי שורות גוף")', () => {
    for (let level = 0; level <= 6; level++) {
      expect(legacyHeadingBehaviorOf(level).escortLines, `H${level}`).toBe(2);
    }
    expect(legacyHeadingBehaviorOf(7).escortLines).toBe(0);
  });

  test('רמה לא מוכרת ⇒ inline בטוח עם ליווי 2 — לא שקט: מזוהה ב־id, ומסומנת באימות', () => {
    const b = legacyHeadingBehaviorOf(9);
    expect(b.flowRole).toBe('inline');
    expect(b.forcePageBreak).toBe(false);
    expect(b.escortLines).toBe(2);
    // ההתנהגות בטוחה למנוע, אבל אימות הקלט מסמן רמה מחוץ ל־0–7 (נתוני קלט חריגים)
    expect(headingBehaviorIssues(b)).toEqual(['level']);
    expect(headingBehaviorId(b)).toBe('heading:v1|L9|inline|esc2|f0');
  });

  test('מזהה ההתנהגות הקנוני יציב', () => {
    const h2 = legacyHeadingBehaviorOf(2);
    expect(headingBehaviorId(h2)).toBe('heading:v1|L2|page-opener|esc2|f1');
    expect(headingBehaviorId(h2)).toBe(headingBehaviorId(legacyHeadingBehaviorOf(2)));
  });
});

// ─────────────────────────── 2. אימות מבני ───────────────────────────

describe('שלב 58 — אימות מבני תופס זיוף', () => {
  test('headingBehaviorIssues תופס כל שבירה', () => {
    expect(headingBehaviorIssues(null)).toEqual(['not-an-object']);
    expect(headingBehaviorIssues('x')).toEqual(['not-an-object']);
    expect(headingBehaviorIssues({ level: 9, flowRole: 'inline', forcePageBreak: false, escortLines: 2, spaceBeforeLu: 0, spaceAfterLu: 0 })).toContain('level');
    expect(headingBehaviorIssues({ level: 2, flowRole: 'banana', forcePageBreak: false, escortLines: 2, spaceBeforeLu: 0, spaceAfterLu: 0 })).toContain('flowRole');
    // פותח-עמוד שלא כופה — אסור
    expect(headingBehaviorIssues({ level: 0, flowRole: 'page-opener', forcePageBreak: false, escortLines: 2, spaceBeforeLu: 0, spaceAfterLu: 0 })).toContain('forcePageBreak:opener-must-force');
    // מחסום שכופה עמוד — אסור (§10.1)
    expect(headingBehaviorIssues({ level: 3, flowRole: 'full-width-barrier', forcePageBreak: true, escortLines: 2, spaceBeforeLu: 0, spaceAfterLu: 0 })).toContain('forcePageBreak:barrier-must-not-force');
    expect(headingBehaviorIssues({ level: 4, flowRole: 'inline', forcePageBreak: false, escortLines: -1, spaceBeforeLu: 0, spaceAfterLu: 0 })).toContain('escortLines');
    expect(headingBehaviorIssues({ level: 4, flowRole: 'inline', forcePageBreak: false, escortLines: 2, spaceBeforeLu: -5, spaceAfterLu: 0 })).toContain('spaceBeforeLu');
    expect(headingBehaviorIssues({ level: 2, flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, spaceBeforeLu: 0, spaceAfterLu: 0, ornaments: { scope: 'banana', topAssetIds: [], bottomAssetIds: [] } })).toContain('ornaments');
  });

  test('torahPolicyIssues תופס מדיניות פגומה', () => {
    expect(torahPolicyIssues(null)).toEqual(['not-an-object']);
    expect(torahPolicyIssues({})).toContain('policyId');
    expect(torahPolicyIssues({ policyId: 'x' })).toContain('version');
    expect(torahPolicyIssues({ policyId: 'x', version: 1 })).toContain('layout');
    expect(torahPolicyIssues({ policyId: 'x', version: 1, layout: { policyId: 'y' } })).toContain('headingBehaviorOf');
    // headingBehaviorOf שמחזירה פותח-עמוד בלי כוח — נתפס לכל רמה
    const broken = {
      policyId: 'x', version: 1, layout: { policyId: 'y' },
      headingBehaviorOf: (level: number) => ({ level, flowRole: level === 0 ? 'page-opener' : 'inline', forcePageBreak: false, escortLines: 0, spaceBeforeLu: 0, spaceAfterLu: 0 }),
      rulesSignature: 'sig', headingIds: 'ids',
    };
    expect(torahPolicyIssues(broken)).toContain('headingBehaviorOf(0).opener-force');
  });
});

// ─────────────────────────── 3. המרשם ───────────────────────────

describe('שלב 58 — מרשם הכללים', () => {
  test('מזהים ייחודיים, גרסאות ≥1, אין בעיות', () => {
    expect(torahRuleIssues()).toEqual([]);
    const ids = TORAH_RULE_REGISTRY.map((r) => r.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of TORAH_RULE_REGISTRY) expect(r.version).toBeGreaterThanOrEqual(1);
    expect(torahRuleCount()).toBe(TORAH_RULE_REGISTRY.length);
  });

  test('המרשם מכסה את כל ווי המנוע שהוגדרו ל־M7', () => {
    const hooks = new Set(TORAH_RULE_REGISTRY.map((r) => r.hook));
    for (const hook of ['heading-behavior', 'legal-breaks', 'note-reservation', 'first-word', 'dibbur', 'drop-word', 'bracket-display', 'chapter-balance', 'running-header', 'folio', 'gematria']) {
      expect(hooks.has(hook as (typeof TORAH_RULE_REGISTRY)[number]['hook']), `hook ${hook}`).toBe(true);
    }
  });

  test('חתימת המרשם דטרמיניסטית וכוללת גרסאות (rollback משווה)', () => {
    const s1 = torahRegistrySignature();
    expect(s1).toBe(torahRegistrySignature());
    expect(s1).toContain('heading.h0.opener@1');
    expect(s1).toContain(';');
    expect(headingBehaviorIds()).toBe(headingBehaviorIds());
    expect(headingBehaviorIds()).toContain('2:heading:v1|L2|page-opener|esc2|f1');
  });
});

// ─────────────────────────── 4. המדיניות המלאה ───────────────────────────

describe('שלב 58 — createTorahPolicy: מדיניות מלאה בהזרקה', () => {
  test('זהות, גרסה, חתימות וקפאות', () => {
    const p = createTorahPolicy(settings());
    expect(p.policyId).toBe('tora-legacy-v1');
    expect(p.version).toBe(TORAH_POLICY_VERSION);
    expect(TORAH_POLICY_ID).toBe('tora-legacy-v1');
    expect(p.rulesSignature).toBe(torahRegistrySignature());
    expect(p.headingIds).toBe(headingBehaviorIds());
    expect(Object.isFrozen(p)).toBe(true);
    expect(torahPolicyIssues(p)).toEqual([]);
  });

  test('headingBehaviorOf מחזיר את ברירות ה־legacy לכל רמה', () => {
    const p = createTorahPolicy(settings());
    for (let level = 0; level <= 7; level++) {
      const b = p.headingBehaviorOf(level);
      const legacy = legacyHeadingBehaviorOf(level);
      expect(b.flowRole, `H${level} flowRole`).toBe(legacy.flowRole);
      expect(b.forcePageBreak, `H${level} forcePageBreak`).toBe(legacy.forcePageBreak);
      expect(b.escortLines, `H${level} escortLines`).toBe(legacy.escortLines);
      expect(b.level).toBe(level);
    }
  });

  test('מדיניות העימוד: תוך-פסקאי מותר, ליווי 2, הערות אטומיות, stride 1', () => {
    const p = createTorahPolicy(settings());
    expect(p.pagination.allowIntraParagraphBreaks).toBe(true);
    expect(p.pagination.headingEscortLines).toBe(2);
    expect(p.pagination.atomicNoteBodies).toBe(true);
    expect(p.pagination.boundaryStride).toBe(1);
  });

  test('מדיניות הערות נקראת מההגדרות האפקטיביות (ADR-005 ברירות מחדל נעולות)', () => {
    expect(createTorahPolicy(settings()).notes).toEqual({ separatorHeightLu: 0, allowLongNoteSplit: false });
    expect(createTorahPolicy(settings({ 'fn-separator-height': 50000, 'fn-allow-split': true })).notes)
      .toEqual({ separatorHeightLu: 50000, allowLongNoteSplit: true });
    // ערכים פסולים ⇒ ברירת המחדל הנעולה, לא קריסה
    expect(createTorahPolicy(settings({ 'fn-separator-height': -3, 'fn-allow-split': 'yes' })).notes)
      .toEqual({ separatorHeightLu: 0, allowLongNoteSplit: false });
  });

  test('חלק LayoutPolicy: hooks כלליים עם policyId תואם; pageTemplate לפי parity', () => {
    const p = createTorahPolicy(settings());
    expect(p.layout.policyId).toBe('tora-legacy-v1');
    expect(p.layout.pageTemplate?.({ parity: 'recto' } as never)).toEqual({ templateId: 'tpl:body:recto' });
    expect(p.layout.pageTemplate?.({ parity: 'verso' } as never)).toEqual({ templateId: 'tpl:body:verso' });
    expect(p.layout.legalBreaks?.({} as never)).toEqual({ allow: true });
    expect(p.layout.hardConstraints?.({} as never)).toEqual({ violated: false });
    expect(p.layout.score?.({} as never)).toEqual({ quality: {} });
  });

  test('דטרמיניזם: שתי יצירות מפיקות חתימות זהות (בסיס rollback)', () => {
    const a = createTorahPolicy(settings());
    const b = createTorahPolicy(settings({ 'fn-separator-height': 50000 }));
    expect(a.rulesSignature).toBe(b.rulesSignature);
    expect(a.headingIds).toBe(b.headingIds);
  });

  test('overrides מוזרקים: רמה ספציפית מוחלפת; השאר legacy; המיזוג קפוא ומאומת', () => {
    const overrides: Partial<Record<number, Partial<HeadingBehavior>>> = {
      5: { flowRole: 'full-width-barrier', forcePageBreak: false },
    };
    const p = createTorahPolicy(settings(), overrides);
    expect(p.headingBehaviorOf(5).flowRole).toBe('full-width-barrier');
    expect(p.headingBehaviorOf(5).escortLines).toBe(2); // נשמר מהבסיס
    expect(p.headingBehaviorOf(4).flowRole).toBe('inline'); // לא נפגע
    expect(p.headingBehaviorOf(2).flowRole).toBe('page-opener');
    expect(headingBehaviorIssues(p.headingBehaviorOf(5))).toEqual([]);
    expect(torahPolicyIssues(p)).toEqual([]);
    // רמה שאינה בטבלה — עדיין ניתנת להזרקה (inline בטוח כבסיס)
    const p9 = createTorahPolicy(settings(), { 9: { escortLines: 0 } });
    expect(p9.headingBehaviorOf(9).escortLines).toBe(0);
    expect(p9.headingBehaviorOf(9).flowRole).toBe('inline');
  });
});

// ─────────────────────────── 5. המדיניות המינימלית ───────────────────────────

describe('שלב 58 — createMinimalPolicy: מדיניות ריקה לא מפיקה כללים', () => {
  test('כל הרמות inline, בלי כוח, בלי ליווי — על אותו מנוע', () => {
    const p = createMinimalPolicy(settings());
    expect(p.policyId).toBe('tora-minimal-v1');
    for (let level = 0; level <= 7; level++) {
      expect(p.headingBehaviorOf(level).flowRole, `H${level}`).toBe('inline');
      expect(p.headingBehaviorOf(level).forcePageBreak, `H${level}`).toBe(false);
      expect(p.headingBehaviorOf(level).escortLines, `H${level}`).toBe(0);
    }
    expect(p.pagination.headingEscortLines).toBe(0);
    expect(torahPolicyIssues(p)).toEqual([]);
    expect(Object.isFrozen(p)).toBe(true);
  });
});

// ─────────────────────── 6. שקילות ברירות המנוע ───────────────────────

describe('שלב 58 — שקילות: ברירות המנוע = ברירות policy-torah', () => {
  test('העתק heading-defaults במנוע זהה לברירות legacy לכל רמה (סטייה נתפסת)', () => {
    for (let level = 0; level <= 7; level++) {
      const engineB = engineHeadingBehaviorOf(level);
      const policyB = legacyHeadingBehaviorOf(level);
      expect(engineB.flowRole, `H${level} flowRole`).toBe(policyB.flowRole);
      expect(engineB.forcePageBreak, `H${level} forcePageBreak`).toBe(policyB.forcePageBreak);
      expect(engineB.escortLines, `H${level} escortLines`).toBe(policyB.escortLines);
    }
    // רמה לא מוכרת — אותה התנהגות בטוחה בשני הצדדים
    const e9 = engineHeadingBehaviorOf(42);
    const p9 = legacyHeadingBehaviorOf(42);
    expect(e9.flowRole).toBe(p9.flowRole);
    expect(e9.escortLines).toBe(p9.escortLines);
    expect(e9.forcePageBreak).toBe(p9.forcePageBreak);
  });
});

// ─────────────────────── 7. הזרקה במנוע בפועל ───────────────────────

describe('שלב 58 — הזרקה במחולל המועמדים (ההתנהגות מנצחת את הרמה)', () => {
  const lineH = Math.floor(columnHeight / 10);

  test('H5 שהוזרקה כ־full-width-barrier מתנהגת כמו H3 legacy: מועמד barrier מסונכרן', () => {
    const blocks = [
      block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH)]),
      block('heading|5|X', [LINE(lineH)], { role: 'heading', headingLevel: 5 }),
      block('body|2', [LINE(lineH), LINE(lineH)]),
    ];
    const policy = createTorahPolicy(settings(), { 5: { flowRole: 'full-width-barrier', forcePageBreak: false } });
    const src = createPageCandidateSource(inputFor(blocks, policy.headingBehaviorOf));
    const exps = src.expansions(initialState('body|1'));
    const barrier = exps.find((e) => e.candidateId.includes(':H3'));
    expect(barrier, 'מועמד barrier נוצר ל־H5 שהוזרקה').toBeDefined();
    // שני הטורים נשרפו עד תחתית הכותרת — מסונכרנים (התנהגות שלב 56, לא מספר)
    expect(barrier!.toState.remainingByRegion['page:1:col:0']).toBe(columnHeight - 4 * lineH);
    expect(barrier!.toState.remainingByRegion['page:1:col:1']).toBe(columnHeight - 4 * lineH);
    expect(barrier!.toState.physicalPageIndex).toBe(1); // לא פותחת עמוד מעצמה
  });

  test('ברירת המחדל בלי הזרקה: H5 אינה barrier (legacy — inline)', () => {
    const blocks = [
      block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH)]),
      block('heading|5|X', [LINE(lineH)], { role: 'heading', headingLevel: 5 }),
      block('body|2', [LINE(lineH), LINE(lineH)]),
    ];
    const src = createPageCandidateSource(inputFor(blocks)); // בלי headingBehaviorOf
    const exps = src.expansions(initialState('body|1'));
    expect(exps.find((e) => e.candidateId.includes(':H3'))).toBeUndefined();
  });

  test('H2 legacy סוגרת אזור; H2 מינימלית אינה סוגרת — אותו מנוע', () => {
    const blocks = [
      block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH)]),
      block('heading|2|C', [LINE(lineH)], { role: 'heading', headingLevel: 2 }),
      block('body|2', Array.from({ length: 10 }, () => LINE(lineH))),
    ];
    // legacy: הגבול שלפני ה־H2 סוגר אזור (פותח עמוד)
    const legacySrc = createPageCandidateSource(inputFor(blocks, legacyHeadingBehaviorOf));
    const legacyExps = legacySrc.expansions(initialState('body|1'));
    const beforeH2 = legacyExps.find((e) => e.candidateId.includes('→heading|2|C@'));
    expect(beforeH2, 'גבול לפני H2 קיים').toBeDefined();
    expect(beforeH2!.closesRegion).toBe(true);
    // מינימלית: אותו גבול אינו סוגר — H2 זורמת inline
    const minimal = createMinimalPolicy(settings());
    const minSrc = createPageCandidateSource(inputFor(blocks, minimal.headingBehaviorOf));
    const minExps = minSrc.expansions(initialState('body|1'));
    const minBeforeH2 = minExps.find((e) => e.candidateId.includes('→heading|2|C@'));
    expect(minBeforeH2, 'הגבול עצמו קיים גם במינימלית (שבירה חוקית)').toBeDefined();
    expect(minBeforeH2!.closesRegion ?? false).toBe(false);
  });

  test('מסלול שלם עם המדיניות המוזרקת: complete, כיסוי מלא, שרשרת עוברת ודטרמיניזם', () => {
    const blocks = [
      block('heading|2|C', [LINE(lineH)], { role: 'heading', headingLevel: 2 }),
      block('body|1', Array.from({ length: 12 }, () => LINE(lineH))),
      block('heading|3|S', [LINE(lineH)], { role: 'heading', headingLevel: 3 }),
      block('body|2', Array.from({ length: 8 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(settings());
    const src = createPageCandidateSource(inputFor(blocks, policy.headingBehaviorOf));
    const run = () => searchPages(initialState('heading|2|C'), src, new DecisionLedgerBuilder('decisions'));
    const r1 = run();
    expect(r1.status).toBe('complete');
    const r2 = run();
    expect(r2.status).toBe('complete');
    // דטרמיניזם — אותם מזהי מועמדים באותו סדר
    expect(r1.path.map((e) => e.candidateId)).toEqual(r2.path.map((e) => e.candidateId));
    // המסלול כולל את מועמד ה-barrier של H3 (legacy דרך ההתנהגות המוזרקת)
    expect(r1.path.some((e) => e.candidateId.includes(':H3'))).toBe(true);
    // ואת סגירת האזור של H2 הפותחת
    expect(r1.path.some((e) => e.closesRegion)).toBe(true);
  });
});

// ─────────────────────── 8. שער השלב: אין כלל תורני במנוע ───────────────────────

describe('שלב 58 — שער: אין כלל תורני בתוך layout-engine', () => {
  test('סריקת קוד: אין השוואת headingLevel קשיחה למספר במקור המנוע', () => {
    const engineFiles = [
      'pagination/candidates.ts',
      'pagination/state.ts',
      'pagination/templates.ts',
      'pagination/search.ts',
      'pagination/notes.ts',
      'pagination/endnotes.ts',
      'pagination/heading-defaults.ts',
    ];
    for (const f of engineFiles) {
      const src = readFileSync(join(here, '..', '..', 'layout-engine', 'src', f), 'utf8');
      // השוואה קשיחה למספר רמה (headingLevel === 3 וכדומה) — אסורה; הכל דרך hook
      expect(src.match(/headingLevel\s*===?\s*\d/), `${f} בלי רמות קשיחות`).toBeNull();
    }
  });

  test('heading-defaults במנוע הוא fallback מתועד בלבד; ההזרקה מחליפה אותו', () => {
    const hd = readFileSync(join(here, '..', '..', 'layout-engine', 'src', 'pagination', 'heading-defaults.ts'), 'utf8');
    expect(hd.includes('הבעלים האמיתי')).toBe(true); // policy-torah הוא הבעלים — מתועד
    const cand = readFileSync(join(here, '..', '..', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
    expect(cand.includes('input.headingBehaviorOf ?? legacyHeadingBehaviorOf')).toBe(true);
  });
});
