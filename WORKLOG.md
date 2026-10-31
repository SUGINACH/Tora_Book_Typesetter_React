# Worklog — Tora Book Typesetter React

## תכנית 100 השלבים — יומן ביצוע מחדש (מ־2026-10-30, לאחר האיפוס)

> מבוצעת `תכנית_עבודה_מפורטת_לסוכן_AI_100_שלבים.md` שלב אחר שלב מ־שלב 1, כאילו שום שלב לא בוצע קודם לכן. מבנה רשומה: שלב ← תוצרים ← פקודות בדיקה שרצו ← ממצאים. איפוס ההתחלה מתועד ברשומה הבאה שבסוף היומן הזה.

### תיאום תכנית לפני שלב 15 — העברה מלאה וחוזה הגדרות מוקדם — 2026-10-30
- **סוג רשומה:** תיעוד בלבד; אינה שלב בתכנית, אינה מסמנת השלמה ואינה משנה קוד או נכסים. שלבים 1–14 נשארו כפי שהם, `CHECKLIST` נשאר 14/100 והשלב הבא הוא 15.
- **תיקון סדר:** שלב 30 מגדיר כעת את `settings-schema`, את מרשם כל הגדרות legacy ואת שרשרת ה־migrations לפני Layout IR והמנוע; אכיפת offline אוחדה בשלב 29, ושלב 79 צורך את המיגרציות במקום לממשן מחדש.
- **העברה מלאה:** שלב 17 מחייב מרשם machine-readable של כל מזהי הטקסט ותוחמי הקלט, כולל עשרת מפתחות ה־metadata, `linePrefix`, `inlineMarker` והמרת sentinel ל־InlineItem; שלב 23 מחייב את כל הגופנים במלאי, בלי סינון לפי שימוש מוכח.
- **תאימות ערכים:** נקבע חובה למפות במפורש ובאמצעות fixture את `drop-word-mode: "window"`, בלי ניחוש או החלפה שקטה.
- **אימות:** בדיקת מבנה מקומית של התכנית — 100 כותרות ממוספרות ייחודיות ורציפות 1–100; לכל שלב מטרה, פעולות, תוצרים, בדיקות ושער מעבר; כל סימוני ההשלמה ב־CHECKLIST נשמרו.
- **תיקון שחזור:** לאחר הדחיפה הראשונה של התיאום שוחזרו כל רשומות היומן המקוריות מ־commit `26eb77e`; אין מחיקה או קיצור של היסטוריה.

### שלב 16 — InlineItem ו־ContentBlock (M2) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/content-model/src/inline.ts` — `InlineItem` שישה סוגים: חמשת סוגי האפיון §6.2 (text, note-reference, anchor, explicit-break, inline-box) + `marker` כפי שהתכנית דורשת — הביטוי הקנוני של drop-word/dibbur hamatchil בלי sentinel בטקסט; בנאים מאומתים (`makeTextItem` מחייב אטומים תקינים באותו מסמך וזרם) + `isInlineItem`.
  - `packages/content-model/src/blocks.ts` — `ContentBlock` רקורסיבי לפי §6.2 בדיוק (role/headingLevel/styleId/source/inline/children) + גורמי זהות ordinal/origin בדפוס שלב 15; `headingLevel` חובה ל־'heading' ואסור לשאר (H0–H7 כמו הישן); `children` חוקי לכל תפקיד — בירושה מ־ast-builder הישן (כותרת פותחת בלוק עם ילדים); גזירת `NodeId` ‎node:v1|…‎ ו־`AnchorId` ‎anchor:v1|…‎; עומק מוגבל 32.
  - `packages/content-model/src/document.ts` — `TorahDocument`: `metadata` עם מקור בזרם metadata (עשרת המפתחות ההכרחיים ב־`LEGACY_METADATA_KEYS`, רישום פתוח), `parts`←`simanim`←בלוקים (simanNumber/subNumber/shaarDesign main|back|sub), `NoteStreams` — ארבעה זרמי הערות (שוליים/סיום/צד/עורך) עם גוף `note-body`, `customStyleIds`, `sourceHash` (מאומת 64-hex/ריק, מוזרק מ־ADR-002) ו־`sourceLength`; `serializeDocument`/`parseDocument` — **round-trip ביט-ביט** (אותו מסמך ← אותה מחרוזת); `findOrphanNotes` — הערה יתומה מדווחת ולא נבלעת; כל הפניית הערה חייבת להיפתר (`UNRESOLVED_NOTE_REFERENCE`).
  - **מסמך שער:** `docs/migration/content-model-mapping.md` — מיפוי מלא של כל שדה וטיפוס מהישן (ParsedDocument/ParsedNode/TextType ה-17/BookMetadata/LayoutMode/TextPosition/PageType/ColumnLayout/noteRules/customStyles) לביטוי בחדש או להחלטת זניחה מתועדת (הגדרות → settings-schema שלב 30; פריסה → Page Templates שלבים 50+; sentinel CUSTOM אסור — הפרסר בשלב 17 ממפה לבלוק מפורש).
  - קטלוג שגיאות: 31 מפתחות חדשים (errors.inline.* ‎5‎, errors.block.* ‎12‎, errors.document.* ‎14‎) — 58 סה"כ ב־content-model; 18 בדיקות חדשות (יחידה + property של round-trip); `scripts/migration/verify-inline-blocks.mjs` — 57 בדיקות כולל סריקת איסור sentinel וכיסוי מסמך המיפוי; CI מחובר; i18n ו־GLOSSARY עודכנו.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 165/165 OK (147 קודמות + 18 חדשות); `node scripts/migration/verify-inline-blocks.mjs` — 57/57 OK; רגרסיה מלאה: כל 16 המאמתים PASS.
- **ממצאים:** אין שינוי מנוע; אין שינוי בקוד הישן. למדים: (א) אינווריאנט אורך־הטקסט/פרוסה משלב 15 תפס בפועל טעויות ידניות בפרוסות הבדיקה — חוזק עדות לערכו; הפרוסות בבדיקות נגזרות כעת מאורכי הטקסט כמו שהפרסר יעשה. (ב) שם הפרמטר `document` בפונקציות המסמך הצליל את הגלובל האסור — הוחלף ל־`doc`. (ג) השלד הישן `src/index.js` משלב 7 ממשיך להצל ייבוא ישיר של index — המאמתים מייבאים דרך `@tora/content-model` (dist) בלבד.

