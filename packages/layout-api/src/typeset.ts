/**
 * typeset.ts — חוזה typeset(), RunManifest ו־Decision Ledger (§12, §6.7; שלב 32).
 *
 * אסמכתא: אפיון §12 (חתימת typeset + TypesetRequest/TypesetSuccess),
 * §6.7 (RunManifest/DecisionRecord/trace levels/budget), §6.5–6.6, §10 (hooks
 * של המדיניות — ממומשים ב-policy-torah מפרק ח; הליבה אינה יודעת מהו H2),
 * §8 (SearchBudget ביחידות מצבים, לא במילישניות).
 *
 * עקרונות:
 *   1. נקודת כניסה אחת ויציבה: typeset(request, measurement, policy, observer?).
 *   2. observer מדווח progress בלבד ואינו יכול לשנות state — אין לו גישה
 *      למבני ההחלטה (הטיפוס שלו חסר כל ערוץ השפעה).
 *   3. trace levels: off | summary | decisions | full — deterministic; הפעלת
 *      trace אינה משנה layoutHash (§6.7).
 *   4. אין durationMs בתוצאה (§12); זמני ריצה ב-host metrics בלבד.
 */
import type { SourceSpan } from '@tora/content-model';
import type { FontFaceKey, MeasurementProvider, TestMeasurementProvider, Cost } from '@tora/measurement-api';
import { isFontFaceKey } from '@tora/measurement-api';
import type { TorahDocument, TransformRecord } from '@tora/content-model';
import { isTransformRecord } from '@tora/content-model';
import { LayoutApiError } from './errors.js';
import type { DecisionLedger, TraceLevel } from './decision-ledger.js';
import { isTraceLevel } from './decision-ledger.js';
import type { LayoutDocument } from './ir.js';
import { createLayoutDocument } from './ir.js';
import type { RunManifest } from './run-manifest.js';

// ─────────────────────────── קלט ───────────────────────────

/**
 * מסמך תוכן לעימוד: TorahDocument מועשר בספר הטרנספורמציות של הפרסר
 * (§6.5: ה־IR נושא transformations מוצהרות; המארח מעביר אותן מ- ParseResult).
 */
export interface ContentDocument extends TorahDocument {
  readonly transforms: readonly TransformRecord[];
}

// TraceLevel/TRACE_LEVELS/isTraceLevel מוגדרים ב-decision-ledger.ts (הכיוון היחיד המותר; הם מיוצאים משם).

/** תקציב חיפוש ביחידות מצבים — לעולם לא במילישניות (§9.2). */
export interface SearchBudget {
  readonly maxCandidatesPerState: number;
  readonly maxBeamWidth: number;
  readonly maxExpandedStates: number;
  readonly maxOuterIterations: number;
}

export const DEFAULT_SEARCH_BUDGET: SearchBudget = Object.freeze({
  maxCandidatesPerState: 64,
  maxBeamWidth: 8,
  maxExpandedStates: 200_000,
  maxOuterIterations: 8,
});

export function searchBudgetIssues(b: unknown): string[] {
  const issues: string[] = [];
  if (typeof b !== 'object' || b === null) return ['not-an-object'];
  const v = b as Record<string, unknown>;
  for (const k of ['maxCandidatesPerState', 'maxBeamWidth', 'maxExpandedStates', 'maxOuterIterations'] as const) {
    if (typeof v[k] !== 'number' || !Number.isSafeInteger(v[k]) || (v[k] as number) < 1) issues.push(k);
  }
  return issues;
}

export function isSearchBudget(b: unknown): b is SearchBudget {
  return searchBudgetIssues(b).length === 0;
}

/** גופן יחיד שנפתר מראש לשימוש מסוים — ההחלטה במארח לפני הריצה (§6.4). */
export interface ResolvedFont {
  readonly usage: 'body' | 'note-body' | 'heading' | 'note-marker';
  readonly font: FontFaceKey;
}

