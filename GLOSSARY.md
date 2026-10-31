# מילון מושגים — Tora Book Typesetter React

> מסמך חי — מתעדכן בכל פעם שנכתב/נשתנה קוד הקשור למושג.
> כל מושג בעל שם ייחודי, והשימוש בו קבוע לאורך כל הפיתוח.

---

## מושגי יסוד

### שער ראשי (Main Shaar)
**עמוד 1 בספר.** דף השער הקדמי. מכיל: שם הספר, נושא, תיאור, מחבר, מקום ושנה. מעוצב על ידי SVG מ-`shaar_main.json`. אין בו כותרת עליונה ומספר עמוד.

**קוד:** `pageType: 'main-shaar'`, `PageType = 'main-shaar'`
**JSON:** `shaar_main.json` (32 עיצובים, כל אחד: `{id, name, svg}`)

### שער אחורי (Back Shaar)
**עמוד 2 בספר** — הגב המודפס של דף השער הראשי. לא העמוד האחרון! מכיל: זכויות יוצרים, פרטי הוצאה לאור, פרטי קשר, הערת ויתור. מעוצב על ידי SVG מ-`shaar_back.json`.

**קוד:** `pageType: 'back-shaar'`, `PageType = 'back-shaar'`
**JSON:** `shaar_back.json` (27 עיצובים)
**סדר עמודים:** עמוד 1 = שער ראשי → עמוד 2 = שער אחורי → עמוד 3+ = תוכן

### שער משנה (Sub Shaar)
**בתחילת כל חלק (H1) בספר.** מופיע אוטומטית כאשר ה-parser מזהה `כותרת 1 -`. מכיל: כותרת ראשית + כותרת משנה (מפוצלות על המקף הראשון). מעוצב על ידי SVG מ-`shaar_sub.json`.

**קוד:** `pageType: 'sub-shaar'`, `PageType = 'sub-shaar'`
**JSON:** `shaar_sub.json` (27 עיצובים)
**טריגר:** `כותרת 1 - <ראשי> - <משנה>` → H1, pageType='sub-shaar'

### עמוד פתיחת פרק (Chapter Opener)
**עמוד הנפתח על ידי כותרת H2 או H0.** הכותרת ממוקמת בשליש העליון של העמוד. הטורים מתחילים מתחת לכותרת אך מסתיימים באותו קו תחתון כמו עמוד רגיל.

**קוד:** `pageType: 'chapter-opener'`, `tora-page-h2`, `tora-page-h0`

### עמוד רגיל (Regular Page)
**עמוד טקסט רגיל עם שני טורים.** מכיל כותרת עליונה, טורים, הערות שוליים (אם יש), ומספר עמוד.

**קוד:** `pageType: 'regular'`

---

## רמות כותרות (Heading Levels)

### H0 — הקדמה / מבוא
פותחת עמוד חדש. מסוג `chapter-opener`. גופן: Frank Ruhl Libre 17pt Bold.

**קוד:** `headingLevel: 0`, `settings.typography.headings[0]`

### H1 — שער משנה / חלק
פותחת עמוד `sub-shaar`. הטקסט מפוצל על המקף הראשון לכותרת ראשית + משנה. גופן: Lia Sgula 50pt Bold.

**קוד:** `headingLevel: 1`, `settings.typography.headings[1]`

### H2 — פרק / סימן
פותחת תמיד עמוד חדש (`chapter-opener`). ממוקמת בשליש העליון. כולל סימן אוטומטי (גימם). גופן: AAd_AlphaBlack 17pt Bold.

**קוד:** `headingLevel: 2`, `settings.typography.headings[2]`
**סימן אוטומטי:** `autoSimanBadge: true`

### H3 — סעיף ביניים רוחבי
חוצה את שני הטורים (span). גופן: AAd_AlphaLight 13.5pt.

**קוד:** `headingLevel: 3`, `tora-heading-inline-wide`