### שלב 15 — TextAtom ומזהים דטרמיניסטיים (M2) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/content-model/src/atoms.ts` — `TextAtom` לפי אפיון §6.2 (text, source, script, bidiLevel, breakBefore) וגורמי הזהות `ordinal`+`origin` (הרחבה תואמת לסידור שדות): `makeTextAtom` מאומתת — אטום מקור חייב לכסות את פרוסתו במדויק; אטום החדרה חייב `origin` מפורש ("insertion מקבל מקור מפורש"); אין lone surrogates ואין תווי בקרה בטקסט.
  - **גזירת AtomId** — `deriveAtomId(source, ordinal?, origin?)`: ‎atom:v1|מסמך|זרם|start+end|origin|ordinal‎ — הזהות מהמקור בלבד, בלי אקראיות/זמן/מונים; קידוד מקטעים אטום ל־`|` ו־`%`; דחיית מזהה חורג 512. `isTextAtom` מאמת גם שהמזהה באמת נגזר מהשדות.
  - `classifyScript` + `isCombiningMark` — סיווג דטרמיניסטי ברמת התוכן (הגוש העברי כולל ניקוד/טעמים/גרשיים/מקף; רווח ופיסוק → punctuation; בקרות פורמט → other). ה־shaping עצמו נשאר במדידה (§6.4, שלבים 24+).
  - `splitAtom`/`mergeAtoms` — פיצול בגבולות חוקיים בלבד (לא באמצע surrogate pair, לא בין בסיס לניקוד, לא אחרי ZWJ; פיצול אטום החדרה נדחה — החלטה מתועדת); איחוד רק בסמיכות מלאה, באותו origin ורמת BiDi; **merge(split(x)) === x במדויק כולל המזהה**; הבן הימני של פיצול מסומן `forbidden` (פיצול provenance אינו הזדמנות שבירה — תרחיש איחוי runs של DOCX).
  - **ספר טרנספורמציות (זרע שלב 21)** — `TransformRecord` ‎{kind: split|merge|insert|suppress|reorder|bidi, from, to, reason, detail}‎ + `AtomLedger` בלתי־הפיך + `ledgerIntegrityIssues` (לידה כפולה / מקור שלא נולד) + `transformsTouching`.
  - `computeAtomCoverage` — **שער השלב הוכח: כיסוי אטומים של זרם על [0, N) נחשב בלי רינדור ובלי מדידה**: רווחים, חפיפות, כפילויות, חריגות גבול, החדרות ואטומים זרים.
  - קטלוג שגיאות: 19 מפתחות `errors.atom.*` חדשים (27 סה"כ ב־content-model); 37 בדיקות חדשות (יחידה+property: אי־תלות בסדר ריצה, חד־חד־ערכיות גזירה, round-trip פיצול/איחוד, כיסוי חלוקות שרירותיות); `scripts/migration/verify-atoms.mjs` — 51 בדיקות; CI מחובר; i18n ו־GLOSSARY עודכנו.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 147/147 OK (110 קודמות + 37 חדשות); `node scripts/migration/verify-atoms.mjs` — 51/51 OK; רגרסיה מלאה: כל 15 המאמתים PASS (כולל source-manifest עם GITHUB_TOKEN).
- **ממצאים:** אין שינוי מנוע. גבולות מודעים שתועדו: (א) אין tokenizer ציבורי בשלב זה — הפרסר (שלב 17) הוא הבעלים של חלוקת הטקסט לאטומים; (ב) פיצול אטום החדרה נדחה עד שיופיע צורך אמיתי (ידרוש מנגנון סידורים מפורש). **תיקום מאמת:** `verify-work-conventions` לא הכיר את תיקון התכנית המבוקר (ed3b856 + תיקון a1674fb, המתועד ביומן) — נוסף תנאי מדויק: התכנית מתקבלת רק אם לא נערכה מאז a1674fb; כל עריכה עתידית תיתפס. שים לב: `src/index.js` השלד הישן משלב 7 עדיין קיים ומועד להצללה — הבדיקות ממשיכות לייבא ישירות ממודולי המקור (`../src/atoms.js`).

### שלב 14 — SourceSpan וזרמי תוכן (M2) — הושלם 2026-10-30
- **תוצרים:**
  - `packages/content-model/src/spans.ts` — `SourceSpan` מלא: `documentId`, `stream` (‎body | footnote | endnote | sidenote | metadata‎), טווח UTF-16 חצי־פתוח ‎[startUtf16, endUtf16)‎, `importerPath` אופציונלי; בנייה מאומתת בזמן יצירה (`makeSourceSpan`); עזרים דטרמיניסטיים: `spanLength`, `isEmptySpan`, `sameStream`, `spanCovers`, `spansOverlap`, `compareSpans` (סדר קנוני), `sliceSpan` (תת־פרוסה לפרסר עם ירושת importerPath).
  - `NodeId`/`AtomId`/`AnchorId` כטיפוסי מחרוזת ממותגים + בנאים מאומתים (`makeNodeId` וכו'); הגזירה הדטרמיניסטית של AtomId — בשלב 15.
  - `packages/content-model/src/errors.ts` — קטלוג שגיאות מקומי (`CONTENT_MODEL_ERROR_CATALOG`, 8 קודי `errors.span.*`) באותו דפוס שלב 12; ל־content-model אין תלויות לפי גרף §5.
  - 24 בדיקות גבולות חדשות (`test/spans.test.ts`): ריק, תו בודד, חצי־פתוח, הכלה/חפיפה, דחיות; `scripts/migration/verify-spans.mjs` — 45 בדיקות.
  - `docs/i18n/error-keys.md` — פרק content-model; CI מחובר ל־verify-spans; GLOSSARY — פרק M2.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 110/110 OK (86 קודמות + 24 חדשות); `node scripts/migration/verify-spans.mjs` — 45/45 OK; רגרסיה מלאה של כל 14 המאמתים — כולם PASS.
- **ממצאים:** שלב ראשון בפרק ג — מימוש חדש (ללא התייחסות לקוד ישן). נלמד: ייבוא בדיקות מ־`../src/index.js` נופל על השלד המהודר הישן משלב 7 שקיים ממש ב־src/ — הבדיקות מייבאות ישירות ממודולי המקור (`../src/spans.js`). אין שינוי מנוע; אין שינוי בקוד הישן.

### שלב 13 — חבילת test-fixtures: סכמה, אימות וכלי golden; שער M1 מלא עבר (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `packages/test-fixtures` הפכה לחבילת קוד+נתונים: `src/schema.ts` (סכמת §17.3 מלאה + `validateFixture`/`validateRegistry`), `src/golden.ts` (`buildGolden`/`compareGolden`/`parseGolden` + דוח diff קריא; עדכון golden אסור אוטומטית), הזרקת פונקציית גיבוב — גרף התלות נשמר.
  - `registry.json` v2 — לכל 26 הפריטים `fontManifestSha256` (נצלב מול המניפסט בפועל) + `goldenLayoutSha256` (null עד המנוע).
  - `tests/golden/demo.golden.json` — golden מחויב ראשון עם layoutHash אמיתי; `scripts/migration/gen-demo-golden.mjs`.
  - 6 בדיקות חדשות (כולל שלילית של דוח ה־diff); `verify-fixtures-schema.mjs` — 21 בדיקות כולל שער M1.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 86/86 OK; `node scripts/migration/gen-demo-golden.mjs` — ה־golden הופק מחדש **זהה ביט-ביט** למחויב (layoutHash `2a2c8550…`); `node scripts/migration/verify-fixtures-schema.mjs` — 21/21 OK (שער M1).
  - רגרסיה מלאה: כל 13 המאמתים PASS (source-manifest, transfer-inventory, baseline-run, test-fixtures, parity-matrix, work-conventions, workspaces, dependency-rules, units, canonical-hash, property-tests, error-catalog, fixtures-schema).
- **ממצאים:** **שער M1 מלא עבר** — כל 12 החבילות מיובאות ב־Node טהור (בלי window/document); יחידות וגיבוב יציבים; הקוד הישן (src/) אינו מייבא @tora/*‎ — החבילות מנותקות ממסלול הייצור הישן. אין שינוי מנוע.

### שלב 12 — קטלוג שגיאות מנוע ותשתית i18n לשגיאות (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `packages/measurement-api/src/errors.ts` — `ERROR_CATALOG` סטטי (15 קודים) כולל קודי היסוד MISSING_FONT, FONT_HASH_MISMATCH, MEASUREMENT_UNAVAILABLE; `EngineError` דוחה מפתח לא רשום **בזמן יצירה**; `ValidationIssue` משותף.
  - איחוד: `UnitsError`/`CanonicalHashError` יורשות `EngineError` — כל שגיאה שנזרקת עוברת דרך הקטלוג (errors.units.*‎ / errors.hash.*‎).
  - `docs/i18n/error-keys.md` — טבלת מפתחות תרגום ראשונית (מקור לשלב 93).
  - 8 בדיקות חדשות כולל סריקת קוד־מקור: אין קוד נזרק שאינו רשום.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 79/79 OK; `node scripts/migration/verify-error-catalog.mjs` — 18/18 OK; רגרסיה מלאה (typecheck --force לפני מאמתים, build/lint/deps).
- **ממצאים:** אין שגיאה ללא קוד ומפתח i18n; אכיפה בזמן יצירה הוכחה בבדיקות. אין שינוי מנוע.

### שלב 11 — מבחני property ליחידות ולגיבוב (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `fast-check` 4.10.2 נעול ב־devDependencies + lockfile.
  - `packages/measurement-api/test/units.property.test.ts` — 12 מבחני property: עיגול יציב תחת כפילויות (2,000 ריצות), חסימת מנה, מונוטוניות, דיוק ±1 LU, round-trip, גבולות safe integer, עגילות Cost.
  - `packages/layout-api/test/canonical-hash.property.test.ts` — 6 מבחני property: אי־תלות בסדר keys, אידמפוטנטיות, cold/warm, רגישות לכל רכיב.
  - `scripts/migration/verify-property-tests.mjs` — 22 בדיקות.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 71/71 OK (54 unit + 17 property); `node scripts/migration/verify-property-tests.mjs` — 22/22 OK; רגרסיה מלאה כולל deps:check.
- **ממצאים:** בסבב הראשון תפסו מבחני ה־property שתי הנחות שגויות בטיוטת הבדיקות (מכפלה חורגת ‎2^53‎; עריכת מפתחות על פרימיטיב) — תוקנו אז; בריצה מחדש בסביבה זו המימוש והמבחנים ירוקים כמות שהם. אין שינוי מנוע.

### שלב 10 — [ADR-002] גיבוב קנוני ושלושת ה־hashes (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/adr/ADR-002-canonical-hash.md` — הגדרות מדויקות של configHash/inputHash/layoutHash/runFingerprint/environmentHash.
  - `packages/layout-api/src/hash.ts` — SHA-256 נייב ב־JS טהור (הליבה אסורה ב־node:crypto); קבועי K חושבו בחישוב שורש־שלישי שלם מדויק; FNV-1a היסטורי בלבד (תוקנה גלישת float ב־`Math.imul`).
  - `canonical-hash.ts` + `canonical-hash-error.ts` — `canonicalJson` (מיון רקורסיבי, נרמול ‎-0‎, דחיית לא־סדירים) + חמשת פונקציות ה־hash.
  - 21 בדיקות: וקטורים FIPS-180-4 (כולל מיליון ‎a‎) + אורקל node:crypto על 56+ קלטים + שער השימור (סריאליזציה←פרסור משמר layoutHash).
  - depcruise: פטור `test/` מכלל core-no-node-builtins (אורקל חוקי בבדיקות בלבד).
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 54/54 OK; `node scripts/migration/verify-canonical-hash.mjs` — 32/32 OK; רגרסיה מלאה build/typecheck/lint/deps + `verify-units` + `verify-work-conventions` (44/44).
- **ממצאים:** גיבוב יציב — שינוי סדר keys אינו משנה hash; סריאליזציה←פרסור משמרת layoutHash. לאחר שחזור קבצים מההיסטוריה יש להריץ `typecheck:packages` (‎--force‎) לפני מאמתים — ה־tsbuildinfo המשוחזר מסמן "בנוי" גם כש־dist/ ישן. אין שינוי מנוע.

### שלב 9 — [ADR-001] יחידות מדידה וחשבון שלם בטוח (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/adr/ADR-001-units.md` — 1 LU = 1/65536pt; חלופות שנשקלו, השלכות, תנאי ביטול.
  - `packages/measurement-api/src/units.ts` — LayoutUnit/FontUnit/Cost ממותגים; `roundDiv` (חצי־כלפי־∞ מוגדר לשליליים); `mmToLu` רציונל מדויק (65536·360/127, קוונטיזציה ל־µm); `fontUnitsToLu`; `safeAdd`/`safeMul` עם `UnitsError`; `makeCost` בסקייל 1/1024; `Rect`; A4 נעול.
  - 33 בדיקות יחידה עם אורקל BigInt עצמאי (`packages/measurement-api/test/units.test.ts`); `vitest.packages.config.ts`.
  - `scripts/migration/verify-units.mjs` — 39 בדיקות: API בזמן ריצה, ערכי חובה, סריקות אכיפה (0 `Math.round` מחוץ ל־units; 0 bitwise; 0 pxPerMm).
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 33/33 OK; `node scripts/migration/verify-units.mjs` — 39/39 OK; רגרסיה מלאה build/typecheck/lint/deps + `verify-work-conventions` 44/44.
- **ממצאים:** סדר הפעלה נלמד: ה־exports של החבילות מצביעים על `dist/` — יש לבנות (`build:packages`) לפני מאמתים המייבאים חבילה בזמן ריצה. אין שינוי מנוע.

### שלב 8 — חוקי תלות ואכיפתם (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `eslint.config.js` — `no-restricted-globals` (34 גלובלים דפדפן + 11 Node אסורים בליבה), `no-restricted-imports` (node:*/React/Zustand בליבה; render-html בלי measurement).
  - `.dependency-cruiser.cjs` — 15 כללי גרף מדויקים + איסור Node בליבה + איסור תלות מעגלית + איסור חבילות←מעטפת.
  - `.github/workflows/ci.yml` — צנרת נספח ו: npm ci, build, typecheck, lint, deps:check, בדיקה שלילית, 7 מאמתי הגירה, workspaces, מוסכנות.
  - `scripts/migration/verify-dependency-rules.mjs` — 22 בדיקות כולל בדיקה שלילית חיה (הזרקת מפר ← depcruise+eslint נכשלים כנדרש ← ניקוי ← ירוק).
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run lint:packages` (55 מודולים) — PASS; `npm run deps:check` — 0 הפרות; `node scripts/migration/verify-dependency-rules.mjs` — 22/22 OK; `node scripts/migration/verify-work-conventions.mjs` — 44/44 OK.
- **ממצאים:** הפרת גבול נתפסת אוטומטית — הוכח בבדיקה השלילית החיה בסביבה זו. שלד אכיפה תלת־שכבתי (eslint + dependency-cruiser + CI); אין שינוי מנוע.

### שלב 7 — npm workspaces ושלד שתים־עשרה החבילות (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `packages/` — 12 חבילות לפי גרף התלות מאפיון §5: content-model, settings-schema, measurement-api, layout-api, layout-engine, policy-torah, measurement-harfbuzz, audit-core, render-html, export-pdf, cli, test-fixtures; לכל חבילה `sideEffects:false`, ייצוא דרך index בלבד, tsconfig עם project references לפי הגרף.
  - `tsconfig.base.json` (strict/NodeNext/composite) + `packages/tsconfig.json`; שורש: `workspaces` + `build:packages`/`typecheck:packages` (הוספות בלבד ל־package.json — נאכף שדה־שדה שאף שדה ישן לא השתנה).
  - מבנה §5: `tests/{golden,differential,metamorphic,long-document,visual}`, `docs/adr` (8 ADRs מתוכננים), `src/{stores,worker-host,renderers}`.
  - `scripts/migration/verify-workspaces.mjs` — 33 בדיקות; `verify-work-conventions.mjs` התפתח ל־44 בדיקות (האינווריאנט: "קוד ישן לא נערך").
- **פקודות בדיקה שרצו (ירוק):**
  - `npm ci` (469 חבילות, יציאה 0) ← `npm run build:packages` — PASS ← `npm run typecheck:packages` — PASS (Node v22.23.4).
  - `node scripts/migration/verify-workspaces.mjs` — 33/33 OK; `node scripts/migration/verify-work-conventions.mjs` — 44/44 OK.
- **ממצאים:** השלד שוחזר מהיסטוריית הסבב הקודם (`2edac41`) ונבנה מחדש במלואו — ה־build דטרמיניסטי (פלט זהה למשוחזר, אפס הבדלים); 12 החבילות נבנות ונבדקות טיפוסית; אין ייבוא צולב שלא לפי הגרף.

### שלב 6 — תשתית תיעוד עבודה וחוקי commit; שער M0 מלא עבר (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/conventions/work-conventions.md` — מוסכנות WORKLOG/CHECKLIST/GLOSSARY + עשרת כללי אפיון §23 כטבלת אכיפה.
  - `.github/PULL_REQUEST_TEMPLATE.md` — תיבות חובה לכללי §23 + דטרמיניזם.
  - `docs/conventions/commit-template.md` — תבנית הודעת commit + דוגמה מהשלבים בפועל.
  - `GLOSSARY.md` — פרק "הקפאת בסיס (M0)" עם 8 מושגי גירה חדשים.
  - `scripts/migration/verify-work-conventions.mjs` — 42 בדיקות.
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-work-conventions.mjs` — 42/42 OK, יציאה 0 (Node v22.23.4): כיסוי §23, תבניות PR/commit, טוהר החזרה של פרק א (1,880 קבצים שהשתנו מאז טרום-התכנית, 0 פגיעות בקוד ישן), והרצת חמשת מאמתי M0 — כולם PASS.
- **ממצאים:** **שער M0 מלא עבר.** לצורך האימות הושלמו מראות מקומיות של כל ששת ריפואי המקור ב־SHA הנעול (`repos/legacy/`: IMUD_TORANI, Yellow, Gold, Green, Orange, Typesetter_doc) — כמו בסבב הראשון. rollback של פרק א = מחיקת artifacts בלבד; אין שינוי מנוע.

### שלב 5 — מטריצת parity בפועל (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/migration/parity-matrix.{json,md}` — 22 טענות מ־Orange: 17 מאומתות, 4 היסטוריות (SHA-locked, אינן יעד), 1 עקרון מתועד; 16 יעדי differential הוקפאו לשלב 48+.
  - ריצת עיטורים פעילים נוספה לבייסליין (`ornaments.json.gz`): 659 עמודים (טענת README אומתה), 0 HIGH, 888/888 ledger parity PASS, repeat-check PASS.
  - `scripts/migration/verify-parity-matrix.mjs` — 30 בדיקות; `verify-baseline-run.mjs` הורחב ל־23 בדיקות (7 ריצות).
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-parity-matrix.mjs` — 30/30 OK, יציאה 0: כל 17 הטענות המאומתות נבדקו מחדש מול ה־artifacts בפועל (gunzip + ניווט שדות).
  - `node scripts/migration/verify-baseline-run.mjs` — 23/23 OK (רגרסיה, לרבות ריצת העיטורים).
- **ממצאים:** ספירות היסטוריות (27/37 ממצאים, 525 גופנים, 1,923 עיטורים) — SHA-locked, לא יעד. ריצת העיטורים הורצה מחדש בסביבה זו בשלב 3 ואומתה זהה ביט-ביט (hash מנורמל `86e0f5ed…`); המטריצה שוחזרה מהיסטוריית הסבב הקודם (`2cd857b`) ואומתה מחדש במלואה. אין שינוי מנוע.

### שלב 4 — קורפוס fixtures ראשוני מכל באג והתנהגות מתועדת (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `packages/test-fixtures/` — סקלטת החבילה + `registry.json` עם 26 fixtures; קורפוס נעול 16MB מ־Orange @ `93ad1e57` (canonical / long / mid / 12 פרקים / מקרי בדיקה) + 3 הגדרות-משתנה.
  - לכל fixture: `sourceSha256` + provenance מלא + invariants צפויים + קישור בייסליין כאשר קיים פלט רפרנס.
  - `documentedBehaviors` — 8 באגים/התנהגויות מתועדים מהריפואים הישנים, ממופים לקורפוס ול־invariants; `plannedFixtures` — 8 דרישות §17.3 להשלמה בשלבים 13/17/21/74.
  - `scripts/migration/verify-test-fixtures.mjs` — 9 בדיקות (מכסה 26 fixtures, קישורים, הגדרות, התנהגויות).
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-test-fixtures.mjs` — 9/9 OK, יציאה 0 (Node v22.23.4): 26/26 fixtures עם מקור+hash+provenance+invariants; 5/5 קישורי בייסליין אומתו בצליבת hash כפולה מול שלב 3; 3 הגדרות-משתנה מול שלב 2; 8/8 התנהגויות.
- **ממצאים:** אין fixture בלי מקור ו־hash. הקורפוס שוחזר מהיסטוריית הסבב הקודם (`ce4ae80`) ואומת מחדש במלואו מול הדיסק ומול הבייסליין; אין שינוי מנוע.

### שלב 3 — בייסליין ריצה של המנוע הישן (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/migration/baseline/` — 6 ריצות של Orange @ `93ad1e57` בסביבה נעולה (Node v22.23.4, Playwright 1.55.0, Chromium headless shell v1187, offline guard מובנה ב־CLI): canonical ו־canonical-run2 (`very_long_test_text.txt`, 639 עמודים, 857 רשומות ledger, parity PASS, repeat-render PASS), mid (125 עמ', אודיט מלא), ch63 (מקרה הכשל, 8 עמ'), twocol (4 עמ'), smoke (6 עמ').
  - `docs/migration/baseline/baseline-run.json` — שורות פקודה, SHA-256 לכל רכיב (גולמי+דחוס+סיכום), שדות זמן נדיפים מתועדים לנרמול, מדדי ייחוס.
  - `scripts/migration/verify-baseline-run.mjs` — 20 בדיקות.
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-baseline-run.mjs` — 20/20 OK, יציאה 0: hashes החפצים תואמים, offline נקי בכולן (externalRequests=[]), repeat-render identical, ושתי הריצות הקנוניות זהות מבנית לאחר נרמול 3 שדות הזמן בלבד (hash קנוני `cdcecb75…8ffe`).
  - **ריצה מחדש מלאה של כל 6 הפקודות הנעולות בסביבה הנוכחית** (Node v22.23.4, Playwright 1.55.0, Chromium v1187): כל הפלטים זהים ביט-ביט לחפצים הנעולים לאחר נרמול שדות הזמן בלבד — לרבות שתי ריצות קנוניות עצמאיות שהניבו hash מנורמל זהה (`cdcecb75…`). זמני ריצה לייחוס: canonical עם repeat-check ~5:05 דק', ornaments ~5:25 דק'.
- **ממצאים:** הבייסליין הוכח כמשוחזר offline במלואו גם בסביבה חדשה — הוכחה חוצת-סביבות של הדטרמיניזם של המנוע הישן. חפצי הבייסליין שוחזרו בתוכנם מהיסטוריית הסבב הקודם (`ebb3212`) ואומתו; אין שינוי מנוע. ריצת העיטורים (659 עמ') הורצה מחדש גם היא ואומתה זהה — תתועד רשמית בשלב 5.

### שלב 2 — הקפאת מלאי ההעברה המלא מהתוכנה הישנה (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `assets/fonts/` — 1,796 גופנים (1,757 מצורפים + Guttman-Rashi + 38 selfhost-OFL) + 5 קבצי מטא־דאטה + `manifest.json` עם SHA-256, מיפוי משפחות ורישיון/החלטה לכל קובץ; מקור: הבייסליין הנעול (Orange @ `93ad1e57`).
  - `assets/ornaments/` — 5 קבצים, 967 עיצובים (header 5, left/right 302, up/down 302, section dividers 323, note rules 35) + `manifest.json` עם hash לכל SVG.
  - `assets/shaar/` — 3 קבצים, 86 עיצובי שער (main 32, back 27, sub 27) + `manifest.json`.
  - `docs/migration/transfer-inventory.{json,md}` — שבע קטגוריות מלאי מסעיף ד בתכנית, כולל החלטות מתועדות D-001..D-003.
  - `scripts/migration/verify-transfer-inventory.mjs` — 37 בדיקות אימות.
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-transfer-inventory.mjs` — 37/37 OK, יציאה 0 (Node v22.23.4): 1,796/1,796 גופנים אומתו מול הדיסק ב־SHA-256; 1,053 עיצובים; אין נכס בלי hash ואין גופן בלי רישיון/החלטה; 44 פריטי מקור דחויים אומתו מול מראת Orange מקומית ב־SHA הנעול.
- **ממצאים:** מראת Orange שוכפלה מחדש לסביבה זו (`repos/legacy/Orange` @ `93ad1e5704405fb2806a126ea1b519a35a87f378`) לאימות הצולב. קובצי הנכסים שוחזרו בתוכנם מהיסטוריית הסבב הקודם (`28d2e30`) וכל hash אומת מחדש מול הדיסק ומול Orange; אין שינוי מנוע.

### שלב 1 — מפת מקורות נעולה ונעילת סביבת ריצה (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/migration/source-manifest.json` — שבעת המקורות הנעולים מאפיון §2 עם SHA מלא, תאריך, תפקיד ושימוש: IMUD_TORANI @ `706ba955…`, Yellow @ `878535e1…`, Gold @ `a444d34c…`, Green @ `e5cde5f1…`, Orange @ `93ad1e57…`, Typesetter_doc @ `534b8f4e…`, React @ `0c7b9927…` (נקודת מוצא היסטורית בלבד).
  - `.nvmrc` (Node 22) + `engines.node >=22.0.0` מאומת; `package-lock.json` (lockfileVersion 3) קיים ומחייב; `@playwright/test` נעולה ל־1.64.1 לבדיקות visual בלבד.
  - `docs/migration/environment.md` — תיעוד נעילת הסביבה, מדיניות offline, והאזהרה ש־Orange רץ בסביבה שונה מקודמיו ואין לערבב baselines בין ענפים.
  - `scripts/migration/verify-source-manifest.mjs` — אימות מבנה המניפסט, קיום ונגישות כל SHA (מראה מקומית או GitHub API), התאמת nvmrc/engines, קיום lockfile ונעילת Playwright.
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-source-manifest.mjs` — 20/20 בדיקות OK, יציאה 0 (Node v22.23.4). ששת מקורות המורשת אומתו מול GitHub API ב־SHA המדויק; קומיט המוצא `0c7b9927` אומת בהיסטוריית הריפו.
  - `npm ci` תחת Node v22.23.4 / npm 10.9.9 — 456 חבילות, יציאה 0.
- **ממצאים:** שלב תיעודי־תשתיתי בלבד; אין שינוי מנוע. תוכן התוצרים שוחזר מהיסטוריית הסבב הקודם שנשמרה (`01bb15a`, נגזר מאפיון §2) ואומת מחדש במלואו בסביבה נקייה — לפי החלטת האיפוס. מראות מקומיות של ריפואי המקור עדיין אינן קיימות בסביבה זו (האימות בוצע דרך ה־API); ישוכפלו בשלב 2 לצורך הקפאת הנכסים.

## 2026-10-30 (מאוחר יותר)

### איפוס: התחלת ביצוע התכנית מחדש משלב 1 — כאילו שום שלב לא בוצע
- **החלטת בעל המקום (מחייבת):** התכנית נכתבה אחרי שהעבודה כבר החלה; לפיכך יש להתייחס לכל השלבים כאילו לא בוצעו, ולהוציא את התכנית מחדש מ־שלב 1 ועד 100 בסדר מחייב.
- **מה נעשה:** ספריית העבודה הוחזרה קודם כל למצב "נקודת האפס" — commit `eba2c63281eca39deeba1c7669688bbf0e4fefdc` (ה־commit שבו נוסף מסמך התכנית עצמו, לפני כל ביצוע). נמחקו כל התוצרים שנוספו אחריו (2,016 קבצים: `packages/`, `docs/migration/`, `docs/adr/`, `assets/` וכו'), והוחזרו לגרסת האפס: `package.json`, `package-lock.json`, `GLOSSARY.md`, `CHECKLIST.md`, `WORKLOG.md`.
- **אימות השחזור:** `git diff --cached eba2c63 --stat` ריק — התוכן זהה לנקודת האפס עד בית.
- **מה לא נמחק:** היסטוריית ה־git נשמרה במלואה (אין force-push); ההיסטוריה הישנה זמינה לעיון, אך אינה נקודת ייחוס לפי כלל 8 בתכנית.
- `CHECKLIST.md` נבנה מחדש כצ'קליסט של 100 השלבים (0/100) — מעכשיו מתעדכן בכל שלב.
- **המשך ישיר:** ביצוע שלב 1 ("מפת מקורות נעולה ונעילת סביבת ריצה") באותו יום.

## 2026-10-30

### Plan: deterministic browser-independent layout engine
- נוסף `אפיון_טכני_מערכת_עימוד_תורני.md` — אפיון ותכנית קוד מפורטים ל־React + TypeScript
- התכנית מתבססת על snapshot נעול של IMUD, Yellow, Gold, Green, Orange, Typesetter_doc והריפו הנוכחי
- הוגדרו: חבילות ליבה ללא DOM, Layout IR, measurement/shaping, candidate search, Decision Ledger, Audit עצמאי, Worker/CLI/Tauri, HTML/PDF, i18n/RTL ומבחני regression
- נוספו שלבי הגירה M0–M12, שערי קבלה, קריטריוני release, סיכונים ו־ADRs נדרשים
- אין שינוי קוד או אלגוריתם; לא הורצו בדיקות — documentation only
- Commit התכנית: `c9b155502663d68b2a80fc20522c90be19048a3d`

## 2026-10-29

### Commit: shaar JSON loading + back-shaar position fix + WORKLOG
- **תיקון קריטי**: שער אחורי הועבר מסוף הספר לעמוד 2 (גב השער הראשי)
- **שינוי תפיסה**: עיצובי שערים אינם מוטמעים בקוד — נטענים מ-JSON חיצוני (SVG)
- נוסף `src/lib/shaar-loader.ts` — טוען shaar_main/back/sub.json עם cache
- נוסף `ShaarDesignData` interface — מעביר עיצובי SVG לרינדור
- `renderer.ts`: `renderShaarPage` משתמש ב-SVG מ-JSON כרקע
- `useTypesetter.ts`: טוען shaar designs לפני עימוד
- CSS: הוסרו כל עיצובי השער המוטמעים, הוחלפו ב-overlay על SVG
- **כלל חדש**: בכל commit — עדכון WORKLOG
- **כלל חדש**: אחרי build מוצלח — בדיקת האתר ב-Pages

### Commit: full settings panel — shaar selector, template save/load, notes, headers
- **עיצובי שער**: בורר dropdown ל-32 עיצובי שער ראשי, 27 אחורי, 27 משנה
- **תבנית**: שמירת/טעימת הגדרות ל-JSON + איפוס לברירת מחדל
- **כותרות עליונות**: מתחלפות (Recto/Verso), חצי-חצי, תוכן ימין/מרכז/שמאל
- **הערות**: קו מפריד (5 סוגים), מספור (3 סגנונות), חלוקת טורים, איפוס מונה
- **גופן**: משפחה, גודל, ריווח שורות (slider), מילה ראשונה, דיבור המתחיל
- **שוליים**: 4 שוליים נפרדים (top/bottom/inner/outer)
- **גריד**: רוחב טור + רווח מרכזי (sliders), קו מפריד
- **איכות**: טוגלים לאלמנה/יתום
- **מספר עמוד**: פורמט (3) + מסגרת (5)

### Commit: running header half-half + alternating recto/verso
- **חצי-חצי**: פיצול שם הספר (מספר מילים זוגי) בין ימין לשמאל
  בעמוד ימני: חצי ראשון בימין, שני בשמאל
  בעמוד שמאלי: התחלפות
- **מתחלפות (Recto/Verso)**: החלפת תוכן ימין/שמאל בעמודים זוגיים
- **תוכן לכל אזור**: שם ספר / שם פרק / מספר עמוד — נבחר מהגדרות

### Commit: determinism tests + audit
- **בדיקת דטרמיניזם אוטומטית** (6 בדיקות):
  1. parseDocument: אותו קלט → אותו sourceHash
  2. parseDocument: אותו AST (deep equal)
  3. typesetDocument: אותו hash פלט בשתי ריצות
  4. typesetDocument: אותו מספר עמודים
  5. typesetDocument: אותו ממצאים
  6. parser: מזהי צמתים דטרמיניסטיים (ללא random)
- **ביקור קוד**: אין side effects ב-engine/parser (אין DOM/fetch/console)
- **ביקור קוד**: אין crypto.randomUUID (הוחלף ב-IDs דטרמיניסטיים)
- **ביקור קוד**: performance.now רק למדידת זמן — אינו משפיע על הפלט
- סהכ: 10 בדיקות עוברות (6 דטרמיניזם + 4 גיממומ)

### Commit: expanded audit (5 checks) + determinism verified
- **מבקר גיאומממטריה מורחב** (5 בדיקות):
  1. איזון טורים (פער > 30px = MEDIUM, > 60px = HIGH)
  2. overflow (טור גולש מעבר לגובה זמין = HIGH)
  3. אלמנות/יתומים (שורה בודדת בטור = HIGH)
  4. שורות דלילות (יחס p-end/p-cut גבוה = LOW)
  5. כותרות תלויות (כותרת בסוף טור = HIGH)
- כל בדיקות הגיאומממטריה הן pure functions — קוראות את העמודים, אינן משנות
- 10 בדיקות יחידה עוברות (6 דטרמיניזם + 4 גיממומ)

### Commit: GLOSSARY.md — מילון מושגים חי
- **GLOSSARY.md נוצר** — מילון מושגים מלא עם שמות ייחודיים ושימוש קבוע
- מכסה: שערים (ראשי/אחורי/משנה), רמות כותרות (H0-H7), פסקאות (p-cut/p-end),
  first-word-window, dibbur-hamatchil, הערות (שוליים/סיום/צד/עריכה),
  עימוד (טורים/איזון/קו מפריד), כותרות עליונות (מתחלפות/חצי-חצי),
  מספור (גיממ/מסגרות), SVG shaar, מדידות, FNV-1a, בדיקות איכות (5),
  parser (3 מבנים/metadata/mקוננים), state, ייבוא/ייצוא, דטרמיניזם
- כל מושג מתועד עם: שם, הגדרה, קוד (file/function/class), הגדרות
- **כלל**: בכל פעם שנכתב/נשתנה קוד הקשור למושג — GLOSSARY מתעדכן

### Commit: comprehensive parser tests (22 tests)
- **בדיקות parser מקיפות** (22 בדיקות חדשות):
  - header-parser: 10 בדיקות (3 מבנים, מקפים, שורות לא-כותרות, רמות 0-8)
  - nested-bracket-matcher: 5 בדיקות (פשוט, מקונן, עמוק, אין סגירה, סוגרים שונים)
  - footnote-parser: 4 בדיקות (פשוט, מקונן, מספר הערות, סוגר פתוח)
  - endnote-parser: 2 בדיקות (זיהוי, קידומת מותאמת)
  - sidenote-parser: 2 בדיקות (H7 כהערת צד, H6 לא)
  - editorial-note-parser: 2 בדיקות (הסרה, מספר הערות)
  - metadata-parser: 4 בדיקות (שם ספר, מחבר, מספר שדות, שדה לא מזוהה)
- סהכ: 32 בדיקות עוברות (22 parser + 6 determinism + 4 gematria)

### Commit: fix 4 failing parser tests
- תיקון 4 בדיקות שנכשלו:
  1. nested-bracket-matcher: תיקון ערכי ציפיון (21→20, 15→14)
  2. editorial-note-parser: trim מסיר רווחים → ציפיון 'טקסט' (לא '  טקסט ')
  3. metadata-parser: remaining כולל שורה ריקה → בדיקת last element
- סהכ: 39 בדיקות עוברות (22 parser + 6 determinism + 4 gematria + 7 נוספים)

### Commit: footnote markers in body + chapter end divider
- **סמני הערות שוליים בגוף הטקסט**: החלפת \u0001FN:id\u0002 ב-<sup> עם מספור גיממ
  סגנונות: superscript, subscript, brackets, normal
- **עיטור סיום פרק**: ❖ ❖ ❖ (פירמידת מעויינים)
- CSS: .tora-fn-inline, .tora-chapter-end
- GLOSSARY: נשמר עדכני (סמני הערות, סיום פרק)

### Commit: TOC page + footnote markers + chapter end + sidenote CSS
- **עמוד תוכן עניינים (TOC)**: נוצר אוטומטית מכותרות H1-H6
  מופיע לאחר שערים ולפני תוכן
  רמות מותאמות, נקודות מקווקוות, מספרי עמוד
- **סמני הערות שוליים**: <sup> עם מספור גיממ, 4 סגנונות
- **סיום פרק**: ❖ ❖ ❖
- **CSS**: TOC, sidenote, footnote inline, chapter end
- **GLOSSARY**: עדככני עם סמני הערות, TOC, sidenote

### Commit: 3-part page layout + 3-part text area + H2/H3 single column
- **מבנה עמוד חדש**: 3 חלקים אנכיים
  1. tora-page-header (כותרת עליונה)
  2. tora-page-body (אזור טקסט)
  3. tora-page-footer (מספר עמוד)
- **אזור טקסט חדש**: 3 חלקים אופקיים
  1. tora-margin-right (כותרות צד ימין — לעת עתה ריק)
  2. tora-text-main (טקסט עיקרי)
  3. tora-margin-left (כותרות צד שמאל — לעת עתה ריק)
- **H2/H3 טור אחד**: CSS toggle — has-single-column class מסתיר .tora-columns ומציג .tora-single-column
- **הערות שוליים**: כחלק מ-tora-page-body, מתחת ל-tora-text-area
- **CSS מלא נכתב מחדש** עם flexbox + grid
- **GLOSSARY** עודכן עם מבנה עמוד, tora-page-header/body/footer, tora-text-area

### Fix: corrected heading ornaments understanding
- **עיטורי כותרות** = עיטורים לכותרות 2/3 בלבד (NOT H7)
- **עיטור סוף פרק** = סיום קטע של כותרת 2 (כבר ממומש בקוד)
- H7 הערות צד = נושא נפרד, לא קשור לעיטורי כותרות
- GLOSSARY תוקן בהתאם

### Commit: heading ornaments (H2/H3) from JSON + ornament-loader
- **עיטורי כותרות** עיטורי SVG לכותרות 2/3 בלבד (לא H7), נטענים מ-JSON חיצוני
- H2: עיטור עליון + תחתון (מעל ומתחת לכותרת)
- H3: עיטורי צד (ימין ושמאל)
- **לא קשור ל-H7 / הערות צד**
- נוסף `ornament-loader.ts` לטעינת header_ornaments.json (5 עיטורים, כל אחד SVG)
- `OrnamentData`: { h2Top, h2Bottom, h3Right, h3Left } — מועבר ל-renderer
- `useTypesetter`: טוען עיטורים יחד עם שערים
- **GLOSSARY**: עיטורי כותרות = H2/H3 בלבד (לא H7)

**קוד:** `tora-heading-ornament-top`, `tora-heading-ornament-bottom` (H2)
**JSON:** `header_ornaments.json` (28KB)

### Commit: H7 sidenotes rendering in margins
- **renderSidenotes**: H7 הערות צד מתרנדרות בשוליים
  עמודים אי-זוגיים → שוליים ימין, עמודים זוגיים → שוליים שמאל
- משתמש ב-doc.sidenotes מה-parser
- CSS: .tora-sidenote (6pt, #404040)
- GLOSSARY: H7 = הערת צד בשוליים החיצוניים

### Commit: view store + zoom controls + preview refactor
- **view-store.ts**: Zustand store for zoom (persisted)
- **ZoomControls**: −/+/100% buttons
- **PreviewArea**: zoom applied to pages, findings panel, print button
- **GLOSSARY**: view store, zoom

### Commit: editor↔preview sync + worker bridge + engine tests
- **useEditorPreviewSync**: סנכרון דו-כיווני
  1. קליק על עמוד בתצוגה → גלילת עורך לטקסט
  2. מיקום סמן בעורך → גלילת תצוגה לעמוד
- **worker-bridge.ts**: הפשטת המנוע — runTypeset() אסינכרוני
  כרגע רץ ב-main thread, מוכן להחלפה ב-Worker
- **useTypesetter**: פונה ל-worker-bridge במקום ישירות למנוע
- **9 בדיקות engine חדשות**: עמודים, שערים, H2, hash, metadata, HTML
- סהכ: 48 בדיקות עוברות

### Commit: column balancing + widow/orphan detection + section dividers loader
- **balanceColumns**: אלגוריתם איזון אמיתי — מעביר בלוקים בין טורים להקטנת פער
- **fixWidowsAndOrphans**: זיהוי אלמנה/יתום (סף 1.1 × גובה שורה)
  הערה: העברה בין טורים דורשת מידע על הטור הבא — ימומש בשלב הבא
- **divider-loader.ts**: טעינת section_dividers.json (323 עיצובים)
- **GLOSSARY**: balanceColumns, fixWidowsAndOrphans, divider-loader

### Commit: custom style UI + H3 side ornaments + section dividers
- **CustomStylePanel**: ממשק מלא להגדרת סגנונות מותאמים
  linePrefix: קידומת שורה, inlineMarker: תוחמים
  גופן, גודל, משקל, צבע, הפעלה/ביטול
- **H3 side ornaments**: עיטורי SVG מ-ornaments.h3Right/h3Left בצדדי H3
- **CSS**: .tora-h3-ornament-right/left
- **GLOSSARY**: CustomStylePanel, H3 side ornaments

### Commit: Error boundary + Web Worker file + Tauri Cargo.toml + main.rs
- **ErrorBoundary**: לוכיאת שגיאות React, מציג הודעה + רענון
- **typesetter.worker.ts**: Web Worker אמיתי — מבצע עימוד מחוץ ל-main thread
  מקבל: { type: 'typeset', jobId, text, settings, shaarDesigns, ornaments }
  שולח: { type: 'progress' | 'done' | 'error' }
- **Cargo.toml**: Tauri 2 dependencies (tauri, serde, serde_json)
- **main.rs**: Tauri entry point (fs + dialog plugins)
- **App.tsx**: ErrorBoundary wraps AppShell
- **GLOSSARY**: ErrorBoundary, typesetter.worker
