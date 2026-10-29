import type { RenderedPage, Settings, AuditFinding, AuditFindingKind, ParsedDocument } from '../types';
import { checkTextCompleteness } from './text-completeness';

/**
 * בדיקת גיאוממטריה מקיפה.
 * קורא את העמודים המרונדרים, אינו משנה אותם (pure function).
 */
export function auditGeometry(
  pages: RenderedPage[],
  settings: Settings
): AuditFinding[] {
  return auditGeometryWithDoc(pages, settings, undefined);
}

/**
 * גרסה עם מסמך — מאפשרת בדיקת text-completeness (קריטית).
 */
export function auditGeometryWithDoc(
  pages: RenderedPage[],
  settings: Settings,
  doc?: ParsedDocument
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // בדיקת text-completeness — קריטית (אבדן טקסט תורני!)
  if (doc) {
    findings.push(...checkTextCompleteness(doc, pages, settings));
  }

  for (const page of pages) {
    if (page.pageType === 'main-shaar' || page.pageType === 'back-shaar' || page.pageType === 'sub-shaar') {
      continue;
    }

    checkColumnBalance(page, settings, findings);
    checkOverflow(page, findings);

    if (settings.quality.preventWidow || settings.quality.preventOrphan) {
      checkWidowsOrphans(page, settings, findings);
    }

    checkSparseLines(page, findings);

    if (settings.quality.preventHangingHeadings) {
      checkHangingHeadings(page, findings);
    }

    // V21 — Issues_table
    checkHeadingEscort(page, findings);
    checkPageUnderfill(page, findings);
    checkBlockGap(page, findings);
    checkMultipleBlocks(page, findings);
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
  const html = page.html;
  const inlineHeadings = (html.match(/tora-heading-inline\b/g) || []).length;
  const wideHeadings = (html.match(/tora-heading-inline-wide\b/g) || []).length;

  if (inlineHeadings > 2 && wideHeadings === 0) {
    const pCutCount = (html.match(/p-cut|p-end/g) || []).length;
    if (pCutCount < inlineHeadings) {
      findings.push({
        page: page.pageNumber,
        kind: 'hanging-heading',
        severity: 'MEDIUM',
        description: `חשד כותרת תלויה: ${inlineHeadings} כותרות inline, ${pCutCount} פסקאות`,
        suggestedFix: 'העברת הכותרת האחרונה לטור הבא',
      });
    }
  }
}

// ===== V21 — Issues_table =====

/**
 * heading-escort — כותרת H4+ בתחתית טור עם פחות מ-2 שורות טקסט אחריה.
 */
function checkHeadingEscort(page: RenderedPage, findings: AuditFinding[]): void {
  for (const col of page.geometry.columns) {
    if (col.blockCount < 2) continue;
    if (col.blockCount >= 2 && col.lineCount <= col.blockCount + 1) {
      findings.push({
        page: page.pageNumber,
        kind: 'hanging-heading',
        severity: 'MEDIUM',
        description: `חשד heading-escort בטור ${col.index + 1}: ${col.blockCount} בלוקים, ${col.lineCount} שורות`,
        suggestedFix: 'העברת הכותרת לטור הבא',
      });
    }
  }
}

/**
 * page-underfill — עמוד שאינו מלא (תוכן הגוף תופס פחות מ-80% מהשטח הפנוי).
 */
function checkPageUnderfill(page: RenderedPage, findings: AuditFinding[]): void {
  if (page.pageType === 'chapter-opener') return;

  const pageHeightPx = page.geometry.height * 3.7795;
  const colsTotalHeight = page.geometry.columns.reduce((s, c) => s + c.height, 0);
  const contentHeight = page.geometry.columns.length === 2
    ? Math.max(...page.geometry.columns.map(c => c.height))
    : colsTotalHeight;

  const fillRatio = contentHeight / pageHeightPx;
  if (fillRatio < 0.8) {
    findings.push({
      page: page.pageNumber,
      kind: 'sparse-line',
      severity: 'LOW',
      description: `עמוד לא מלא: ${(fillRatio * 100).toFixed(0)}% ניצול`,
      suggestedFix: 'בדיקה — עשוי להיות טבעי אם הפסקה הבאה ארוכה מדי',
    });
  }
}

/**
 * block-gap — מרחק גדול בין שני בלוקים עוקבים ב-body-flow.
 */
function checkBlockGap(page: RenderedPage, findings: AuditFinding[]): void {
  for (const col of page.geometry.columns) {
    if (col.blockCount < 2) continue;
    const expectedMinHeight = col.blockCount * 30;
    if (col.height > expectedMinHeight * 2 && col.lineCount < col.blockCount * 2) {
      findings.push({
        page: page.pageNumber,
        kind: 'sparse-line',
        severity: 'LOW',
        description: `חשד block-gap בטור ${col.index + 1}: ${col.blockCount} בלוקים על ${col.height.toFixed(0)}px`,
        suggestedFix: 'בדיקה ויזואלית של ריווח בין בלוקים',
      });
    }
  }
}

/**
 * multiple-blocks — שני בלוקים דו-טוריים באותו עמוד.
 */
function checkMultipleBlocks(page: RenderedPage, findings: AuditFinding[]): void {
  if (page.geometry.columns.length !== 2) return;
  const [right, left] = page.geometry.columns;
  if (right.blockCount > 3 && left.blockCount > 3
      && right.lineCount > 20 && left.lineCount > 20) {
    findings.push({
      page: page.pageNumber,
      kind: 'imbalanced-columns',
      severity: 'MEDIUM',
      description: `חשד multiple-blocks: שני טורים עמוסים (${right.blockCount}+${left.blockCount} בלוקים)`,
      suggestedFix: 'בדיקה — האם הקורא צריך להמשיך שתי פסקאות במקביל',
    });
  }
}