### H4–H6 — תתי-סעיפים
מופיעות בתוך הטור (inline). גדלים: 12.5pt, 11.5pt, 10.5pt.

**קוד:** `headingLevel: 4|5| 6`, `tora-heading-inline`

### H7 — הערת צד (Marginalia)
תמיד בשוליים החיצוניים. אינה מופיעה בגוף הטקסט. מוצמדת לפסקה הבאה. גופן: Hadassah Friedlaender 6pt.

**קוד:** `headingLevel: 7`, `pageType` נשאר 'regular' אך ההערה מוצמדת.

### עיטורי כותרות (Heading Ornaments)
עיטורים מעל, מתחת ולצד **כותרות 2 ו-3 בלבד** (לא H7). נטענים מ-JSON חיצוני.
- H2: עיטור עליון + עיטור תחתון (מעל ומתחת הכותרת)
- H3: עיטורי צד (ימין ושמאל)
- **לא קשור ל-H7 / הערות צד**

**קוד:** `tora-heading-ornament-top`, `tora-heading-ornament-bottom` (H2)
**JSON:** `header_ornaments.json` (28KB)

### עיטור סוף פרק (Chapter End Ornament)
סימן ויזואלי ב**סוף קטע של כותרת 2** (לא סוף כל פסקה). סוגים: פירמידת מעויינים (❖ ❖ ❖), רומח, שושנתא, סלסול.

**קוד:** `tora-chapter-end`, `renderChapterEndDivider()`

---

## פסקאות

### p-cut (פסקה חתוכה)
פסקה שנחתכת באמצע וממשיכה בטור/עמוד הבא. כל השורות מיושרות (justify).

**קוד:** `class="tora-body-text p-cut"`, `text-align-last: justify`

### p-end (פסקה אחרונה)
הפסקה האחרונה בטור/סעיף. השורה האחרונה ממורכזת (`text-align-last: center`).

**קוד:** `class="tora-body-text p-end"`, `text-align-last: center`
**זיהוי:** `blockIndex === totalBlocks - 1` ב-renderColumn

### first-word-window (מילה ראשונה מוגדלת)
המילה הראשונה של כל פסקה מוגדלת. מצבים: `sunken` (שקוע), `inline` (בשורה), `bold` (מודגש), `none` (ללא).

**קוד:** `<span class="first-word-window">` או `<span class="first-word-bold">`
**הגדרות:** `settings.typography.dropWordMode`, `dropWordCount`, `dropWordMinLines`

### dibbur-hamatchil (דיבור המתחיל / ד"ה)
זיהוי אוטומטי של מילות הפתיחה עד הנקודה/מקף הראשונה (עד 80 תווים). נפוץ בביאורים על הש"ס והרמב"ם.

**קוד:** `<span class="dibbur-hamatchil">`
**רגקס:** `^([^.{terminators}]{1,80}[{terminators}])\s*(.+)$`
**הגדרות:** `settings.typography.dibburHamatchil.enabled`, `.terminators`

---

## הערות

### הערת שוליים (Footnote)
מופיעה בתחתית העמוד מתחת לטורים. תוחמי ברירת מחדל: `[` ו-`]`. תומכת במקוננים.

**קוד:** `ParsedFootnote`, `FootnoteBlock`, `tora-footnotes-area`
**תוחמים:** `settings.notes.footnoteDelimiters` (ברירת מחדל: `['[', ']']`)

### הערת סיום (Endnote)
מופיעה בסוף החלק. קידומת ברירת מחדל: `הערת סיום -`.

**קוד:** `ParsedEndnote`, `settings.notes.endnotePrefix`

### הערת צד (Side Note / Marginalia)
מופיעה בשוליים החיצוניים. מוצמדת לפסקה הבאה. מזוהה על ידי `כותרת 7 -`.

**קוד:** `ParsedSidenote`, `headingLevel: 7`

