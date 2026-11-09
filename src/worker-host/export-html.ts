/**
 * export-html.ts — מסלול הייצוא הטהור של המעטפת (שלב 86; אפיון §15.1).
 *
 * "מעבר מלא ל־render-html מ־IR; ניתוק export מה־preview DOM ואיסור
 * window.print כמסלול הייצוא הסמכותי" (תכנית 86): הייצוא הוא היטל HTML
 * שנבנה כולו מה־IR הקפוא שב־resultStore — אותם bytes שהיו ל-CLI
 * (renderHtml טהור; §15.1: אין DOM/CSSOM/CDN, אין מדידה, אין reflow).
 *
 * ה־bytes של הגופנים מגיעים מהצרור שכבר נטען (asset-bundle) — אותם
 * bytes שאומתו ב-sha256 והוזרקו לעובד; אין טעינה חדשה ואין רשת.
 *
 * מסירה לדפדפן (Blob + anchor) היא תעבורת בלבד — תחומה בפונקציה
 * אחת מבודדת; הרנדרר עצמו טהור ונבדק גם ב-Node (verify-export-pure).
 */
import { renderHtml, type AssetManifest, type FontAssetEntry, type RenderHtmlResult } from '@tora/render-html';
import type { LayoutDocument } from '@tora/layout-api';
import type { FontBytesEntry } from './protocol.js';

/** קלט הייצוא — ה־IR מהריצה האחרונה + המקור שלה + הצרור החי. */
export interface ExportHtmlInput {
  readonly ir: LayoutDocument;
  /** המקור שממנו נבנה ה־IR — נחוץ לשחזור הטקסט הלוגי (logicalTextOfRun). */
  readonly source: string;
  readonly bundle: { readonly fonts: readonly FontBytesEntry[] };
}

/** רשומת גופן להיטל — נגזרת מהרשומה במרשם הגופנים של הצרור. */
function fontEntryOf(f: FontBytesEntry): FontAssetEntry {
  const rec = f.record;
  return {
    fontId: rec.fontId,
    family: rec.family ?? rec.file,
    file: rec.file,
    format: rec.binaryFormat,
    contentSha256: rec.sha256,
  };
}

/**
 * בניית הייצוא — טהורה: אותו IR + אותם נכסים ⇐ ביט-ביט אותן תוצאות
 * (§15.1). אין תאריך בתוכן; קנוני מטבעו (renderHtml).
 */
export function buildExportHtml(input: ExportHtmlInput): RenderHtmlResult {
  const fonts = input.bundle.fonts.map(fontEntryOf);
  const assets: AssetManifest = { schemaVersion: 1, fonts };
  return renderHtml(input.ir, { schemaVersion: 1 }, assets, undefined, { source: input.source });
}

/** שם קובץ יציב — מזהה המסמך בלבד (שם הקובץ שהוזן אינו נכנס לתוכן). */
export function exportFileNameOf(documentId: string): string {
  const safe = documentId.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'document'}.html`;
}

/**
 * מסירה לדפדפן — התעבורה היחידה שנוגעת ב-DOM (Blob/anchor). מבודדת
 * כאן כדי שהבונה (buildExportHtml) יישאר טהור; בדיקות מזריקות תעבורה
 * חלופית (verify-export-pure; tests/component/export-button).
 */
export type DownloadTransport = (blob: Blob, fileName: string) => void;

export function browserDownloadTransport(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
