# src/stores

חמשת ה־stores של ה־React shell החדש (שלב 76; אפיון §13.1):

- `editor-store.ts` — מקור גולמי ומצב עריכה; **אינו מכיל Layout IR**.
- `settings-store.ts` — draft, presets ו־validation — הכל מ־`@tora/settings-schema`.
- `run-store.ts` — מכונת מצבי ה־job + הגנת stale-job דו־שכבתית.
- `result-store.ts` — IR/manifest/findings/AnchorTable; הכנסה ⇐ deepFreeze איטרטיבי.
- `view-store.ts` — zoom/עמוד/locale/focus; UI-only.

תשתית: `storage.ts` (KVStorage מוזרק, מפתחות `tora-ui:*:v1`), `legacy-migrate.ts`
(מיגרציית state ישן — קריאה בלבד, חד־פעמית), `selectors.ts` (בוררים צרים עם
`useStoreWithEqualityFn` + `shallow`), `index.ts` (חבית + `resetForNewDocument`).

שלב 80 — מסלול ייבוא ומפת שגיאות קלט (אפיון §3.3, §13–14): `source-analysis.ts`
(ניתוח טהור של המקור — פרסור יחיד דרך content-model, דיאגנוסטיקה ממוקדת
שורה:עמודה, סקירת metadata וזרמי הערות, קטלוג שגיאות ייבוא) ו־`import-document.ts`
(פעולת הייבוא היחידה: ביטול ריצה ← ניקוי ← כתיבה ← ניתוח ← פרסום ב־editor store).
הניתוח נשמר ב־`editor-store` כנתון מתחום המסמך (נגזר מהמקור הגולמי; אינו
Layout IR, אינו נשמר לדיסק ואינו נכנס ל־layoutHash) ונחתם למהדורה שיצרה
אותו — `analyzedRevision` — עוגן הטריות מול עריכה (בלי שעון, כמו stale-job).

מחליף את `src/store/` הישן עם השלמת פרק י. הקוד הישן ב־src/ אינו נקודת ייחוס
(כלל 8 בתכנית) ויוחלף בסיום ההגירה.

שלב 84 — ניקוי stores ובדיקת הגדרות יתומות (אפיון §13, §18-M9): ה־store
הישן `src/store/` **נמחק** (בעלות מצב מקבילה מתה — החמישייה כאן היא בעלת
ה־state היחידה); `rehydrate` מאמת את ה־draft השמור מול המרשם — מפתח
שירד מהמרשם אינו נכנס כיתום (נשמר ב־unmappedLegacy עם issue; אין שני
מסלולים ל־draft); כל שינוי draft ממשי מאפס את ה־effective עד
`applyDraft` — אין effective מהעולם הישן בין תבניות/קבצים;
`resetForNewDocument` מבטל ריצה פעילה **לפני** האיפוס דרך הוק רשום
(`registerRunCancellation` — App רושם `controller.cancel`; פעולת הייבוא
שומרת ביטול משלה, אידמפוטנטי). דוח כיסוי ההגדרות:
`docs/migration/settings-coverage.json` (מחולל: `gen-settings-coverage`,
מאמת: `verify-settings-coverage`).