### הערת עריכה (Editorial Note)
מסומנת על ידי `##text##`. מוסרת לחלוטין מהמסמך.

**קוד:** `parseEditorialNotes()`, רגקס: `/##[^#]+##/g`

---

## עימוד

### טור ימני (Right Column)
הטור הראשון בכיווניות RTL (נקרא ראשון). `index: 0`.

**קוד:** `tora-column-right`, `ColumnContent.index = 0`

### טור שמאלי (Left Column)
הטור השני בכיווניות RTL. `index: 1`.

**קוד:** `tora-column-left`, `ColumnContent.index = 1`

### איזון טורים (Column Balancing)
שני הטורים חייבים להסתיים באותו קו תחתון. פער > 5px = בעיה.

### קו מפריד (Column Divider)
קו אנכי בין הטורים. מסתיים בדיוק בקצה הטקסט. סוגים: `none`, `line`, `dashed`, `double`.

**קוד:** `settings.grid.columnDivider`, `tora-column-divider`

---

## כותרות עליונות (Running Headers)

### כותרת עליונה (Running Header)
שורה מעל הטורים, מחולקת ל-3 אזורים (ימין/מרכז/שמאל). לא מופיעה בשערים.

**קוד:** `tora-running-header`, `tora-rh-right/center/left`

### מתחלפות (Alternating / Recto-Verso)
בעמודים אי-זוגיים (ימניים) וזוגיים (שמאליים), התוכן מתחלף בין ימין לשמאל.

**קוד:** `settings.runningHeader.alternating`, `isOddPage = page.pageNumber % 2 === 1`

### חצי-חצי (Half-Half)
שם הספר (מספר מילים זוגי) מפוצל בין שני האזורים החיצוניים. בעמוד ימני: חצי ראשון בימין, שני בשמאל. בשמאלי: התחלפות.

**קוד:** `settings.runningHeader.halfHalfBookName`

---

## מספור

### מספר עמוד (Page Number / Folio)
מופיע בתחתית העמוד. פורמטים: `hebrew-letter` (גיממ), `hebrew-letter-daf` ("דף א"), `arabic` (ספרות). מסגרות: `none`, `circle`, `square`, `round-parens`, `square-brackets`, `diamond`.

**קוד:** `settings.grid.pageNumberFormat`, `settings.grid.pageNumberFrame`
**פונקציה:** `toGematria(num)`, `renderPageNumber()`

### גימטריה (Gematria)
המרת מספר לאותיות עבריות: 1→א, 10→י, 15→ט"ו, 100→ק, 400→ת, 1000→א'.

**קוד:** `toGematria(num)` ב-`src/lib/gematria.ts`

### מספור הערות (Footnote Numbering)
סגנונות: `hebrew-letters` (א,ב,ג), `arabic-numbers` (1,2,3), `hebrew-letters-geresh` (א',ב'). איפוס: `page`/`siman`/`part`/`continuous`.

**קוד:** `settings.notes.numberingStyle`, `settings.notes.counterReset`

---

## שערים — SVG

### shaar-loader
מודול שטוען את קובצי JSON של עיצובי השערים. כולל cache (memoization).

**קוד:** `src/lib/shaar-loader.ts`
**פונקציות:** `loadShaarDesigns()`, `getShaarDesign(designs, index)`, `getShaarDesignById(designs, id)`

### ShaarDesign
מבנה נתונים: `{ id: string, name: string, svg: string }`. ה-SVG הוא רקע מלא לעמוד A4 (viewBox 2000×2880).

### ShaarDesignData
מבנה שמועבר ל-renderer: `{ main?: ShaarDesign, back?: ShaarDesign, sub?: ShaarDesign }`.

**קוד:** `src/worker/engine/renderer.ts`, `ShaarDesignData`

---

## מטריקות

### TextMeasurer
ממשק למדידת טקסט. מודד רוחב טקסט, גובה שורה, גובה בלוק. ב-MVP: `SimulatedMeasurer` (הערכות). בעתיד: `OffscreenCanvas` ב-Worker.