/** מניפסט נכסים פתור — נעול בהאשים שנכנסים ל-inputHash (§6.7). */
export interface ResolvedAssetManifest {
  readonly schemaVersion: 1;
  readonly fonts: readonly ResolvedFont[];
  /** SHA-256 של מניפסט הגופנים (v2) — נעילת "אותם bytes". */
  readonly fontsManifestSha256: string;
  /** SHA-256 של מניפסט הנכסים (עיטורים/שערים) — '0'.repeat(64) כשאין נכסים. */
  readonly assetsManifestSha256: string;
}

export function resolvedAssetManifestIssues(m: unknown): string[] {
  const issues: string[] = [];
  if (typeof m !== 'object' || m === null) return ['not-an-object'];
  const v = m as Record<string, unknown>;
  if (v.schemaVersion !== 1) issues.push('schemaVersion');
  if (!Array.isArray(v.fonts) || v.fonts.length === 0) { issues.push('fonts:empty'); }
  else {
    for (let i = 0; i < v.fonts.length; i++) {
      const f = v.fonts[i] as Record<string, unknown>;
      if (!['body', 'note-body', 'heading', 'note-marker'].includes(String(f?.usage))) issues.push(`fonts[${i}].usage`);
      if (!isFontFaceKey(f?.font)) issues.push(`fonts[${i}].font`);
    }
  }
  const HEX = /^[0-9a-f]{64}$/;
  if (typeof v.fontsManifestSha256 !== 'string' || !HEX.test(v.fontsManifestSha256)) issues.push('fontsManifestSha256');
  if (typeof v.assetsManifestSha256 !== 'string' || !HEX.test(v.assetsManifestSha256)) issues.push('assetsManifestSha256');
  return issues;
}

export interface TypesetRequest {
  readonly document: ContentDocument;
  /** ההגדרות האפקטיביות המאומתות (configHash כבר כלול בהן). */
  readonly settings: unknown; // EffectiveSettings מ-settings-schema (סדר מפתחות אינו משנה)
  readonly assets: ResolvedAssetManifest;
  readonly trace: TraceLevel;
  readonly budget: SearchBudget;
}

export function typesetRequestIssues(r: unknown): string[] {
  const issues: string[] = [];
  if (typeof r !== 'object' || r === null) return ['not-an-object'];
  const v = r as Record<string, unknown>;
  const doc = v.document as Record<string, unknown> | undefined;
  if (typeof doc !== 'object' || doc === null || !Array.isArray((doc as Record<string, unknown>).parts)) {
    issues.push('document');
  } else if (!Array.isArray((doc as Record<string, unknown>).transforms)) {
    issues.push('document.transforms');
  } else if (((doc as Record<string, unknown>).transforms as readonly unknown[]).some((t) => !isTransformRecord(t))) {
    issues.push('document.transforms:invalid');
  }
  if (typeof (v.settings as Record<string, unknown>)?.configHash !== 'string') issues.push('settings');
  issues.push(...resolvedAssetManifestIssues(v.assets).map((x) => `assets.${x}`));
  if (!isTraceLevel(v.trace)) issues.push('trace');
  if (!isSearchBudget(v.budget)) issues.push('budget');
  return issues;
}

export function assertTypesetRequest(r: TypesetRequest): void {
  const issues = typesetRequestIssues(r);
  if (issues.length > 0) {
    throw new LayoutApiError('errors.layoutir.INVALID_REQUEST', { issues: issues.join('; ') }, `בקשת typeset שגויה: ${issues.join('; ')}`);
  }
}

// ─────────────────────────── מדיניות (hooks; §10) ───────────────────────────

/** מזהה מועמד/מצב לחוזה ה-hooks (§6.6: נגזר מסדר החלטות השבירה). */
export interface CandidateRef {
  readonly id: string;
}

/** רשומת breakpoint חוקי — מדיניות התורה מסננת/מרחיבה (§8.1). */
export interface LegalBreakContext {
  readonly blockId: string;
  readonly beforeAtomIndex: number;
  readonly sourceSpans: readonly SourceSpan[];
}

export type LegalBreakVerdict = { readonly allow: boolean; readonly reason?: string };

