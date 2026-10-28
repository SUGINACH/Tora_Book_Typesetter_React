import type { CustomTextStyle, ImportedPage, ImportedImage } from '../types';
import { importCustomStyles } from './custom-styles-io';

/**
 * ייבוא קובץ טקסט רגיל (.txt).
 */
export async function importTextFile(file: File): Promise<string> {
  if (!file.name.endsWith('.txt') && file.type !== 'text/plain') {
    throw new Error('פורמט לא נתמך');
  }
  return await file.text();
}

/**
 * ייבוא קובץ Word (.docx) עם המרת סגנון → קידומת טקסט.
 */
export async function importWordFile(file: File): Promise<string> {
  if (!file.name.endsWith('.docx')) {
    throw new Error('פורמט לא נתמך (נדרש .docx)');
  }

  // טעינה דינמית של mammoth
  const mammothModule = await import(/* @vite-ignore */ 'mammoth');
  const mammoth = mammothModule.default || mammothModule;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return convertHtmlToTextWithHeadings(result.value);
}

function convertHtmlToTextWithHeadings(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const lines: string[] = [];

  function processNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() ?? '';
      if (text) lines.push(text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const text = el.textContent?.trim() ?? '';
    if (!text) return;
    const tag = el.tagName.toLowerCase();
    const headingMatch = tag.match(/^h(\d)$/);
    if (headingMatch) {
      const level = parseInt(headingMatch[1]!, 10);
      lines.push(`כותרת ${level} - ${text}`);
    } else if (tag === 'p') {
      lines.push(text);
      lines.push('');
    } else if (tag === 'br') {
      lines.push('');
    } else {
      el.childNodes.forEach(processNode);
    }
  }

  doc.body.childNodes.forEach(processNode);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function importJsonExtensions(file: File): Promise<{
  customStyles?: CustomTextStyle[];
  customPages?: ImportedPage[];
  customImages?: ImportedImage[];
}> {
  if (!file.name.endsWith('.json')) {
    throw new Error('פורמט לא נתמך');
  }
  const text = await file.text();
  const parsed = JSON.parse(text);
  return {
    customStyles: parsed.styles ? importCustomStyles(text) : undefined,
    customPages: parsed.pages,
    customImages: parsed.images,
  };
}