**קוד:** `src/worker/measurement/text-metrics.ts`, `TextMeasurer` interface, `SimulatedMeasurer` class

### FNV-1a Hash
hash דטרמיניסטי 32-bit. משמש לאימות דטרמיניזם: אותו קלט → אותו hash.

**קוד:** `fnv1a32(s: string): string` ב-`src/worker/inputs/fnv-hash.ts`

---

## בדיקות איכות (Audit)

### auditGeometry
פונקציה טהורה שבודקת את העמודים המרונדרים. 5 בדיקות:

1. **imbalanced-columns** — פער גובה בין טורים > 30px
2. **overflow** — טור גולש מעבר לגובה זמין
3. **widow** — שורה בודדת בתחילת טור
4. **sparse-line** — שורה אחרונה דלילה בפסקה חתוכה
5. **hanging-heading** — כותרת בתחתית טור עם פחות מ-2 שורות אחריה

**קוד:** `src/audit/geometry-audit.ts`
**חומרה:** `HIGH` / `MEDIUM` / `LOW`

### AuditFinding
מבנה ממצא: `{ page, kind, severity, description, elementId?, suggestedFix? }`.

**קוד:** `AuditFinding` ב-`src/types/layout.ts`

---

## Parser

### header-parser
מזהה כותרות ב-3 מבנים. רגקס: `^כותרת\s+(\d+)(?:\s+מספר\s+(\d+)(?:\s*\((\d+)\))?)?(?:\s*-\s*|\s*–\s*|\s*—\s*)(.+)$`

**קוד:** `src/parser/header-parser.ts`, `parseHeading(line: string): ParsedHeading | null`
**כלל:** שורה בלי מקף אינה נחשבת לכותרת (בשקט, ללא שגיאה).

### nested-bracket-matcher
מוצא את הסוגר הסוגר התואם לסוגר פותח, עם תמיכה במקוננים.

**קוד:** `findMatchingCloseBracket(text, openPos, openChar, closeChar): number`

### metadata-parser
מזהה 10 שדות metadata בתחילת המסמך. שורה ריקה אחרי ה-metadata מסיימת את הבלוק.

**קוד:** `parseMetadata(lines): { metadata, lines }`

---

## State

### Settings
מבנה הגדרות יחיד. כל משתנה ניתן לשינוי הוא חלק מ-Settings. לא מוטמע בקוד.

**קוד:** `Settings` interface ב-`src/types/main-settings.ts`
**ברירת מחדל:** `defaultSettings` ב-`src/lib/default-settings.ts`
**אחסון:** localStorage (Zustand persist middleware)

### ParsedDocument
תוצאת ה-parser — ה-AST הראשי. מכיל: metadata, root (צמתים), footnotes, endnotes, sidenotes, noteRules, customStyles, sourceHash.

**קוד:** `ParsedDocument` ב-`src/types/text.ts`

---

## ייבוא / ייצוא

### importWordFile
ייבוא קובץ .docx עם המרת סגנון Word → קידומת טקסט. `Heading 1` → `כותרת 1 - `.

**קוד:** `src/lib/text-importers.ts`, `importWordFile(file: File): Promise<string>`

### exportHtml
ייצוא HTML עצמאי (Standalone) — זהה לתצוגה החיה. CSS מוטמע, משתני :root, נתיבים מוחלטים.

**קוד:** `src/lib/html-exporter.ts`, `exportHtml(pages, settings, doc): string`

---

## דטרמיניזם

### קדושת שלמות הטקסט (Text Integrity is Sacred)
לעולם אין לקצר, לאחד, או לשנות איברים במערך המילים הגולמי. הנוסח נשמר אות באות.

### Snapshot & Rollback
מנגנון ליצירת "תצלום" מצב לפני שלב משמעותי, וחזרה אחורה אם השלב נכשל. (עתידי — טרם ממומש בקוד הנוכחי)

