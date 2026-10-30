# Worklog — Tora Book Typesetter React

## תכנית 100 השלבים — יומן ביצוע (מ־2026-10-30)

> מכאן ואילך מבוצעת `תכנית_עבודה_מפורטת_לסוכן_AI_100_שלבים.md` שלב אחר שלב, כאילו שום שלב לא בוצע קודם לכן (כלל 8: הקוד הקודם בריפו אינו נקודת ייחוס). מבנה רשומה: שלב ← תוצרים ← פקודות בדיקה שרצו ← ממצאים.

### שלב 6 — תשתית תיעוד עבודה וחוקי commit (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/conventions/work-conventions.md` — מוסכנות מחייבות: מבנה רשומת WORKLOG (שלב, פקודות בדיקה, artifacts, layoutHash diff משלב 33), כללי CHECKLIST (עדכון לפי יכולת מאומתת בלבד), כללי GLOSSARY (מילון חי), ועשרת כללי §23 באפיון כטבלת אכיפה.
  - `.github/PULL_REQUEST_TEMPLATE.md` — תבנית PR עם תיבות חובה לכל כללי §23 (fixture קודם לפורט, הפרדת refactor/מדיניות, layoutHash, אי-החלשת בדיקות ועוד) + סעיפי דטרמיניזם מעשרת חוקי העבודה.
  - `docs/conventions/commit-template.md` — תבנית הודעת commit (פורמט + דוגמה מהשלבים בפועל).
  - `GLOSSARY.md` — נוסף פרק "הקפאת בסיס (M0)": בייסליין נעול, המסמך הקנוני, מלאי ההעברה, fixture, מטריצת parity, יעד differential, שדות זמן-ריצה, מראה מקומית.
  - `scripts/migration/verify-work-conventions.mjs` — 42 בדיקות: כיסוי §23.1–§23.10, סעיפי תבנית ה־PR, תבנית commit, טוהר החזרה של פרק א, והרצת חמשת מאמתי M0.
