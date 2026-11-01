/**
 * @tora/audit-core — ביקורת מבנית/טקסטואלית עצמאית
 *
 * שלב 7: שלד · שלב 21 (פרק ג, שער M2): Text Audit v1 — הוכחה שהקלט לא
 * אבד ולא שוכפל בפרסור, על בסיס פרוסות ומזהים (§14.2), בלי תלות בהוכחת
 * הפרסר. ה־API הציבורי של החבילה נחשף דרך קובץ זה בלבד (אפיון §5).
 * המשך המימוש: Audit גאומטי וטקסטואלי על IR — פרק ה (שלב 38).
 */
export const PACKAGE_NAME = '@tora/audit-core' as const;
export const SKELETON_NOTE = 'Text Audit v1 (שלב 21) הושלם; Audit גאומטי על IR — שלב 38' as const;

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