### Dry Run
ריצת דמה שלא משנה את המצב האמיתי. פונקציות מדידה מקבלות `isDryRun: true`. (עתידי)

### Trace Logger
יומן החלטות אופציונלי. כבוי כברירת מחדל. אינו משפיע על הפריסה.

**קוד:** `TraceLogger` ב-`src/worker/engine/trace-logger.ts` (טרם נוצר — מוגדר באפיון)

## הקפאת בסיס (M0) — מושגי הגירה

### בייסליין נעול (Locked Baseline)
פלט רפרנס מהתוכנה הישנה ב־SHA נעול (Orange @ `93ad1e57`) ובסביבה נעולה (Node v22.23.4, Playwright 1.55.0, Chromium v1187), שממנו נמדדים תאימות והבדלים. אין לערבב בין סביבות.

**נתיב:** `docs/migration/baseline/` · **רשומה ראשית:** `baseline-run.json`

### המסמך הקנוני (Canonical Long Document)
`very_long_test_text.txt` (3.4MB, sha256 `5e73b913…ce0e4`) — קלט הייחוס לכל בדיקת מסמך מלא. 639 עמודים בברירת מחדל, 659 בעיטורים פעילים.

### מלאי ההעברה (Transfer Inventory)
הרישום המלא של כל מה שיש להעביר מהתוכנה הישנה: מזהים, הגדרות, גופנים, חלקי עמוד, שערים ועיטורים, חוקי הערות וקורפוס בדיקה — כל פריט עם SHA-256, סטטוס (מועבר/דחוי) ויעד.

**נתיב:** `docs/migration/transfer-inventory.{json,md}` · **נכסים נעולים:** `assets/{fonts,ornaments,shaar}/`

### fixture
קלט בדיקה נעול עם `sourceSha256`, provenance (מקור, SHA, סיבה), invariants צפויים ולעיתים קישור לבייסליין. **אין fixture בלי מקור ו־hash.** Golden לא מתעדכן אוטומטית.

**נתיב:** `packages/test-fixtures/` · **רישום:** `registry.json`

### מטריצת parity (Parity Matrix)
סיווג טענות התוכנה הישנה: **מאומתת** (מאומתה מחדש מול artifacts), **היסטורית** (SHA-locked — נכונה לנקודתה בלבד, לא יעד), **עקרון מתועד**. רק טענות מאומתות הן יעדי differential.

**נתיב:** `docs/migration/parity-matrix.{json,md}`

### יעד differential (Differential Target)
טענה מאומתת שהוקפאה כיעד השוואה למנוע החדש (שלב 48 ואילך) — למשל: 639/659 עמודים, שימור תוכן 0/0, תאימות ספר החלטות.

### שדות זמן-ריצה (Volatile Fields)
שלושת שדות הדוח של המנוע הישן שתלויים בזמן הריצה ומנורמלים לפני כל השוואת artifacts: `run.generatedAt`, `run.renderMs`, `geometry.stats.extractMs`. אף שדה מבני לא התגלה כתלוי-ריצה.

### מראה מקומית (Legacy Mirror)
עותק מקומי של ריפו מקור ב־SHA הנעול (תחת `TORA_LEGACY_MIRRORS`), לאימות hash של פריטים דחויים מול המקור בפועל.

## יחידות וחשבון (ADR-001; שלב 9)

### LU (Layout Unit)
יחידת הגאומטריה של ליבת המנוע: **1 LU = 1/65536 נקודה טיפוגרפית**. כל הגאומטריה — integers בטוחים בלבד; אין CSS pixels ואין pxPerMm. המרת מ"מ/A4 פעם אחת ברציונל מדויק (1mm = 360/127 pt).

**קוד:** `LayoutUnit`, `mmToLu`, `ptToLu`, `fontUnitsToLu` ב־`packages/measurement-api/src/units.ts`