/** hardConstraints (§6.6/§10): פסילת מועמד בעל הפרה קשיחה. */
export interface HardConstraintContext {
  readonly scope: 'line' | 'column' | 'page';
  readonly scopeId: string;
  readonly sourceSpans: readonly SourceSpan[];
}

export type HardConstraintVerdict = { readonly violated: false } | { readonly violated: true; readonly code: string; readonly limit?: number; readonly actual?: number };

/** pageTemplate (§9.3/§10.1): בחירת תבנית עמוד; ממומש בפועל מפרק ז. */
export interface PageTemplateContext {
  readonly physicalPageIndex: number;
  readonly parity: 'recto' | 'verso';
  readonly chapterState: string;
}

export type PageTemplateVerdict = { readonly templateId: string };

/** score (§6.6): וקטור איכות להשוואה לקסיקוגרפית. */
export interface ScoreContext {
  readonly scopeId: string;
  readonly sourceSpans: readonly SourceSpan[];
}

export type ScoreVerdict = { readonly quality: Readonly<Record<string, Cost>> };

/** onAnchor (§11): דיווח עוגן שנקבע. */
export interface OnAnchorContext {
  readonly anchorId: string;
  readonly pageId: string;
  readonly regionId: string;
}

/** קלט עוגן לפני קביעה. */
export interface AnchorDecisionContext {
  readonly anchorId: string;
  readonly sourceSpans: readonly SourceSpan[];
}

export type AnchorPlacementVerdict = { readonly place: true } | { readonly place: false; readonly reason: string };

/**
 * LayoutPolicy — מדיניות מוזרקת (§10). הליבה אינה מכירה את הכללים;
 * policy-torah (פרק ח) ממלא את ה-hooks. בשלבי השלד (33–40) המנוע מסמן
 * במפורש היכן הוא פועל כ-v0 פשוט ודטרמיניסטי (§18-M4: מותר, בתנאי שמסומן).
 */
export interface LayoutPolicy {
  readonly policyId: string;
  /** שבירות חוקיות נוספות/שלילה של הזדמנויות UAX #14 (§10 — למשל איסור שבירה אחרי מקף עברי). */
  readonly legalBreaks?: (ctx: LegalBreakContext) => LegalBreakVerdict;
  readonly hardConstraints?: (ctx: HardConstraintContext) => HardConstraintVerdict;
  readonly pageTemplate?: (ctx: PageTemplateContext) => PageTemplateVerdict;
  readonly score?: (ctx: ScoreContext) => ScoreVerdict;
  readonly onAnchor?: (ctx: OnAnchorContext) => void;
  /** עיגון/דחיית עוגן (§11.2). */
  readonly anchorPlacement?: (ctx: AnchorDecisionContext) => AnchorPlacementVerdict;
}

// ─────────────────────────── צופה ───────────────────────────

export type ProgressStage = 'parse' | 'measuring' | 'breaking' | 'paginating' | 'notes' | 'assembling';

export interface LayoutObserver {
  /** דיווח התקדמות לפי מצבים/שלבים (§12) — ללא כל ערוץ השפעה על ההחלטות. */
  onProgress?(stage: ProgressStage, completedUnits: number, totalUnits?: number): void;
}

// ─────────────────────────── פלט ───────────────────────────

export interface TypesetSuccess {
  readonly layout: LayoutDocument;
  readonly manifest: RunManifest;
  readonly ledger?: DecisionLedger;
}

export type AnyProvider = MeasurementProvider | TestMeasurementProvider;

/** בניית TypesetSuccess מאומת — אין פלט ללא manifest (§6.7). */
export function makeTypesetSuccess(layout: LayoutDocument, manifest: RunManifest, ledger?: DecisionLedger): TypesetSuccess {
  return Object.freeze({ layout, manifest, ledger });
}

/** ודאות שפלט עובר אימות IR מלא (משמש את המנוע בסוף ריצה). */
export function validatedLayout(layout: unknown): LayoutDocument {
  return createLayoutDocument(layout);
}
