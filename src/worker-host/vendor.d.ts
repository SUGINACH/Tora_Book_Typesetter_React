/**
 * vendor.d.ts — הצהרת סוגים מינימלית ל-wawoff2 בצד המעטפת (שלב 35).
 * אותו יישור ל-packages/cli/src/vendor.d.ts — המודול מוזרק לספק
 * ה-HarfBuzz הנעול (ADR-003) ואינו נצרך ישירות מקוד הליבה.
 */
declare module 'wawoff2' {
  export function decompress(bytes: Uint8Array): Promise<Uint8Array>;
  const wawoff2: { decompress: (bytes: Uint8Array) => Promise<Uint8Array> };
  export default wawoff2;
}