### roundDiv — עיגול מרוכז
העיגול היחיד בליבה: מנה-רצפה ואז חצי-כלפי-∞ (זהה ל־Math.round גם לשליליים), בחישוב שארית שלם. כל Math.round אחר בקוד החבילות אסור (נאכף בסריקה).

### Cost — עלויות בסקייל קבוע
עלויות וקנסות של שבירת שורות: integers בסקייל 1/1024. אין השוואות float עם epsilon.

**קוד:** `Cost`, `makeCost` (COST_SCALE = 1024)

### safeAdd / safeMul
כל חיבור/כפל גאומטרי בליבה עובר שומרי סף הזורקים `UnitsError` בעת חריגה מ־Number.isSafeInteger. איסור bitwise על קואורדינטות (מוגבל ל־32 סיביות ב־JS).

## גיבוב קנוני (ADR-002; שלב 10)

### layoutHash
SHA-256 של ה־Layout IR הקנוני **בלבד** — בלי timestamps, משך ריצה, host או progress. אותם קלט, הגדרות, גופנים, provider וגרסת מנוע מניבים אותו ערך על כל host. כל שינוי מנוע מדווח עם diff שלו (אפיון §23.3).

**קוד:** `layoutHash` ב־`packages/layout-api/src/canonical-hash.ts`

### inputHash / configHash
inputHash = גיבוב כל מה שמשפיע על הפלט (מקור, configHash של ההגדרות האפקטיביות, מניפסטי גופנים ונכסים, גרסות פרסר ומנוע). configHash = ההגדרות האפקטיביות בלבד.

### canonicalJson
סריאליזציה קנונית: מפתחות ממוינים רקורסיבית, escaping קבוע, אפס שלילי מנורמל, וערכים לא-סדירים (undefined/NaN/function) נדחים בשגיאה. אידמפוטנטית — סריאליזציה←פרסור משמר hash.

### SHA-256 נייד
מימוש JS טהור ב־`packages/layout-api/src/hash.ts` — ליבת המנוע אסורה בייבוא node:crypto (חייבת לרוץ ב־Worker). מאומת מול וקטורי FIPS-180-4 ומול node:crypto כאורקל בבדיקות. FNV-1a נשמר להשוואה היסטורית בלבד.

## קטלוג שגיאות ו־i18n (שלב 12)

### EngineError
בסיס כל שגיאות הליבה. נושא מפתח קטלוגי (למשל `errors.font.MISSING_GLYPH`) + פרמטרים לתצוגה מתורגמת. ההודעה הגולמית (message) מיועדת ללוג פיתוח בלבד — למשתמש מציגים מפתח+params דרך i18n. מפתח לא רשום נדחה בזמן יצירת השגיאה.

**קוד:** `EngineError`, `ERROR_CATALOG` ב־`packages/measurement-api/src/errors.ts`

### ValidationIssue
ממצא אימות משותף לכל החבילות (הגדרות/קלט/מסמך): מפתח, חומרה, פרמטרים, מיקום והערת פיתוח. אינו חריגה — כמה בעיות בו־זמנית.

### טבלת מפתחות תרגום
`docs/i18n/error-keys.md` — המקור לקובצי ה־locale (שלב 93). מפתחות אינם משתנים לאחר פרסום; שינוי משמעות מחייב קוד חדש.

## כלי golden (שלב 13)

### buildGolden / compareGolden
כלי כתיבה והשוואת golden ב־`packages/test-fixtures`: ה־IR מגובב ב־layoutHash המוזרק, וההשוואה מפיקה דו"ח diff קריא (hash + מקטע ההבדל הראשון). **עדכון golden אסור אוטומטית ב־CI** — רק ידנית עם diff והסבר ב־WORKLOG. `tests/golden/` — מיקום קובצי ה־golden.

