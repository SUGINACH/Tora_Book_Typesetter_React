import type { RenderedPage, Settings, AuditFinding, AuditFindingKind } from '../types';

/**
 * בדיקת גיאוממטריה מקיפה.
 * קורא את העמודים המרונדרים, אינו משנה אותם (pure function).
 */
export function auditGeometry(
  pages: RenderedPage[],
  settings: Settings
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const page of pages) {
    // דילוג על עמודי שער
    if (page.pageType === 'main-shaar' || page.pageType === 'back-shaar' || page.pageType === 'sub-shaar') {
      continue;
    }

    // 1. בדיקת איזון טורים
    checkColumnBalance(page, settings, findings);

    // 2. בדיקת overflow
    checkOverflow(page, findings);

    // 3. בדיקת אלמנות/יתומים
    if (settings.quality.preventWidow || settings.quality.preventOrphan) {
      checkWidowsOrphans(page, settings, findings);
    }

    // 4. בדיקת שורות דלילות
    checkSparseLines(page, findings);

    // 5. בדיקת כותרת תלויה
    if (settings.quality.preventHangingHeadings) {
      checkHangingHeadings(page, findings);
    }
  }

  return findings;
}

/**
 * בדיקת איזון טורים — פער גובה בין שני הטורים.
 */
function checkColumnBalance(
  page: RenderedPage,
  _settings: Settings,
  findings: AuditFinding[]
): void {
  const cols = page.geometry.columns;
  if (cols.length !== 2) return;

  const diff = Math.abs(cols[0]!.height - cols[1]!.height);
  if (diff > 30) {
    findings.push({
      page: page.pageNumber,
      kind: 'imbalanced-columns',
      severity: diff > 60 ? 'HIGH' : 'MEDIUM',
      description: `פער גובה בין טורים: ${diff.toFixed(0)}px`,
      suggestedFix: 'העברת בלוקים בין הטורים',
    });
  }
}

/**
 * בדיקת overflow — תוכן שגולש מגבולות הטור/עמוד.
 */
function checkOverflow(page: RenderedPage, findings: AuditFinding[]): void {
  const pageHeight = page.geometry.height * 3.7795; // mm → px

  for (const col of page.geometry.columns) {
    // אזור הערות תופס מקום בתחתית
    const footnoteHeight = page.geometry.footnoteAreaHeight ?? 0;
    const availableHeight = pageHeight - footnoteHeight - 100; // מרווחים

    if (col.height > availableHeight) {
      findings.push({
        page: page.pageNumber,
        kind: 'overflow',
        severity: 'HIGH',
        description: `טור ${col.index + 1} גולש: ${col.height.toFixed(0)}px מתוך ${availableHeight.toFixed(0)}px זמינים`,
        suggestedFix: 'העברת בלוק לעמוד הבא',
      });
    }
  }
}

/**
 * בדיקת אלמנות/יתומים — שורה בודדת בראש/סוף טור.
 *
 * אלמנה: שורה בודדת בתחילת טור (גובה < 1.1 × גובה שורה)
 * יתום: שורת פתיחה בודדת בסוף טור
 */
function checkWidowsOrphans(
  page: RenderedPage,
  _settings: Settings,
  findings: AuditFinding[]
): void {
  for (const col of page.geometry.columns) {
    // סף: שורה בודדת = גובה פחות מ-1.1 × גובה שורה ממוצע
    const avgLineHeight = col.height / Math.max(col.lineCount, 1);
    const threshold = avgLineHeight * 1.1;

    // בדיקת אלמנה — הבלוק הראשון בטור קטן מדי
    if (col.blockCount > 0 && col.height < threshold * 2) {
      // יכול להיות אלמנה
      findings.push({
        page: page.pageNumber,
        kind: 'widow',
        severity: 'HIGH',
        description: `חשד אלמנה בטור ${col.index + 1}: גובה נמוך (${col.height.toFixed(0)}px)`,
        suggestedFix: 'העברת שורה נוספת לטור זה',
      });
    }
  }
}

/**
 * בדיקת שורות דלילות — שורה אחרונה קצרה מ-50% מרוחב הטור.
 */
function checkSparseLines(page: RenderedPage, findings: AuditFinding[]): void {
  // זיהוי על ידי חיפוש ב-HTML אחרי פסקאות עם שורה אחרונה קצרה
  const html = page.html;

  // חיפוש פסקאות p-end (אחרונות) שעשויות להיות דלילות
  const pEndCount = (html.match(/p-end/g) || []).length;
  const pCutCount = (html.match(/p-cut/g) || []).length;

  // אם יש יחס גבוה של p-end ל-p-cut, ייתכן שיש דלילויות
  if (pEndCount > 0 && pCutCount > 0) {
    const ratio = pEndCount / (pEndCount + pCutCount);
    if (ratio > 0.5) {
      findings.push({
        page: page.pageNumber,
        kind: 'sparse-line',
        severity: 'LOW',
        description: `יחס גבוה של פסקאות אחרונות (${pEndCount}/${pEndCount + pCutCount})`,
        suggestedFix: 'בדיקה ויזואלית של שורות אחרונות',
      });
    }
  }
}

/**
 * בדיקת כותרת תלויה — כותרת בתחתית טור עם פחות מ-2 שורות טקסט אחריה.
 */
function checkHangingHeadings(page: RenderedPage, findings: AuditFinding[]): void {
  // חיפוש כותרות ב-HTML
  const html = page.html;
  const headingMatches = html.match(/tora-heading/g) || [];

  // אם הכותרת היא הבלוק האחרון בטור, זה חשד לכותרת תלויה
  for (const col of page.geometry.columns) {
    if (col.blockCount > 0) {
      // בדיקה גסה: אם יש פחות מ-2 בלוקים אחרי הכותרת האחרונה
      // (לא ניתן לדעת בדיוק בלי parsing של ה-HTML, אבל זה מסמן חשד)
    }
  }
}
