/**
 * woff2-browser.ts — פריקת WOFF2 בתוך ה־Worker, ללא המודול השבור של wawoff2
 * (שלב 85 — תיקון שורש שנתגלה ב־E2E האמיתי הראשון של הדפדפן).
 *
 * הרקע: wawoff2 (הנעול, v2.0.1) נכתב ל־Node. קוד הדבק של emscripten מסיים
 * את הקובץ בהשמה `module["exports"]=Module` שמופיעת **בתוך ענף
 * ENVIRONMENT_IS_NODE בלבד** — בבניית הדפדפן הענף אינו מתבצע, ה־CJS-אינטרופ
 * מחזיר אובייקט ריק, הבטחת ה־onRuntimeInitialized של המעטפת נרשמת על
 * האובייקט הריק ולעולם אינה נפתחת: הריצה הראשונה בדפדפן נתלית לנצח
 * ב־preparing בלי שגיאה. אף בדיקה קודמת לא הריצה את ה־Worker האמיתי
 * בדפדפן — ה־E2E של שלב 85 הוא שתפס את זה.
 *
 * הפתרון: עותק הפעלה מתוקן בביט־אחד — `vendor/decompress-binding.js`
 * הוא הקובץ המקורי (הנעול ב־sha256 ב־HARFBUZZ_LOCK; מוגש גם כנכס ?url
 * לטביעת האצבע של הספק) בתוספת שורה אחת בסופו: `;export default Module;`
 * — הוצאת המודול מענף ה־Node. ה־wasm המוטמע זהה ביט־ביט; הזהות
 * מול המקור נאכפת ב־verify-e2e-focused (סעיף ה־vendor).
 *
 * הזמן: ה־import ממתין לסיום ההערכה של הקובץ (run() נקרא בסופו);
 * אתחול ה־wasm אסינכרוני, ולכן רישום ההתקשרות שלנו אחרי ה־import מספיק
 * בהכרח — אותו סדר עומד ב־Node (שם השמת module.exports=Module בענף
 * ה־Node משיג את אותה תוצאה).
 */
import Module from './vendor/decompress-binding.js';

/** נפתח כשהדבק emscripten מוכן — לפני זה decompress אינו קיים על המודול. */
const runtimeReady = new Promise<void>((resolve) => {
  Module.onRuntimeInitialized = () => resolve();
});

/**
 * פריקת WOFF2 ⇒ sfnt. זהה סמנטית ל־wawoff2/decompress (Node):
 * false ⇐ כישלון מפורש; אחרת הבטחה של ה־sfnt.
 */
export function decompressWoff2Browser(bytes: Uint8Array): Promise<Uint8Array> {
  return (async () => {
    await runtimeReady;
    const out = Module.decompress(bytes);
    if (out === false) {
      throw new Error('ConvertWOFF2ToTTF failed');
    }
    return out;
  })();
}
