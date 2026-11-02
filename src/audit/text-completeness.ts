import type { ParsedDocument, RenderedPage, Settings, AuditFinding } from '../types';

/**
 * בדיקת שלמות טקסט — השוואת מילים מהמקור מול ה-HTML המרונדר.
 *
 * V21 Issues_table + Software_specification v2 §4.1:
 * > "text-completeness — מילים מהמקור חסרות ב-DOM
 * >  **פגם חמור ביותר — טקסט תורני שאבד!** אפילו מילה אחת חסרה היא בעיה קריטית"
 */
export function checkTextCompleteness(
  doc: ParsedDocument,
  pages: RenderedPage[],
  _settings: Settings
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  const sourceWords = extractSourceWords(doc);
  if (sourceWords.length === 0) return findings;

  const renderedText = pages.map(p => stripHtml(p.html)).join(' ');
  const renderedWords = new Set(tokenize(renderedText));

  const missingWords: string[] = [];
  const sourceSet = new Map<string, number>();
  for (const w of sourceWords) {
    sourceSet.set(w, (sourceSet.get(w) ?? 0) + 1);
  }

  for (const word of sourceSet.keys()) {
    if (!renderedWords.has(word)) {
      missingWords.push(word);
    }
  }

  if (missingWords.length === 0) return findings;

  const sample = missingWords.slice(0, 10);
  findings.push({
    page: 0,
    kind: 'text-out-of-bounds',
    severity: 'HIGH',
    description: `טקסט חסר ברינדור: ${missingWords.length} מילים. דוגמאות: ${sample.join(', ')}`,
    suggestedFix: 'בדיקה ידנית של ה-AST וה-renderer',
  });

  return findings;
}

function extractSourceWords(doc: ParsedDocument): string[] {
  const text: string[] = [];
  function walk(nodes: any[]) {
    for (const n of nodes) {
      if (n.type === 'body' || n.type === 'custom') {
        text.push(n.text);
      } else if (n.type === 'heading') {
        text.push(n.text);
      }
      if (n.children) walk(n.children);
    }
  }
  walk(doc.root);
  return tokenize(text.join(' '));
}

function tokenize(text: string): string[] {
  return text
    .replace(/\u0001FN:[^\u0002]*\u0002/g, ' ')
    .replace(/[.,;:!?()"\[\]{}<>=+\-_*&^%$#@!~`|\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 0);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}