### סכמת fixture מלאה
`validateFixture`/`validateRegistry` (§17.3): id, schemaVersion, sourceSha256, settingsSha256, **fontManifestSha256** (נצלב מול המניפסט בפועל), enginePolicy, expected.invariants, **goldenLayoutSha256** (null עד היווצרות המנוע) ו־provenance.

## מודל תוכן ו־provenance (M2; שלב 14)

- **SourceSpan** — פרוסת מקור שכל פריט תוכן נושא: `documentId`, `stream`, טווח UTF-16 חצי־פתוח `[startUtf16, endUtf16)` ו־`importerPath` אופציונלי. הבסיס לכל ביקורת תוכן: אפשר לדעת מאין הגיע כל תו.
- **טווח חצי־פתוח** — ‎[start, end)‎: ‎end‎ אינו כלול. תו בודד במיקום ‎i‎ הוא ‎[i, i+1)‎; פרוסה ריקה ‎[i, i)‎ חוקית (עוגן נקודתי) ואינה חופפת כלום.
- **זרם תוכן (ContentStream)** — `body | footnote | endnote | sidenote | metadata`; יחסי פרוסות (הכלה/חפיפה) תקפים רק באותו מסמך ובאותו זרם.
- **מזהים ממותגים (NodeId/AtomId/AnchorId)** — טיפוסי מחרוזת עם מיתוג קומפילציה; לא ניתן להחליף סוג אחד בשני. הגזירה הדטרמיניסטית של AtomId — בשלב 15.
- **sliceSpan** — תת־פרוסה בהיסטים יחסיים מתוך פרוסת אב; כלי הפרסר לפצל טקסט בלי לאבד מקור. ה־importerPath עובר בירושה.
- **קטלוג שגיאות מקומי (content-model)** — ל־content-model אין תלויות (גרף §5), ולכן קטלוג השגיאות שלה מקומי (`CONTENT_MODEL_ERROR_CATALOG`, מפתחות `errors.span.*`) באותם כללי שלב 12: אכיפת רישום בזמן יצירה, מפתח = מפתח i18n.

### TextAtom ומזהים דטרמיניסטיים (שלב 15)

- **TextAtom** — יחידת התוכן הקטנה שממנה נבנה כל ה־IR: `text` (grapheme cluster או token אטומי), `source` (SourceSpan), `script` (hebrew/latin/number/punctuation/other), `bidiLevel`, `breakBefore` (forbidden/allowed/required) — וגורמי הזהות `ordinal` ו־`origin`. הבנייה רק דרך `makeTextAtom` המאומתת; אטום מקור חייב לכסות את פרוסתו במדויק.
- **AtomId נגזר** — ‎atom:v1|מסמך|זרם|start+end|origin|ordinal‎ — הזהות נגזרת מהמקור בלבד (פרוסה + סידור + מקור החדרה); אותו קלט ← אותו מזהה, בלי אקראיות, זמן או מונים. `origin` הוא "המקור המפורש" של אטומים מוחדרים (למשל מספר עמוד מדומה) — הוא מקודד במזהה ונשמר כשדה לביקורת.
- **classifyScript** — סיווג כתב דטרמיניסטי ברמת התוכן: נקודת הקוד המכריעה הראשונה (בלי תווים משלימים); הגוש העברי כולל ניקוד, טעמים, גרשיים ומקף עברי; רווח ופיסוק בסל `punctuation`; בקרות פורמט (RLM וכדומה) — `other`. ה־shaping עצמו במדידה (§6.4, שלבים 24+).
- **splitAtom / mergeAtoms** — פיצול ואיחוד אטומים בגבולות חוקיים בלבד (לא באמצע surrogate pair, לא בין בסיס לניקוד, לא אחרי ZWJ; איחוד רק בסמיכות מלאה, באותו מקור ורמת BiDi). הבן הימני של פיצול מסומן `forbidden` — פיצול provenance (כמו איחוי runs של DOCX) אינו הזדמנות שבירה. `merge(split(x)) === x` במדויק, כולל המזהה.
- **ספר טרנספורמציות (AtomLedger)** — רצף בלתי־הפיך של רשומות `TransformRecord` ‎{kind, from, to, reason, detail}‎ באוצר המילים של Text Audit v1 (split/merge/insert/suppress/reorder/bidi). שלב 15 מפיק split/merge; `ledgerIntegrityIssues` מוכיח שאטום לא נולד פעמיים ושאין מקור שלא נולד — הבסיס לשלב 21.
- **computeAtomCoverage** — חישוב טהור של כיסוי האטומים של זרם על פני ‎[0, N)‎: רווחים, חפיפות, כפילויות, חריגות גבול, החדרות ואטומים זרים — הכול **בלי רינדור ובלי מדידה** (שער השלב). כל אטום שאינו תקין (כולל מזהה שלא נגזר משדותיו) נדחה כבר בבדיקה המבנית `isTextAtom`.

