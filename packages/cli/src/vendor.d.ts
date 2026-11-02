/**
 * vendor.d.ts — הצהרות סוגים מינימליות לתלויות ספק ללא טיפוסים (CLI בלבד).
 *
 * wawoff2 (2.0.1) — פריקת WOFF2; השימוש זהה לשומר ההזרקה של ADR-003:
 * המודול מוזרק לספק הנעול, לא נצרך ישירות מקוד הליבה.
 */
declare module 'wawoff2' {
  export function decompress(bytes: Uint8Array): Promise<Uint8Array>;
  const wawoff2: { decompress: (bytes: Uint8Array) => Promise<Uint8Array> };
  export default wawoff2;
}
