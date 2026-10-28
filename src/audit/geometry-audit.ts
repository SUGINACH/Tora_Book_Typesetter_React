import type { RenderedPage, Settings, AuditFinding } from '../types';

/**
 * בדיקת גיאומטריה כללית.
 * כרגע מימוש מינימלי — רק בדיקות בסיסיות.
 */
export function auditGeometry(
  pages: RenderedPage[],
  _settings: Settings
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const page of pages) {
    // בדיקת איזון טורים
    const cols = page.geometry.columns;
    if (cols.length === 2) {
      const heightDiff = Math.abs(cols[0]!.height - cols[1]!.height);
      if (heightDiff > 30) {
        findings.push({
          page: page.pageNumber,
          kind: 'imbalanced-columns',
          severity: heightDiff > 60 ? 'HIGH' : 'MEDIUM',
          description: `פער גובה בין טורים: ${heightDiff.toFixed(0)}px`,
          suggestedFix: 'העברת בלוקים בין הטורים',
        });
      }
    }

    // בדיקת overflow
    if (page.geometry.footnoteAreaHeight && page.geometry.footnoteAreaHeight > 200) {
      // אזור הערות גדול מדי — ייתכן overflow
    }
  }

  return findings;
}