### InlineItem, ContentBlock ומסגרת המסמך (שלב 16)

- **InlineItem** — רכיב תוכן רץ בתוך בלוק, שישה סוגים: `text` (רצף אטומים באותו זרם), `note-reference` (הפנייה להערה — התחליף המפורש ל־sentinel ‎\u0001FN:id\u0002‎ הישן), `anchor`, `explicit-break`, `inline-box` ו־`marker` (סמנים תורניים: drop-word, dibbur hamatchil וכדומה — בלי sentinel בטקסט). כל רכיב שאינו טקסט נושא `SourceSpan` משלו.
- **ContentBlock** — בלוק תוכן רקורסיבי לפי §6.2: `role` (body/heading/custom/note-body), `headingLevel` (חובה לכותרת, אסור לשאר; H0 פתיחה…H7 הערת צד — כמו בישן), `styleId` (סגנון מותאם אישית מהישן נשמר כמו שהוא), `inline`, `children` (חוקי לכל תפקיד — בירושה מ־ast-builder הישן שבו כותרת פותחת בלוק עם ילדים) + גורמי זהות `ordinal`/`origin`. המזהה נגזר: ‎node:v1|…‎; העוגן: ‎anchor:v1|…‎.
- **TorahDocument** — מסגרת המסמך: `metadata` (ערכים עם מקור בזרם metadata; עשרת המפתחות ההכרחיים ב־`LEGACY_METADATA_KEYS`), `parts` ← `simanim` ← בלוקים (מבטא את simanNumber/subNumber מהישן; `shaarDesign: main/back/sub`), `notes` — ארבעה זרמי הערות (שוליים/סיום/צד/עורך) עם `NoteEntry {noteId, kind, anchor?, block}`, `customStyleIds`, `sourceHash` (מוזרק מ־ADR-002) ו־`sourceLength`.
- **הפניות הערות** — כל `note-reference` חייב להיפתר להערה קיימת (`errors.document.UNRESOLVED_NOTE_REFERENCE`); הערה שאין מפנה אליה מדווחת על ידי `findOrphanNotes` — לא נבלעת בשקט. הסרת הערת עורך תירשם כ־`suppress` בספר הטרנספורמציות (שלב 15).
- **round-trip** — `serializeDocument`/`parseDocument`: אותו מסמך ← אותה מחרוזת ביט-ביט; פרסור מאומת במלואו (כולל אמיתות גזירה של כל בלוק). זו ההוכחה שהמודל מסוגל להחליף את מבני הביניים הישנים בלי DOM.
- **החלטות זניחה מתועדות** — `noteRules`/`customStyles` הם הגדרות (ביתם settings-schema, שלב 30; המסמך נושא רק את מזהי הסגנונות בשימוש); `LayoutMode`/`TextPosition`/`PageType`/`ColumnLayout` הם מושגי פריסה (Page Templates ב־layout-api, שלבים 50+; הקישור דרך styleId + headingLevel). המיפוי המלא: `docs/migration/content-model-mapping.md`.
