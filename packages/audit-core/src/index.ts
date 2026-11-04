/**
 * @tora/audit-core — ביקורת מבנית/טקסטואלית עצמאית
 *
 * שלב 7: שלד · שלב 21 (פרק ג, שער M2): Text Audit v1 — הוכחה שהקלט לא
 * אבד ולא שוכפל בפרסור, על בסיס פרוסות ומזהים (§14.2), בלי תלות בהוכחת
 * הפרסר. שלב 38 (פרק ה): ביקורת גאומטית וטקסטואלית על IR — כיסוי אטומים,
 * קישוריות הערות, גאומטריה וסדר טורים (§14.2, §12 auditLayout).
 * ה־API הציבורי של החבילה נחשף דרך קובץ זה בלבד (אפיון §5).
 */
export const PACKAGE_NAME = '@tora/audit-core' as const;
export const SKELETON_NOTE = 'Text Audit v1 (שלב 21) + Layout Audit v1 (שלב 38) הושלמו' as const;

// ── שלב 21: Text Audit v1 (§14.1–14.3, §18-M2) ──
export type {
  AuditErrorEntry,
  AuditSeverity,
  TextAuditFinding,
  TextAuditInput,
  TextAuditReport,
} from './text-audit.js';
export {
  AUDIT_CORE_ERROR_CATALOG,
  AuditCoreError,
  TEXT_AUDIT_FINDING_CODES,
  auditErrorCatalogSize,
  isRegisteredAuditErrorKey,
  runTextAudit,
} from './text-audit.js';

// ── שלב 38 (פרק ה): ביקורת גאומטית וטקסטואלית על IR (§14, §12) ──
export type {
  LayoutAuditFinding,
  LayoutAuditInput,
  LayoutAuditReport,
} from './layout-audit.js';
export {
  LAYOUT_AUDIT_FINDING_CODES,
  auditLayout,
} from './layout-audit.js';

// ── שלב 72 (פרק ט, M8): הביקורת הסמנטית על מערכת הקישורים (§14.2) ──
export type {
  LinkAuditInventories,
  LinkAuditReport,
} from './link-audit.js';
export {
  LINK_AUDIT_FINDING_CODES,
  auditLinks,
} from './link-audit.js';
