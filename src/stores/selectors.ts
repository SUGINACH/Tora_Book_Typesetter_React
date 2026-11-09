/**
 * selectors.ts — בוררים צרים שמונעים רינדורים מיותרים (שלב 76; אפיון §13.1).
 *
 *   1. zustand v4: ה־equalityFn אינו ב־useStore אלא ב־useStoreWithEqualityFn
 *      מ־'zustand/traditional' — זו הנקודה היחידה שבה רכיב נרשם ל־store.
 *   2. כל בורר מחזיר **סקלר או אובייקט בעל זהות יציבה**; השוואת שכבה־אחת
 *      (shallow) רק כשהבורר מרכיב אובייקט חדש משדות קיימים — shallow
 *      משווה ערכים ולא כתובות, ולכן תוצאה חדשה־אך-שוות־ערך אינה מרנדרת.
 *   3. אין בוררים רחבים (state כולו) — רינדור רכיב מוגבל לשדה שהוא צורך.
 */
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { useEditorStore } from './editor-store.js';
import { useRunStore, type RunProgress } from './run-store.js';
import { useResultStore, type ResultFinding } from './result-store.js';
import { useSettingsStore } from './settings-store.js';
import { useViewStore, type ViewFocus, type Locale } from './view-store.js';
import type { ValidationIssue, EffectiveSettings } from '@tora/settings-schema';
import type { AnchorTable, LayoutDocument, RunManifest } from '@tora/layout-api';
import type { LocatedIssue, SourceAnalysis } from './source-analysis.js';

// ─────────────────────────── editor ───────────────────────────

export const useRawText = (): string => useStoreWithEqualityFn(useEditorStore, (s) => s.rawText);
export const useDocumentName = (): string => useStoreWithEqualityFn(useEditorStore, (s) => s.documentName);
export const useRevision = (): number => useStoreWithEqualityFn(useEditorStore, (s) => s.revision);
export const useIsDirty = (): boolean => useStoreWithEqualityFn(useEditorStore, (s) => s.dirty);
// שלב 80 — מפת שגיאות הקלט וסקירת המסמך (אינן נכנסות ל-layoutHash)
export const useImportAnalysis = (): Readonly<SourceAnalysis> | null =>
  useStoreWithEqualityFn(useEditorStore, (s) => s.analysis);
export const useImportIssue = (): Readonly<LocatedIssue> | null =>
  useStoreWithEqualityFn(useEditorStore, (s) => s.importIssue);
/** המפה טריה ⇐ הניתוח נחתם למהדורה הנוכחית (עוגן stale — שלב 80). */
export const useAnalysisIsStale = (): boolean =>
  useStoreWithEqualityFn(useEditorStore, (s) => s.analysis !== null && s.analysis.analyzedRevision !== s.revision);

// ─────────────────────────── settings ───────────────────────────

export const useSettingsDraft = (): Readonly<Record<string, unknown>> =>
  useStoreWithEqualityFn(useSettingsStore, (s) => s.draft, shallow);
export const useSettingsIssues = (): readonly ValidationIssue[] =>
  useStoreWithEqualityFn(useSettingsStore, (s) => s.issues, shallow);
export const useUnmappedLegacy = (): Readonly<Record<string, unknown>> =>
  useStoreWithEqualityFn(useSettingsStore, (s) => s.unmappedLegacy, shallow);
export const useEffectiveSettings = (): Readonly<EffectiveSettings> | null =>
  useStoreWithEqualityFn(useSettingsStore, (s) => s.effective);
export const useConfigHash = (): string | null =>
  useStoreWithEqualityFn(useSettingsStore, (s) => (s.effective === null ? null : s.effective.configHash));
export const usePresetNames = (): readonly string[] =>
  useStoreWithEqualityFn(useSettingsStore, (s) => Object.keys(s.presets), shallow);

// ─────────────────────────── run ───────────────────────────

export const useRunPhase = (): ReturnType<typeof useRunStore.getState>['phase'] =>
  useStoreWithEqualityFn(useRunStore, (s) => s.phase);
export const useJobId = (): string | null => useStoreWithEqualityFn(useRunStore, (s) => s.jobId);
export const useInputHash = (): string | null => useStoreWithEqualityFn(useRunStore, (s) => s.inputHash);
export const useRunProgress = (): Readonly<RunProgress> | null =>
  useStoreWithEqualityFn(useRunStore, (s) => s.progress, shallow);
export const useRunErrorCode = (): string | null => useStoreWithEqualityFn(useRunStore, (s) => s.errorCode);

// ─────────────────────────── result ───────────────────────────

export const useLayoutIr = (): Readonly<LayoutDocument> | null =>
  useStoreWithEqualityFn(useResultStore, (s) => s.ir);
export const useRunManifest = (): Readonly<RunManifest> | null =>
  useStoreWithEqualityFn(useResultStore, (s) => s.manifest);
export const useFindings = (): readonly ResultFinding[] =>
  useStoreWithEqualityFn(useResultStore, (s) => s.findings);
export const useAnchors = (): Readonly<AnchorTable> | null =>
  useStoreWithEqualityFn(useResultStore, (s) => s.anchors);
export const useLayoutHash = (): string | null =>
  useStoreWithEqualityFn(useResultStore, (s) => s.layoutHash);
/** תמונת המקור מזמן הריצה (תיקון 2026-11-09/ב') — לשחזור הטקסט הלוגי בהיטל. */
export const useResultSourceText = (): string | null =>
  useStoreWithEqualityFn(useResultStore, (s) => s.sourceAtRun);
/** שלב 81 — מהדורת המקור שממנה הופקה התוצאה (עוגן טריות). */
export const useResultSourceRevision = (): number | null =>
  useStoreWithEqualityFn(useResultStore, (s) => s.sourceRevision);
/**
 * שלב 81 — האם התוצאה מהדורת המקור הנוכחית (הניווט המקושר תקף רק אז):
 * ההיסטים ב־IR מתפרשים על המקור שבעורך; עריכה מאז הריצה הופכת אותם
 * לזרים. הגנה בעומק — שער הקבלה כבר חוסם תוצאה שנערך המקור מאז שליחתה.
 */
export const useResultIsCurrent = (): boolean => {
  const resultRevision = useResultSourceRevision();
  const editorRevision = useRevision();
  return resultRevision !== null && resultRevision === editorRevision;
};

// ─────────────────────────── view ───────────────────────────

export const useZoom = (): number => useStoreWithEqualityFn(useViewStore, (s) => s.zoom);
export const useSelectedPageId = (): string | null =>
  useStoreWithEqualityFn(useViewStore, (s) => s.selectedPageId);
export const useLocale = (): Locale => useStoreWithEqualityFn(useViewStore, (s) => s.locale);
export const useViewFocus = (): Readonly<ViewFocus> | null =>
  useStoreWithEqualityFn(useViewStore, (s) => s.focus, shallow);
