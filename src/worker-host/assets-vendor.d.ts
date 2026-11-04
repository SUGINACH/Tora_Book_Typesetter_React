/**
 * assets-vendor.d.ts — הצהרת טיפוסים לייבוא נכסים דרך ?url (שלב 77).
 *
 * vite ממפה `import x from '<file>?url'` לכתובת הנכס המופק בבנייה; ה־WASM
 * של HarfBuzz ומפענחן ה־WOFF2 נטענים כך מ־node_modules אל ה־Worker בלי
 * העתקת בינאריים למאגר (§6.4, ADR-003). זהה ברוחב ל־vite/client — כאן
 * במפורש לשני הקבצים שנצרכים.
 */
declare module 'harfbuzzjs/dist/harfbuzz.wasm?url' {
  const url: string;
  export default url;
}
declare module 'wawoff2/build/decompress_binding.js?url' {
  const url: string;
  export default url;
}