- **פקודות בדיקה שרצו (ירוק):** `node scripts/migration/verify-work-conventions.mjs` — 42/42 OK, יציאה 0.
- **ממצאים:**
  - **שער M0 מלא עבר:** הבייסליין ניתן לשחזור offline (verify-baseline-run PASS); אין fixture בלי מקור ו־hash (verify-test-fixtures PASS); rollback של פרק א = מחיקת artifacts בלבד — נבדק מול היסטוריית ה־git: 1,880 קבצים השתנו מאז טרום-התכנית, **אפס פגיעות** בקוד מנוע/יישום ישן (src/, src-tauri/, package.json וכו').
  - תוקן ציטוט נתיבים לא-ASCII ב־git (core.quotepath) — שני גופנים בעלי שמות עבריים נספרו בטעות כחריגה.

### שלב 7 — npm workspaces ושלד שתים־עשרה החבילות (M1) — הושלם 2026-10-30
- **תוצרים:**
  - **12 חבילות עבודה** תחת `packages/` לפי גרף התלות המחייב מאפיון §5: content-model, settings-schema, measurement-api, layout-api, layout-engine, policy-torah, measurement-harfbuzz, audit-core, render-html, export-pdf, cli, test-fixtures. לכל חבילה: `package.json` עם `sideEffects:false`, `exports` דרך index בלבד, ו־`src/index.ts` ציבורי (test-fixtures — חבילת נתונים שחושפת את registry.json).
  - `tsconfig.base.json` (strict, NodeNext, composite) + `packages/tsconfig.json` (קובץ פתרון) + TS project references לפי הגרף.
  - שורש `package.json`: הוספת `workspaces: ["packages/*"]` + `build:packages` / `typecheck:packages` / `verify:workspaces` — **הוספות בלבד, כל השדות והסקריפטים הישנים זהים** (נאכף שדה-שדה).
  - מבנה §5: `tests/{golden,differential,metamorphic,long-document,visual}/`, `docs/adr/` (טבלת 8 ה־ADRs המתוכננים), `src/{stores,worker-host,renderers}/` (תצוגה מקדימה למעטפת הריאקט העתידית; הקוד הישן ב־src/ לא נגע).
  - `scripts/migration/verify-workspaces.mjs` — 33 בדיקות.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run build:packages` — PASS (tsc -b, יציאה 0); `npm run typecheck:packages` — PASS; יבוא זמן-ריצה של `@tora/content-model` אומת ב־Node.
  - `node scripts/migration/verify-workspaces.mjs` — 33/33 OK: 12/12 חבילות, גרף תלויות מדויק (dependencies + references), 0 יבואים חורגים, dist מחוץ ל־git.
  - `node scripts/migration/verify-work-conventions.mjs` — ירוק (האינווריאנט התפתח: קוד ישן לא נערך; package.json הוספות בלבד).
- **ממצאים:** `workspace:*` אינו נתמך ב־npm — נעשה שימוש בגרסה מדויקת `0.1.0` לקישור חבילות העבודה. חבילות נתונים (test-fixtures) הן תלות npm בלבד ללא הפניית בנייה; ייבוא צולב ייאכף אוטומטית בשלב 8 (ESLint + dependency-cruiser).

### שלב 8 — חוקי תלות ואכיפתם (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `eslint.config.js` — אכיפת איסור DOM/Node בחבילות הליבה: `no-restricted-globals` (34 גלובלים של דפדפן בכל החבילות + 11 גלובלים של Node בליבה), `no-restricted-imports` (מודולי Node וספריות React/Zustand אסורים בליבה; render-html אינו מייבא measurement — אין מדידה מחדש).
  - `.dependency-cruiser.cjs` — 15 כללי גרף (חבילה ← תלויותיה בלבד, בדיוק), איסור מודולי ליבה של Node ב־10 חבילות הליבה, איסור תלות חבילות→מעטפת, איסור תלות מעגלית. layout-engine ↛ policy-torah ו־audit-core ↛ layout-engine נאכפים ישירות מהגרף.
  - `.github/workflows/ci.yml` — צנרת CI לפי נספח ו (בשלבו הנוכחי): npm ci ← build ← typecheck ← lint ← deps:check ← בדיקה שלילית ← שבעת מאמתי ההגירה ← workspaces + מוסכנות. נעול ל־Node מתוך ‎.nvmrc, היסטוריה מלאה לבדיקת 'הקוד הישן לא נערך'.
  - `scripts/migration/verify-dependency-rules.mjs` — 22 בדיקות כולל **בדיקה שלילית חיה**.
  - סקריפטים חדשים: `lint:packages`, `deps:check`, `verify:deps` (הוספות בלבד ל־package.json; התלות החדשה dependency-cruiser נוספה ל־devDependencies ללא שינוי רשומות ישנות — נאכף).
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run lint:packages` — PASS (55 מודולים); `npm run deps:check` — PASS (0 הפרות).
  - `node scripts/migration/verify-dependency-rules.mjs` — 22/22 OK, יציאה 0. **הבדיקה השלילית הוכיחה:** הזרקת קובץ מפר ב־layout-engine (יבוא policy-torah + node:fs + document) → depcruise נכשל עם הפרות graph-layout-engine/core-no-node-builtins, eslint נכשל על הגלובל האסור; לאחר מחיקה — שוב ירוק.
  - רגרסיה: `verify-work-conventions` — 44/44 OK (רשימת הנתיבים המאושרים הורחבה לקבצי התצורה החדשים).
- **ממצאים:** הפרת גבול נתפסת אוטומטית בשלוש שכבות (גרף ב־depcruise, גלובלים ויבואים ב־ESLint, וכל אלה ב־CI). אין עדכון golden אוטומטי ב־CI.

### שלב 9 — [ADR-001] יחידות מדידה וחשבון שלם בטוח (M1) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/adr/ADR-001-units.md` — החלטה נעולה: 1 LU = 1/65536 pt; חלופות שנשקלו (CSS px, µm שלמים, 1/1000pt, bignum, away-from-zero); השלכות ותנאי ביטול.
  - `packages/measurement-api/src/units.ts` — מודול היחידות: טיפוסים ממותגים `LayoutUnit`/`FontUnit`/`Cost`; `roundDiv` (עיגול חצי-כלפי-∞ מוגדר לשליליים, בחישוב שארית שלם); `mmToLu` (רציונל מדויק 65536·360/127, קוונטיזציה למיקרומטר); `ptToLu` (רזולוציית 1/16pt); `fontUnitsToLu`; `safeAdd/safeSub/safeMul` עם `UnitsError`; `makeCost` בסקייל 1/1024; `Rect` (x,y,width,height בלבד) + עזרי קצוות; `A4` נעול בטעינה.
  - `packages/measurement-api/test/units.test.ts` — 33 בדיקות עם **אורקל BigInt עצמאי** להמרות (אי-תלות במימוש הנבדק), טבלת עיגול שלילי מחייבת, גבולות safe integer, עלויות, מלבנים ודטרמיניזם.
  - `vitest.packages.config.ts` + `test:packages`; tsconfig.test.json לטיפוסי הבדיקות.
  - `scripts/migration/verify-units.mjs` — 39 בדיקות.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 33/33 PASS (vitest).
  - `node scripts/migration/verify-units.mjs` — 39/39 OK: ADR מלא, 19 ייצואי API בזמן ריצה מה־dist, ערכי חובה (roundDiv(-5,2)=-2; A4≈595.28pt), סריקות אכיפה (0 Math.round מחוץ ל־units; 0 bitwise; 0 pxPerMm/3.7795), ורגרסיה מלאה (build/typecheck/lint/deps).
- **ממצאים:** נמצא ותועד הבדל אפס-שלילי: Math.round(-0.5)=-0 בעוד המימוש השלם מחזיר +0 (זהים מספרית; הונרמל בבדיקת ההצלבה). יחידת LU ממוקמת ב־measurement-api — חבילת השורש המשותפת הנמוכה — כך שכל צרכן מגיע אליה ללא תלות מעגלית (מתועד ב־ADR).

## קפיצת אבן דרך — M0 הושלם ואומת (2026-10-30)

כל ששת שלבי פרק א הושלמו ואומתו: מקורות נעולים, מלאי העברה מלא עם 1,806 גופנים ו־1,053 עיצובים, בייסליין ריצה עקבי (639/659 עמודים, דטרמיניזם מוכח), 26 fixtures נעולים, מטריצת parity עם 16 יעדי differential, ומוסכנות עבודה מחייבות. **שער M0 ירוק** (`node scripts/migration/verify-work-conventions.mjs`).

### שלב 5 — מטריצת parity בפועל (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/migration/parity-matrix.{json,md}` — **22 טענות** מה־README, מרשם העבודות הראשי וה־worklog של Orange: **17 מאומתות**, 4 היסטוריות (SHA-locked), 1 עקרון מתועד. **16 יעדי differential** הוקפאו לשלב 48 ואילך.
  - ריצת **עיטורים פעילים** נוספה לבייסליין (`ornaments.json.gz`): **659 עמודים** — טענת ה־README אומתה במדויק; 59 ממצאים (0 HIGH); 888/888 רשומות ספר החלטות parity PASS; repeat-check PASS.
  - `scripts/migration/verify-parity-matrix.mjs` — 30 בדיקות; מאמת **מחדש** כל טענה מאומתת מול ה-artifacts בפועל (פריסת gzip + ניווט שדות + השוואת ערכים), לא מסתפק בסיווג.
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-parity-matrix.mjs` — 30/30 OK, יציאה 0.
  - רגרסיה: `verify-source-manifest` + `verify-transfer-inventory` + `verify-baseline-run` (23 בדיקות, כולל הריצה החדשה) + `verify-test-fixtures` — כולם PASS.
- **ממצאים:**
  - **אומתו:** 639 עמודים (ברירת מחדל), 659 (עיטורים), 0 HIGH בשתי התצורות, שימור תוכן 0/0, תאימות ספר החלטות, דטרמיניזם repeat בשלוש ריצות, עמודים דלילים 3/9, 0 כשלי גופנים (485/485), כיסוי עיטורים מלא בתצורה הפעילה (996 אלמנטים) ואפס בברירת המחדל, offline נקי.
  - **לא שוחזרו (היסטוריות, SHA-locked):** ספירות הממצאים 27/37 (אצלנו 39/59 — צנרת הממצאים התפתחה), 858/886 רשומות (אצלנו 857/888), 525 גופנים (אצלנו 485), 1,923 עיטורים (אצלנו 996). התכונות עצמן אומתו; הספירות המדויקות נותרו כבייסליין ל־SHA המקורי בלבד ואינן יעד.
  - טענת ה־worklog "0 עמודים עם אי-איזון >30px" נכונה למסמך של 97 עמודים ב־SHA ישן — בקנוני נותרו 8 ממצאי imbalance פתוחים; סווגה היסטורית.

### שלב 4 — קורפוס fixtures ראשוני מכל באג והתנהגות מתועדת (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `packages/test-fixtures/` — סקלטה (הסכמה המלאה בשלב 13): `registry.json` עם **26 fixtures**, כל אחד עם `sourceSha256`, provenance מלא (repo, SHA נעול, נתיב, סיבה) ו-invariants צפויים; `corpus/` — קובצי המקור הנעולים (16MB) במבנה canonical/long/mid/chapters/cases.
  - **5 קישורי בייסליין** משלב 3 אומתו בצליבה כפולה: canonical (639 עמ'), mid (125), ch63 (מקרה הכשל המתועד), twocol, smoke — hash הקלט תואם בשני הצדדים.
  - `documentedBehaviors` — 8 באגים והתנהגויות מתועדים מ־worklog/docs של Orange, ממופים לקורפוס ול־invariants: 3 באגי איזון טורים (עמ' 18,29,30,35,41), layoutInvalidator שדרס תיקונים, word-spacing reset, מדיניות בליטת סמני הערות 0–3px, שאריות rollback של justify גלובלי, היקף עיטורי H2, כותרות recto/verso ו־settings wiring.
  - `plannedFixtures` — 8 דרישות הקורפוס המחייבות מאפיון §17.3 (H0–H7, H3 בקצה, סוגריים מקוננים, first-word, TOC, שערים, כתבים מעורבים) — ייכתבו בשלבים 13, 17, 21, 74.
  - `scripts/migration/verify-test-fixtures.mjs` — 9 בדיקות מצטברות (26 פריטים + 5 קישורים + 3 הגדרות-משתנה + 8 התנהגויות).
- **פקודות בדיקה שרצו (ירוק):** `node scripts/migration/verify-test-fixtures.mjs` — יציאה 0; אין fixture בלי מקור ו־hash.
- **ממצאים:** ההחלטה D-003 (קובצי בדיקה שמחוץ לבייסליין בריפו ה-React) נשמרת — הקורפוס נבנה מ־Orange בלבד. העתק קנוני כפול (fixtures/canonical == very_long) תועד ככינוי ולא הועתק פעמיים.

### שלב 3 — בייסליין ריצה של המנוע הישן (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/migration/baseline/` — 6 ריצות של המנוע הישן (Orange @ `93ad1e57`, הענף הנעול) בסביבה נעולה: Node v22.23.4, Playwright 1.55.0 (מה־lockfile של Orange), Chromium build v1187 headless, offline guard פעיל (קוד יציאה 7 בבקשה חיצונית; אף ריצה לא הפעילה אותו).
  - `canonical.json.gz` + `canonical-run2.json.gz` — המסמך הקנוני `very_long_test_text.txt`: **639 עמודים**, 39 ממצאים (0 גבוהים / 11 בינוניים / 28 נמוכים), 857 רשומות ספר החלטות עם parity PASS, דטרמיניזם פנימי (repeat-render) PASS בשתי הריצות.
  - `mid.json.gz` (125 עמודים, אודיט מלא step-by-step), `ch63.json.gz` (מקרה הכשל המתועד), `twocol.json.gz`, `smoke.json.gz` + סיכומי MD לכל ריצה.
  - `baseline-run.json` — הרשומה הראשית: שורות פקודה מדויקות, SHA-256 של כל קלט/הגדרות/גופנים/דוח גולמי/דוח דחוס/סיכום, מדדי זמן וזיכרון (ייחוס בלבד: ~570MB RSS לקנוני).
  - `scripts/migration/verify-baseline-run.mjs` — 20 בדיקות אימות.
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-baseline-run.mjs` — 20/20 OK, יציאה 0: פריסת כל artifact והתאמת hash כפול (גולמי+דחוס), inputSha256 פנימי, offline נקי, repeat-render, ועקביות בין-הרצות.
- **ממצאים:**
  - **עקביות בין-הרצות הוכחה:** שתי הרצות הקנוניות זהות מבנית במלואן (639 עמודים, כל הרשומות) לאחר נרמול שלושה שדות זמן-ריצה בלבד שהתגלו ב־deep-diff: `run.generatedAt`, `run.renderMs`, `geometry.stats.extractMs`. הגיבוב הקנוני המשותף: `c7957802…0fac`.
  - 639 העמודים תואמים לספירה ההיסטורית המתועדת באפיון (639/659) — baseline ל־SHA זה בלבד.
  - הדוח הקנוני הגולמי 20.8MB נשמר דחוס (1.52MB); האודיט המלא של mid (81MB) נשמר דחוס (3.96MB) — סה"כ 7.2MB.
  - סביבת הריצה: Chromium 1187 הותקן במיוחד ל־Playwright 1.55.0 של Orange (המטמון הכללי הכיל 1200 בלבד) — הבייסליין לא רץ על דפדפן שאינו מדויק לגרסה.

### שלב 2 — הקפאת מלאי ההעברה המלא מהתוכנה הישנה (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `assets/fonts/` — 1,757 גופנים מצורפים (1,753 woff2 + 4 woff) + Guttman-Rashi + 38 גופני selfhost תחת OFL-1.1 (6 קבצי רישיון) + 5 מטא-דאטה (כולל fonts.json של Orange — זהה ביטים למקור ב־IMUD) + `manifest.json` עם SHA-256 לכל קובץ ומיפוי משפחה מ־6 מקורות ישנים. 4 קבצי woff ללא מיפוי משפחה — מתועדים.
  - `assets/ornaments/` — 5 קבצים, 967 עיצובים (302 עליונים/תחתונים, 302 ימין/שמאל, 5 כותרת, 323 מחיצות מוסף, 35 מפרידי הערות) + `manifest.json` עם hash לכל קובץ ולכל SVG.
  - `assets/shaar/` — 3 קבצים, 86 עיצובי שער (32 ראשי, 27 אחורי, 27 משנה) + `manifest.json`.
  - `docs/migration/transfer-inventory.{json,md}` — שבע קטגוריות מלאי מסעיף ד בתכנית, כל פריט עם SHA-256, סטטוס ויעד; 3 החלטות מתועדות (D-001 רישוי האוסף המצורף, D-002 Guttman-Rashi, D-003 קובצי בדיקה שמחוץ לבייסליין).
  - `scripts/migration/verify-transfer-inventory.mjs` — אימות מלא (37 בדיקות).
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-transfer-inventory.mjs` — 37/37 OK, יציאה 0 (Node v22.23.4): כל 1,796 הגופנים אומתו מול הדיסק, רישיון/החלטה לכל גופן, 1,053 עיצובים אומתו מול ה־SVG בפועל, 44 פריטי מקור דחויים אומתו מול מראת Orange, צליבוב מלאי↔מניפסטים.
- **ממצאים:**
  - המסמך הקנוני `very_long_test_text.txt` אומת מול ה־hash המתועד ב־PROVENANCE.md של Orange (`5e73b913…ce0e4`).
  - מזהה כפול אחד בבייסליין ב־section_dividers.json (`ext______2019_06_24…`, 323 ערכים / 322 ייחודיים) — מתועד במניפסט; הטיפול ייעשה בשלב 68.
  - קובצי הגופנים שבריפו (שורש `fonts/`) זהים ביטים לאוסף של Orange (diff מלא, יציאה 0) — העתקים הנעולים תחת `assets/` חולקים את אותם blobs ב־git, ללא תוספת אחסון משמעותית.
  - שריד בייסליין: תיקיית משנה ריקה `fonts/fonts/` — לא הועתקה (מתועד). קובץ הגדרות `default_settings.json` של Orange לא היה קיים בריפו ה־React — הוקפא במלאי עם hash.
  - אין שינוי מנוע; שלב הקפאת נכסים בלבד. תיקיית `fonts/` בשורש הריפו לא נגעה (כלל 8).

### שלב 1 — מפת מקורות נעולה ונעילת סביבת ריצה (M0) — הושלם 2026-10-30
- **תוצרים:**
  - `docs/migration/source-manifest.json` — שבעת המקורות הנעולים מאפיון §2 עם SHA מלא, תאריך, תפקיד ושימוש: IMUD_TORANI @ `706ba955…`, Yellow @ `878535e1…`, Gold @ `a444d34c…`, Green @ `e5cde5f1…`, Orange @ `93ad1e57…`, Typesetter_doc @ `534b8f4e…`, React @ `0c7b9927…` (נקודת מוצא היסטורית בלבד).
  - `.nvmrc` (Node 22) + `engines.node` מאומת; `package-lock.json` קיים ומחייב; Playwright נעולה ל־1.64.1 לבדיקות visual בלבד.
  - `docs/migration/environment.md` — תיעוד נעילת הסביבה, כולל האזהרה ש־Orange רץ בסביבה שונה מקודמיו ואין לערבב baselines בין ענפים.
  - `scripts/migration/verify-source-manifest.mjs` — אימות מבנה המניפסט, קיום ונגישות כל SHA (מראה מקומית או GitHub API), התאמת nvmrc/engines, קיום lockfile ונעילת Playwright.
- **פקודות בדיקה שרצו (ירוק):**
  - `node scripts/migration/verify-source-manifest.mjs` — 20/20 בדיקות OK, יציאה 0 (Node v22.23.4).
  - `npm ci` תחת Node v22.23.4 / npm 10.9.9 — 456 חבילות, יציאה 0.
- **ממצאים:** כל ששת ריפואי המקור שובטו ואומתו ב־SHA המדויק (מראות מקומיות לשלבים הבאים). קומיט המוצא `0c7b9927` קיים בהיסטוריית הריפו. אין שינוי מנוע; שלב תיעודי־תשתיתי בלבד.

## 2026-10-30 (לפני הפעלת התכנית)

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
