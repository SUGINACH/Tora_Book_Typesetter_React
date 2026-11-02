/**
 * @tora/cli — Node 22 reference runner (שלב 34 בתכנית 100 השלבים; אפיון §12.2).
 *
 * ה־API הציבורי של החבילה נחשף כאן בלבד: ניתוח טיעונים, הרצה, קודי יציאה
 * וקטלוג השגיאות. המנוע אינו מכיר את ה־CLI; אין React/Tauri/Chromium.
 * הרצות reference חוסמות רשת חיצונית מרגע ההתחלה (§19).
 */
export const PACKAGE_NAME = '@tora/cli' as const;

export * from './args.js';
export * from './errors.js';
export * from './exit-codes.js';
export { runAuditCli, runCli, PARSER_VERSION, type AuditOutcome, type RunReport, type RunOutcome } from './runner.js';
export { CLI_DOCUMENT_ID } from './inputs.js';
export { installNetworkDeny, type NetworkGuard } from './offline-guard.js';
