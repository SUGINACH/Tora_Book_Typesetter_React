# מפת התלויות הגיאומטריות במנוע העימוד — V23

> **מדיניות ענפים:** `V21` ו-`V23` הם ענפי פיתוח מקבילים ונפרדים. העבודה כאן מתבצעת ב-`V23` בלבד; אין למזג את `V23` ל-`V21`. המסמך מבחין בין ממצא סטטי, תוצאת CI מאומתת, והשערה שעדיין דורשת בדיקה.

## 1. מטרת המפה

לזהות את כל הנתונים והרכיבים שמשפיעים על מיקום, רוחב, גובה, שבירת עמוד/טור ואיזון — כולל רכיבים שנראים דקורטיביים אך תופסים מקום, משנים מידות או עלולים לחפוף לטקסט. המטרה אינה לשכתב את המנוע מיד, אלא להפוך שינוי מקומי לניתן לחיזוי: לכל רכיב יהיו מקור אמת למידות, שלב חישוב, צרכנים, וכללי אימות.

## 2. קובצי מקור ותחומי אחריות

| קובץ | אחריות שנצפתה | תפקיד במפה |
|---|---|---|
| `typesetter.js` | בניית עמודים, יצירת HTML לרכיבים, מדידת אזור הערות, פריסת טקסט, איזון טורים ותיקונים לאחר העימוד | מקור האמת העיקרי לבניית פריסה ולזרימת העבודה |
| `geometry-audit.js` | חילוץ תיבות DOM, שורות טקסט, בדיקות הכלה/חפיפה/איזון/אלמנות-יתומות/שורה דלילה ו-overlay | שכבת אימות עצמאית; יש לוודא שהיא מזהה את כל הרכיבים שהמנוע מייצר |
| `renderer.html` | מסגרת סביבת הרינדור וטעינת `style.css` | סביבת CSS/DOM שבה המדידות צריכות להיות זהות למדידות בפועל |
| `style.css` | כללי גודל, זרימה, מרווחים, מיקום ועיטור | חלק מהמודל הגיאומטרי, לא שכבת קישוט נפרדת |
| `very_long_test_text.txt` (קובץ שהועלה לשיחה) | מסמך בדיקה גדול עם מטא-נתונים, כותרות היררכיות וטקסט תורני | fixture לבדיקות עומס ורגרסיה; אין צורך להעתיקו לענף כדי להשתמש בו בבדיקות מקומיות |

## 3. מפת רכיבים ותלויות

### 3.1 שלד העמוד

- `createPageLayout(...)` יוצר `.a4-page`, בתוכו `.page-content-wrapper`, כותרת עליונה שנוצרת ב-`buildHeaderGridHTML(...)`, גוף `.page-body-flow`, ומספור תחתון `.page-number-footer`.
- גבולות העמוד, ה-wrapper, אזור הגוף וה-footer קובעים את תחום העבודה של כל רכיב. שינוי בשוליים, בגובה הכותרת או במספור חייב להיבדק מול אזור הגוף הזמין.
- מספור עמוד עשוי להופיע בכותרת העליונה (`.hdr-pagenum`) או בתחתית. כאשר הוא משולב בכותרת, יש לוודא שהעמודה החיצונית מקבלת מקום ולא חופפת לטקסט או לעיטור.
- תפקידי עמוד שונים (עמוד רגיל, שער/עמוד פתיחה, תוכן עניינים וכדומה) עשויים להחיל רקעים וסידורים אחרים; יש לרשום אותם כווריאנטים של אותה גיאומטריה ולא להניח שכל עמוד זהה.

**שרשרת עיקרית:** הגדרות עמוד + CSS → מידות wrapper/header/footer → גובה ורוחב זמינים ל-body-flow → שיבוץ בלוקים → גובה עמוד סופי.

### 3.2 כותרות עליונות, טקסט ועיטורי כותרת

- `buildHeaderGridHTML(...)` בונה שלוש עמודות: ימין, מרכז ושמאל. תוכן העמודות יכול להיות כותרת פרק/סימן, שם הספר, טקסט מותאם או SVG/עיטור; יש גם מצב כותרות מתחלפות בעמודים זוגיים ומצב פיצול שם הספר.
- הגופן והגודל בעמודות ימין/שמאל, היישור הפיזי, קיצור טקסט ארוך באמצעות `.hdr-txt`, ומספר עמוד חיצוני משפיעים על רוחב הטקסט ועל התנגשות אפשרית עם עיטורים.
- עיטורי SVG אינם בהכרח עטופים ב-`.hdr-txt`; אין למדוד את טקסט הכותרת בלבד ולהניח שהעיטור אינו תופס מקום.
- יש לכלול במפה גם את HTML שמוחזר מ-`renderHeaderSectionHTML` ואת `renderSideOrnamentHTML`, ולבדוק את כל צורות הפלט האפשריות ולא רק כותרת טקסט פשוטה.

**תיקון סיווג וכיסוי שנבדק ב-V23:** `geometry-audit.js` מסווג את `.top-header-grid` כ-`header`, את `.header-col-r/c/l` כ-`header-col`, ומוסיף ירידה רקורסיבית וסוגי טקסט לעיטורים/מספור. גם `.note-line-num` מסווג לפני `.note-line`. ה-fixture הפעיל `tests/fixtures/ornament-geometry-smoke.txt` עם `ornament-geometry-settings.json` מפעיל עיטורי H2 עליון/תחתון, H3 ימין/שמאל, עיטורי כותרת הערות ימין/שמאל, מפריד פרק, קו הערות וכותרת עליונה עם קו מפריד.

בבדיקת CI נמדדו אחת עשרה קטגוריות בסיס עם תיבות בעלות רוחב וגובה חיוביים: שש קטגוריות העיטורים, `sectionDivider`, `noteRule`, `topHeader`, `topHeaderDivider` ו-`colGutterDivider`. בהרחבה המאוחרת נמדדו גם `headerOrnament` וגם `headerOrnamentGraphic`, כך שהביקורת מאמתת את עטיפת העיטור ואת רכיב ה-SVG/IMG עצמו. ב-fixture הפעיל נמדדו 1 מכל קטגוריה, למעט `colGutterDivider` שנמדד פעמיים. נשמרו הפסקאות, הכותרות וההערות, ותור מדידת הערות השוליים התאים בדיוק. נמצאו שני ממצאי איזון בעדיפות נמוכה בלבד, ללא ממצאי `containment`, `containment-rounding` או `overlap`. בדיקת ה-CLI הסתיימה בהצלחה: https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40235771112. בדיקת העיטורים העצמאיים לכותרת 2 (מצב צדדי ומצב עליון/תחתון) עברה גם היא: https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40235447401.

נוסף הדגל `--require-geometry-features`: הוא דורש את אחת עשרה קטגוריות הבסיס ומכשיל את בדיקת העשן במקרה של ממצאי הכלה/עיגול/חפיפה. הוא בודק גם את מצב עיטורי כותרת 2 הפעיל (`side` או `top_bottom`) ודורש את זוג רכיבי ה-DOM המתאים. הדוח מפריד בין הגדרות פעילות לבין ראיות DOM בפועל; ספירה אפסית אינה הוכחה שההגדרה כבויה, משום שייתכן שה-fixture לא הפעיל את הרכיב (למשל, קו הערות ללא הערות שוליים). ריצת המסמך הארוך משתמשת ב-`default_settings.json`, ולכן עיטורי הכותרות העצמאיים מסומנים בה `NOT EXERCISED` כאשר מצבם `none`.

**תיקון תכונה לא ממומשת:** בבדיקה סטטית התברר שהממשק הציע את `h2-title-orn-mode` עם מצבי `side` ו-`top_bottom`, ושהיו CSS ופונקציית התאמת מידות ל-`.block-h2-title-side`, אך ב-`typesetter.js` לא היה נתיב רינדור לעיטורים העצמאיים. Commit `81de5ea5aa4e8773b2484d7282806dc11913eb3f` מוסיף את יצירת הרכיבים בפועל, סגנונות נפרדים וסיווגם במודל הגיאומטרי. בדיקת CI לשני המצבים עברה: https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40235447401. מצב צדדי הפיק עיטור ימין ושמאל (1 כל אחד; השמאלי נוצר מהיפוך הימני כאשר לא נבחר סגנון שמאלי), ומצב עליון/תחתון הפיק רכיב עליון ותחתון (1 כל אחד). בשני המצבים לא נמצאו ממצאי containment/containment-rounding/overlap; נותרו שני ממצאי איזון בעדיפות נמוכה.

**גבולות הכיסוי:** תוצאות אלה מאמתות את תצורות ה-fixture הספציפיות בלבד. עיטור SVG חיצוני בכותרת העליונה נבדק כעת בפועל: ה-CLI טוען את הנכס שנבחר מתוך `header_ornaments.json`, רושם את מזהי הנכסים שנטענו, ודורש גם wrapper וגם SVG/IMG צאצא עם תיבה בעלת רוחב וגובה חיוביים. בדיקת העשן עברה עבור `ext________2_svg`; הכיסוי הפעיל מדד wrapper=1 ו-graphic=1, לצד עיטורי כותרת 2 וקווי ההפרדה. עם זאת, עדיין נדרשות בדיקות לתצורות נוספות, חיתוך חזותי של SVG, גבולות עמוד/טור, חפיפה עם מספור וטקסט, תצורות `none`/פעיל נוספות, וקווי הפרדה נוספים. תיבת DOM חיובית מוכיחה שהרכיב נוצר ונמדד, אך אינה מוכיחה לבדה שאין חיתוך או חפיפה בכל תצורה.

**שקיפות יתרה של שאריות איזון:** ב-commit 3708bb8673a0d2d8868c4b3b494d2f3b45775d38 נוסף ל-Markdown audit טבלת `Per-page balance capacity diagnostics` המציגה לכל שארית את מסלול ההחלטה, צד/גובה יעד וקיבולת המתיחה לפני/אחרי. בריצת המסמך הארוך (643 עמודים) שמונה שאריות סווגו `capacity-limited-residual`: לדוגמה, בטור הקצר הקיבולת ירדה מ-15.01px ל-0 בעוד שהטור האחר שמר 22.51px; הפער הסופי הוא 5–6px. שתי שאריות נוספות הן `policy-accepted-light-justify-residual` של 5px תחת מדיניות 8px. הטבלה מציגה את הסיבה המדודה ואינה מעלימה את הממצאים. אין להסיק ממדידות תיבות חיוביות לבדן שכל מצבי הציור והחפיפה תקינים.

### 3.3 גוף הטקסט, טורים ובלוקים ברוחב מלא

רכיבים שנמצאים במודל הבדיקה:
- `.page-body-flow`
- `.block-2col`, `.main-column` / `.right-col` / `.left-col`
- `.block-single-col`, `.single-wide-col`
- `.block-h3-span` — אזור כותרת/בלוק ברוחב מלא בין אזורים דו-טוריים
- `.col-gutter-divider` — קו מפריד בין הטורים
- פסקאות `p`, `.p-cut`, `.p-end`, סימוני הערות `.note-marker`, מילים מעוצבות `.drop-word`, עוגני הערות צד `.side-note-anchor`

**תלויות:** רוחב הטור וגופן הטקסט → שבירת שורות → גובה הפסקאות → נקודת חיתוך/מעבר טור → גובה כל טור → איזון → מיקום הערות צד וקו המפריד.

- `fitColumnDividers(container)` נקראת אחרי השלמת הבלוקים כדי להתאים את קווי ההפרדה לגובה הטקסט בפועל. יש לוודא שהקו אינו משפיע על זרימת התוכן אלא אם ה-CSS מגדיר אחרת.
- כותרות H2/H3 ועיטוריהן, מרווחים לפני/אחרי כותרת ובלוקים חד-טוריים משנים את הגובה הזמין לטקסט הדו-טורי הבא.
- יש להבחין בין **מקום בזרימה** (תורם לגובה/לשבירת עמוד) לבין **תיבה חזותית** (למשל עיטור ממוקם אבסולוטית). עיטור שאינו תורם לזרימה עדיין דורש בדיקת חפיפה וגבולות.

### 3.4 כותרות היררכיות ועיטורים

ה-audit מכיר כיום בסוגים כגון `.h2-spacer`, `.h2-siman-badge`, `.title-level-2-standalone`, `.h2-ornament-top/bottom`, `.title-level-3`, `.h3-title-text`, `.h3-ornament-right/left`, כותרות H4–H7 וכותרות מותאמות.

יש לבדוק לכל רמה:
1. גובה הכותרת עצמה, margins/padding ו-line-height.
2. גובה/רוחב העיטור, מיקום יחסי/אבסולוטי וחריגה מה-wrapper.
3. רווח לפני ואחרי הכותרת והאם נשארות לפחות שתי שורות טקסט אחריה בתחתית טור/עמוד.
4. מעבר בין פריסת שני טורים לבלוק ברוחב מלא וחזרה לשני טורים.
5. התאמת טקסט לעיטור, כולל `applyHeadingOrnamentTextFit()` שמופעל לאחר העימוד; אם הפונקציה משנה מידות, יש להפעיל מדידה/פריסה חוזרת או להוכיח שהשינוי אינו משפיע על זרימה.

### 3.5 הערות שוליים, הערות סיום וקווים מפרידים

- `buildFootnoteAreaElement(queue)` בונה `.footnote-area`, כותרת אופציונלית `.footnote-header-wrap`, עיטורי צד `.note-header-ornament-right/left`, כותרת `.footnote-header-title`, קו דרך `buildNoteRuleElement()`, ולבסוף בלוק הערות.
- `measureFootnoteAreaHeight(queue, opts)` מודד את כל האזור; הקוד מתעד תיקונים למדידה חסרה של הכותרת/הקו, שימוש ב-probe בתוך `.page-content-wrapper`, `scrollHeight`, ומטמון שמפתחו כולל רוחב, גופן/גודל, line-height, מספר עמודות ואופן פריסה.
- גם אם הקו המפריד הוא דקורטיבי, הוא עשוי לכלול margin, border או גובה שמשנים את האזור. יש לכלול אותו במדידה ולבדוק את מיקומו ביחס לכותרת, להערות ולגוף העמוד.
- יש למפות בנפרד הערות שוליים, הערות סיום, הערות צד, כותרות/עיטורי אזורי הערות, מספרי הערות, קווי הפרדה וסגנונות פריסה מרובי-עמודות/רציפים. אין להסיק שמדידת הערות שוליים מכסה אוטומטית הערות סיום או הערות צד.

**שרשרת עיקרית:** תור ההערות + הגדרות סגנון/עמודות + רוחב מארח → בניית probe באותו הקשר CSS → גובה חזוי → הקצאת מקום בעמוד → רינדור בפועל → השוואת חזוי/בפועל → תיקון או דיווח.

### 3.6 הערות צד

- הערות צד קשורות לעוגן בפסקה ולמיקום הפסקה לאחר איזון/מתיחה.
- ב-`typesetter.js` קיים `repositionBlockNotes(...)`, הנקרא לאחר התאמות גובה הטורים בשלב הטיפול בסוגריים חוצי-פסקאות.
- כל שינוי גובה של פסקה או טור חייב לעדכן/לאמת את מיקום הערת הצד. יש לבדוק חפיפה בין הערות, חריגה מהמרזב, חפיפה לכותרות/עיטורים ולשכנות בין עמודים.

### 3.7 סוגריים חוצי-פסקאות ושינויים לאחר העימוד

- `applyCrossParagraphParens(container)` מופעל לאחר העימוד ומוסיף עטיפות `.paren-text` לפסקאות שנמצאות בתוך סוגריים שנפתחו בפסקה קודמת.
- הקוד עצמו מציין שהגופן הקטן יותר משנה את גובה הטורים ופוגע באיזון; לכן מתבצע לאחר מכן איזון נוסף בעזרת `justifyColumnVertically` / `shrinkColumnVertically`, ואחריו `repositionBlockNotes`.
- זהו סימן לכך שחלק מהמידע הגיאומטרי משתנה אחרי החלטות הפריסה. ב-V23 אין להסיר את התיקון שעובד ב-V21 לפני שיש חלופה שנבדקה על fixture הארוך. היעד הארכיטקטוני הוא להעביר את הסגנון/המדידה לשלב שלפני בחירת שבירות, או להגדיר במפורש שלב reflow נוסף עם invalidation של כל התלויות.

## 4. מפת שלבי העיבוד

| שלב | קלט | פלט/החלטה | תלות שחייבת להיות מפורשת |
|---|---|---|---|
| A. פענוח מסמך | טקסט גולמי, מטא-נתונים, כותרות, סמני הערות | מבנה מסמך וסדר רכיבים | היררכיית כותרות, גבולות פרקים/חלקים, מזהי עוגנים |
| B. פתרון סגנונות | הגדרות UI, CSS, גופנים, עיטורים, תפקידי עמוד | סגנון אפקטיבי לכל רכיב | גופן/גודל/line-height, margins, borders, רוחב, מצב עמוד זוגי/אי-זוגי |
| C. מדידה | מבנה + סגנונות + הקשר מארח | מידות בלוקים, שורות, אזורי הערות ועיטורים | אותו DOM/CSS או מודל מדידה שקול לזה של הרינדור הסופי |
| D. תכנון פריסה | מידות זמינות, גבולות פרק, כללי שבירה | שיוך לעמוד/טור, מעברי רוחב מלא, מקום להערות | widow/orphan, כותרות בתחתית, איזון, שורות דלילות, מגבלות עמוד |
| E. רינדור | תוכנית פריסה | DOM סופי | לא לבצע שינוי גיאומטרי סמוי לאחר שלב זה |
| F. אימות | DOM מרונדר + תוכנית חזויה | דוח חריגות והפרשי מדידה | containment, overlap, overflow, איזון, עיטורים, כותרות, קווים, הערות |
| G. תיקון/פריסה חוזרת | חריגות מסוג בר-תיקון | תוכנית מעודכנת או שגיאה מדווחת | invalidation מפורש של מדידות ומטמון; גבול איטרציות |

## 5. מצב הכיסוי הנוכחי ב-`geometry-audit.js`

### בדיקות שכבר קיימות בקוד שנבדק
- חילוץ תיבות DOM ביחס ל-`#book-container` ושורות טקסט.
- הכלה של ילד בתוך הורה, חפיפת אחים, איזון גובה בין שני טורים.
- אלמנה/יתום לפי סוגי פסקה `p-cut` / `p-end`, ושורה אחרונה דלילה של `p-cut`.
- סיווג של שלד עמוד, גוף, אזור הערות, כותרות H2/H3, חלק מעיטורי הכותרות, בלוקים חד/דו-טוריים, קו מרזב וסמני הערות.

### פערים/סיכונים שיש לאמת ולתקן
1. **כותרת עליונה:** הסיווג מחפש `.page-header`, בעוד יצירת העמוד מייצרת `.top-header-grid`; יש להוסיף זיהוי מפורש ולוודא ירידה לעמודות ולתוכן.
2. **עיטורי כותרת עליונה:** לבדוק בנפרד את `.header-ornament-wrap`, SVG, גבולות תיבה וחפיפה לטקסט/מספר עמוד. אין להסתפק בתיבת הכותרת בלבד.
3. **עיטורי כותרת הערות:** להוסיף סיווג מפורש ל-`.note-header-ornament-right/left` ולוודא שהם נכללים בעץ הבדיקה.
4. **קווי הפרדה:** לבדוק קו הערות (הנוצר ב-`buildNoteRuleElement`) וקו בין הטורים, כולל margin/border/position ויחס לתוכן. סיווג לפי `note-rule` קיים, אך יש לוודא שהוא תואם למחלקות בפועל.
5. **מדידה חזויה מול בפועל:** להשוות גובה `.footnote-area` בפועל לתוצאה של `measureFootnoteAreaHeight`, ולדווח על שגיאה מוחלטת/יחסית עם סף מוגדר.
6. **רכיבים ממוקמים/אבסולוטיים:** להפריד בדוח בין גיאומטריה שתורמת לזרימה לבין תיבות חזותיות; לא לסמן חפיפה מכוונת של עיטור ככשל בלי כלל ייעודי.
7. **כותרות ומעברים:** בדיקות keep-with-next (לפחות שתי שורות אחרי כותרת), מעבר H3 ברוחב מלא, ועיטורים שנחתכים או גולשים.
8. **כותרת/מספור מול גוף:** לבדוק הפרדה אנכית בין header, body ו-footer וכן מספור חיצוני משולב בכותרת.
9. **זיהוי יציב:** מזהי audit לא צריכים להיות אקראיים אם רוצים להשוות דוחות בין ריצות; עדיף path + page index + class + ordinal יציב.
10. **ביצועים:** ב-fixture של מיליוני תווים, למדוד זמן חילוץ/בדיקה ולהימנע מבדיקת כל זוג אחים ללא צורך באזורים גדולים.

## 6. כללי מדידה מחייבים

- למדוד את ה-DOM אחרי שהגופנים נטענו ו-layout התייצב; לתעד מצב/רוחב viewport וגרסת CSS.
- לכל רכיב להפריד בין: `flowContribution` (השפעה על זרימה), `visualRect` (תיבה חזותית), `anchorRect` (נקודת עיגון) ו-`collisionPolicy` (אילו חפיפות מותרות).
- אין להשתמש בגובה טקסט בלבד כתחליף לגובה הכולל של wrapper המכיל margin, padding, border, כותרת, קו או עיטור.
- כל שינוי בגופן, רוחב, line-height, קנה מידה, עיטור או סגנון הערות מבטל את מדידות המטמון שתלויות בו.
- יש לשמור ערכי חזוי/בפועל והפרש בפלט audit, ולא רק לתקן בשקט.
- אלמנטים אבסולוטיים נבדקים לחפיפה ולגבולות גם אם אינם משתתפים בחישוב גובה הזרימה.

## 7. תכנית ביצוע הדרגתית בענף V23

### שלב 0 — הקפאת baseline
- להשאיר את קוד הפריסה של V21 ללא שינוי בתחילת העבודה.
- לוודא ש-`V23` נוצר מ-`V21` ולתעד commit בסיס.
- להשתמש בקובץ `very_long_test_text.txt` שהועלה לשיחה כ-fixture המקומי. הקובץ בגודל כ-3.39MB לפי מערכת הקבצים; אין צורך להכניס עותק נוסף ל-repository בשלב המיפוי.
- לשמור תוצאות baseline: מספר עמודים, זמן עימוד, דוח audit, חריגות גיאומטריות, איזון טורים, מדידות הערות, קונסול/שגיאות. טרם בוצעה כאן ריצת דפדפן, ולכן אין תוצאות baseline מדומות.

### שלב 1 — השלמת מפת הגיאומטריה ובדיקת ה-audit
- להוסיף סיווג/ירידה מפורשים לכותרת העליונה, לעיטורי כותרות ולעיטורי כותרת הערות.
- לוודא התאמה בין מחלקות שנוצרות ב-`typesetter.js` לבין המחלקות ש-`geometry-audit.js` מזהה.
- להוסיף בדיקות header/body/footer, קווי הפרדה, עיטורים, מדידת הערות חזויה/בפועל ומעבר בלוקים חד/דו-טוריים.
- להבחין בין כשל קשיח, אזהרת איכות וחפיפה מכוונת.

### שלב 2 — רישום תלות המדידות
- ליצור טבלת תלות מפורשת למטמון המדידות: קלטים, מפתח cache, נקודות invalidation וצרכנים.
- להוסיף לכל שינוי גיאומטרי post-layout תיעוד של מה משתנה ואילו חישובים חייבים לחזור.
- לשמר את תיקון הסוגריים החוצי-פסקאות של V21 עד שהחלופה עוברת בדיקות רגרסיה.

### שלב 3 — ריכוז תכנון הפריסה
- להפריד בהדרגה בין פתרון סגנונות, מדידה, החלטת שבירות, רינדור וביקורת.
- לא לפרק את `typesetter.js` למודולים רק על בסיס גודל הקובץ; תחילה מגדירים חוזי קלט/פלט בין השלבים.
- להעביר שינויים בגופן/עטיפות שמשפיעים על גובה אל לפני בחירת שבירות ככל האפשר; אם נדרש reflow, לבצעו כשלב מוגדר ומוגבל.

### שלב 4 — רגרסיה ואימות
- להריץ את ה-fixture הארוך ולבדוק לפחות: כותרות עליונות מתחלפות, מספר עמוד בכותרת/בתחתית, עיטורי H2/H3, כותרת H3 ברוחב מלא בין טורים, קווי הפרדת הערות וטורים, הערות שוליים מרובות-עמודות, הערות צד, סוגריים החוצים פסקאות, תוכן עניינים, עמודי פתיחה/סיום.
- להריץ פעמיים באותן הגדרות ולהשוות מספרי עמודים, שבירות, מיקומים והדוח; הבדלים לא מוסברים הם כשל דטרמיניזם.
- להשוות את V23 ל-V21 באותן הגדרות. אין לשנות את baseline או להסיר תיקון שעובד בלי לתעד את ההבדל ולהוכיח שאין רגרסיה.

## 8. סדר עדיפויות

1. **כיסוי מלא ב-audit** — במיוחד header grid, עיטורים וקווי הפרדה.
2. **מדידות עקביות** — predicted vs actual, כולל אזורי הערות וכל התוספות הגיאומטריות.
3. **תלויות ושינויי post-layout** — להגדיר invalidation ו-reflow.
4. **איכות שבירות** — איזון, אלמנות/יתומים, כותרות בתחתית ושורות דלילות.
5. **מודולריזציה** — רק לאחר שהשלבים והחוזים ברורים.

## 9. קישורים למקורות

- [typesetter.js — V21](https://github.com/SUGINACH/IMUD_TORANI/blob/V21/typesetter.js)
- [geometry-audit.js — V21](https://github.com/SUGINACH/IMUD_TORANI/blob/V21/geometry-audit.js)
- [renderer.html — V21](https://github.com/SUGINACH/IMUD_TORANI/blob/V21/renderer.html)
- [קובץ בדיקת העימוד — הועלה לשיחה](https://github.com/SUGINACH/IMUD_TORANI/raw/refs/heads/V21/very_long_test_text.txt)



## 10. יכולת ביקורת גיאומטרית אוטומטית ללא שימוש ידני במרנדר

### היעד

לאפשר להפעיל בדיקה מלאה של מסמך דרך פקודה אחת, בלי לפתוח את ממשק המשתמש, בלי להדביק טקסט בעורך ובלי ללחוץ על כפתורי המרנדר. הבדיקה צריכה להשתמש באותם כללי audit ובאותה פרשנות גיאומטרית כמו `geometry-audit.js`, ולשמור תוצאות לקובץ כדי שאפשר יהיה להשוות ריצות וגרסאות.

**הבהרה טכנית:** שקילות מלאה ל-`geometry-audit.js` מחייבת מנוע layout שמחשב בפועל את ה-DOM/CSS, שבירת השורות, הגופנים והמידות. לכן המימוש המומלץ הוא Chromium headless אוטומטי. הוא משתמש באותו מסלול רינדור ברקע, אבל אינו דורש שימוש ידני ב-`renderer.html`. בדיקה סטטית טהורה ללא מנוע layout יכולה להשלים בדיקות מבניות, אך אינה יכולה לחשב באופן אמין חפיפות, שורות, איזון טורים או גובה אזור הערות, ולכן אין להציג אותה כתחליף מלא.

### ארכיטקטורה מוצעת

1. **CLI / runner** — פקודה מקומית המקבלת נתיב לקובץ טקסט, קובץ הגדרות אופציונלי, נתיב פלט וסוג בדיקה.
2. **Headless browser adapter** — פותח את סביבת הרינדור המבודדת ב-Chromium ללא חלון גלוי, טוען את אותו `style.css`, `decorations.js`, `typesetter.js`, `settings-manager.js`, `app.js`, `renderer-bridge.js` ו-`geometry-audit.js`.
3. **Input adapter** — מזין את קובץ הטקסט והגדרות דרך API בדיקה מפורש, במקום להסתמך על פעולות ידניות או על מבנה פנימי מקרי של ממשק המשתמש.
4. **Render completion barrier** — ממתין לאישור מפורש שהעימוד הסתיים, שהגופנים הרלוונטיים נטענו ושאין עוד שינוי layout בתור. אין להסתמך רק על השהיה קבועה.
5. **Audit API** — מפעיל את אותם שלבי חילוץ/בדיקה שקיימים ב-`geometry-audit.js`, ללא overlay חזותי כברירת מחדל. overlay יכול להישאר אפשרות debug נפרדת.
6. **Report writer** — שומר JSON מלא ותקציר קריא (Markdown/טקסט): מספר עמודים, משך רינדור וחילוץ, ספירת חריגות לפי סוג/חומרה, פרטי רכיב ומיקום, והגדרות הריצה.
7. **Exit status** — קוד יציאה 0 כשעברו תנאי הקבלה, קוד שונה כשנמצאו כשלים, וקוד נפרד לכשל תשתיתי (למשל גופן שלא נטען או שגיאת JavaScript). יש להגדיר זאת באופן יציב ומתועד.

### API בדיקה מפורש

**ממצא נוסף מקריאת הקוד:** API גיאומטרי כבר קיים ב-`window.__geomAudit`: `extract()`, `audit(model)`, `paint(...)`, `clear()`, `cleanForExport(node)`. גם `renderer-bridge.js` כבר תומך בהודעות `geom-extract`, `geom-audit` ו-`geom-export`. לכן אין צורך להמציא בודק חדש; צריך לחשוף את ה-API הקיים לחוזה בדיקה יציב ולחבר אליו runner אוטומטי. עם זאת, API הגיאומטריה עצמו אינו מפעיל את `typesetDocument()` ואינו יודע מתי כל שלבי העימוד הסתיימו — אלה עדיין חלק מהעבודה. היעד הוא ממשק בדיקה מפורש בסגנון:

- `runTypesetForAudit({ text, settings })` — מזין טקסט והגדרות ומפעיל את `typesetDocument()`.
- `waitForTypesetComplete()` — מחזיר הצלחה/כשל רק לאחר סיום כל שלבי העימוד והעדכונים המאוחרים.
- `runGeometryAudit({ overlay: false })` — מחזיר את מודל הגיאומטריה ואת כל תוצאות הבדיקה, בלי להוסיף שכבות overlay לעמוד.
- `getFootnoteMeasurementAudit()` — מחזיר את ההשוואה בין מדידת אזור ההערות החזויה לזו שב-DOM, ככל שהמנגנון הקיים מספק אותה.
- `exportAuditReport()` — מפיק נתונים עם מזהים יציבים, גרסת קוד, הגדרות, מידות viewport/scale, סטטוס טעינת גופנים וזמני ביצוע.

אלו חוזי יעד ל-runner ולסנכרון; `window.__geomAudit.extract/audit/cleanForExport` ומנגנוני הודעות הביקורת הקיימים כבר קיימים, אך אין עדיין runner CLI מאומת שמפעיל אותם מקצה לקצה.

### שתי שכבות בדיקה

**A. גיאומטריה מלאה (headless Chromium):**
- מריץ את המנוע האמיתי ומחשב DOM/CSS, שורות, מידות, חפיפות וגלישות.
- מפעיל את כל בדיקות `geometry-audit.js`, כולל בדיקות הכיסוי שיוספו לעיטורים, כותרות עליונות, קווי הפרדה והערות.
- מייצר דוח JSON ודוח תקציר, ויכול להיכשל אוטומטית לפי ספי חומרה.
- זוהי שכבת המקבילה המלאה למרנדר הידני.

**B. בדיקות סטטיות מהירות (ללא browser):**
- בודקות שהקבצים והפונקציות הדרושים קיימים, שהמחלקות שמייצר המנוע מכוסות ב-audit, שהגדרות/קלטים תקינים, שאין שגיאות תחביר, ושמפת המחלקות מעודכנת.
- יכולות לבדוק קשרי נתונים, הגדרות ומטמון, אך אינן רשאיות לטעון שהן אימתו גיאומטריה אמיתית.
- רצות מהר לפני כל commit; שכבת Chromium רצה לבדיקות רגרסיה מלאות.

### שימוש מתוכנן

ממשק ה-CLI שנוסף ב-V23 (הקוד קיים, אך טרם אומת בהרצה מלאה):

```text
node tools/geometry-audit-cli.js --input ./very_long_test_text.txt --report ./artifacts/geometry-audit.json
node tools/geometry-audit-cli.js --input ./very_long_test_text.txt --settings ./path/to/settings.json --full-model
node tools/geometry-audit-cli.js --input ./very_long_test_text.txt --fail-on high
```

הפקודה הראשונה מפעילה את המרנדר ב-Chromium headless בלי פתיחה ידנית של ממשק המשתמש; יש עדיין לאמת את הריצה מקצה לקצה.

### תנאי קבלה

- [ ] ריצה מלאה מתוך שורת הפקודה ללא אינטראקציה עם ממשק המשתמש.
- [ ] אותה גרסת `geometry-audit.js` משמשת הן במצב ידני והן במצב CLI; אין להעתיק ולתחזק שני מימושים שונים של הבודק.
- [ ] אותה קלט/הגדרות/גרסאות קוד מפיקות תוצאות יציבות; מזהי האבחון אינם מבוססים על `Math.random()`.
- [ ] הדוח כולל את כל החריגות והמידות, ולא רק את מספר העמודים.
- [ ] שגיאות רינדור, טעינת גופנים או timeout מובחנות מבעיות גיאומטריה.
- [ ] ניתן לבחור ספי כשל: למשל כל `high` מכשיל, `medium` לפי הגדרה, ו-`low` נשאר אזהרה.
- [ ] ריצת fixture ארוך נמדדת בזמן ובזיכרון; הדוח נשמר גם אם נמצאו כשלים.
- [ ] ריצת אותו fixture פעמיים משווה מספר עמודים, מבנה שבירות, תוצאות audit ומידות עם סבילות מוגדרת.

### מגבלות ותכנון גופנים/נכסים

- כדי שהתוצאות יהיו אמינות, סביבת הבדיקה צריכה להשתמש באותם CSS, קבצי עיטור וגופנים או בתחליפים מקומיים מפורשים. אם גופן אינו זמין, יש לסמן את הריצה כלא-בת-השוואה ולא להסתיר את הבעיה.
- אם קיימים נכסים הנשענים על בחירת תיקייה מקומית, `file://`, או הגדרות ששמורות בדפדפן, יש להוסיף דרך להעביר אותם ל-runner בצורה מפורשת. אין להניח ש-Chromium headless יירש את הגדרות הדפדפן של המשתמש.
- יש למדוד זמן רינדור, זיכרון משוער ומספר רכיבים; בדיקת חפיפת כל זוג רכיבים יכולה להיות יקרה במסמך ארוך, ולכן יש לתחום השוואות לאזורים/אחים הרלוונטיים ולשמור את סמנטיקת הבדיקה.

### סדר מימוש

1. להשתמש ב-API שכבר קיים בסוף `geometry-audit.js` ובטיפול בהודעות `geom-extract` / `geom-audit` / `geom-export` ב-`renderer-bridge.js`; לא ליצור עותק שני של מנגנון הביקורת.
2. להפוך את חילוץ/בדיקת הגיאומטריה ל-API קריא ויציב, בלי תלות בהצגת overlay.
3. להוסיף אות סיום אמין ל-typesetting, כולל שלבים מאוחרים כמו `applyCrossParagraphParens`, איזון טורים, `fitColumnDividers`, עדכון מספרי עמודים ו-`applyHeadingOrnamentTextFit`.
4. [נוסף ב-V23] `tools/geometry-audit-cli.js` — runner headless שמזין fixture, מפעיל את ה-API הקיים ומייצא דוחות JSON/Markdown; יש לאמת אותו ב-CI.
5. [נוסף ב-V23] `package.json`, `.github/workflows/geometry-audit-cli.yml` ו-`tests/fixtures/geometry-audit-smoke.txt` לבדיקת smoke אוטומטית.
6. [בוצע בקוד, ממתין לאימות ריצה] `geometry-audit.js` הורחב לסיווג `.top-header-grid`, עמודות הכותרת, טקסט/מספור הכותרת ועיטורי כותרת ההערות; גם סדר זיהוי מספר הערה תוקן כך ש-`.note-line-num` לא ייבלע בסיווג הכללי של `.note-line`.
7. להריץ על `very_long_test_text.txt`, לשמור baseline ולהשוות אותו ל-V21.

## 11. תוצאות CI מאומתות (2026-10-22)

- בדיקת smoke ב-Chromium headless עברה.
- ריצת המסמך `very_long_test_text.txt` (3,387,848 bytes) ב-commit `42639f6bb6f2ed1bbe287b384a167c4144bb32b4` הסתיימה טכנית ללא שגיאות JavaScript: 601 עמודים, זמן עימוד כ-32 שניות.
- לפני העימוד נטענו במפורש 525 מתוך 525 אובייקטי `FontFace`; 0 נכשלו.
- התאמת מדידת הערות השוליים עברה: 62/62 אזורים הותאמו לתור המדויק, וכל הפערים שנמדדו היו 0px. בריצה קודמת, שבה הגופנים לא הוכנו מראש כראוי, נמדדו פערים עד 127px. זו ראיה לכך שיציבות מדדי הגופן הייתה גורם מרכזי לשגיאות מדידה ולשבירת עמודים.
- לאחר טעינת הגופנים, דוח האודיט כלל 235 ממצאים: 12 high, 99 medium, 124 low. לפי סוג: 162 containment, 12 imbalance, 45 widow, 10 containment-rounding, 6 sparse-line. הריצה נכשלה בסף `--fail-on high` בגלל 12 ממצאים חמורים; אין זו קריסת רינדור.
- הוסר `Math.random()` ממזהי צומתי הגיאומטריה. המזהים מבוססים כעת על מסלול העץ וסדר האחים, כדי שאותו DOM יפיק מזהים זהים.
- תיקון נוסף באודיט משנה את זיהוי אלמנות/יתומים: פסקה שלמה בת שורה אחת אינה מסווגת אוטומטית כאלמנה. האלמנה מוגדרת כשורה יחידה של פסקה נמשכת בראש טור; היתום כשורה יחידה של פסקה שנחתכה בתחתית טור. התיקון נמצא כעת בבדיקת CI ב-commit `b80eac41706be30779de4cc352fc2b55a83f4748`.

## 12. ממצאים פתוחים והגדרת יעד דטרמיניסטי

### ממצאים גאומטריים אחרי ייצוב הגופנים

- 10 חריגות חמורות הן `.block-2col` שגולשים מתיבת `.page-body-flow`; בשני מקרים נוספים `.side-note` גולש מתיבת `.margin-notes-column`. החריגות הגדולות ביותר הן 105px ו-135px, ולכן אינן שגיאת עיגול.
- 12 ממצאי imbalance: 9 בינוניים בהפרש של 13–14px ו-3 נמוכים בהפרש של 6px. אלה פערים קטנים יחסית, אך יש לבדוק אם הם נובעים מהיעדר נקודת פיצול חוקית או מתקרות המתיחה.
- 45 ממצאי widow קודמים נבעו ברובם מסיווג שגוי של פסקאות קצרות שלמות. אין להשתמש במספר הזה כ-baseline לאיכות המנוע; ה-baseline החדש ייקבע לאחר ריצת `b80eac4...`.
- 6 שורות דלילות נשארו ב-`p-cut`, והן דורשות בדיקה לפי כללי השבירה ולא רק שינוי סף.

### תנאים לדטרמיניזם ולמיטוב

1. **סביבת מדידה קבועה:** גרסת Chromium, viewport, CSS, נכסים וגופנים ידועים; אין להתחיל מדידה עד שגופנים רלוונטיים נטענו או לסמן את הריצה כלא-בת-השוואה.
2. **קלט והגדרות קבועים:** אותו טקסט, אותם הגדרות וסדר טוקנים זהה.
3. **בחירה דטרמיניסטית:** כל החלטת פיצול משתמשת באוסף מועמדים מוגדר, פונקציית עלות מפורשת ושוברי שוויון יציבים. אין להסתמך על `Math.random()`, על סדר לא מוגדר או על מצב DOM שנשאר מניסוי קודם.
4. **אילוצים קשיחים לפני עלות רכה:** לא לגלוש מאזור הגוף/העמוד, לא לפצל כותרת מהטקסט הנדרש אחריה, לא ליצור שורת יתום/אלמנה, ולשמור על רצף התוכן. רק לאחר עמידה באילוצים ממזערים פערי גובה וריווח.
5. **אופטימום בר-בדיקה:** יש להגדיר במפורש את פונקציית העלות ואת תחום המועמדים החוקיים. שוויון מוחלט בגובה אינו תמיד אפשרי כאשר שורות/כותרות/בלוקים אינם ניתנים לפיצול; היעד המתמטי הוא הפתרון החוקי בעל העלות הנמוכה ביותר, לא הבטחה לשני טורים זהים בכל מצב.
6. **בדיקת חזרתיות:** להריץ אותו מסמך פעמיים באותה סביבת Chromium ולהשוות חתימת פריסה: מספר עמודים, גבולות עמודים, חלוקת טורים, מיקומי הערות, מידות ושגיאות audit. כל הבדל חייב להיות מוסבר או להיכשל בבדיקה.

### הפעולות הבאות

1. לקבל את ריצת `b80eac4...` ולחשב מחדש את מספר האלמנות/יתומים לאחר תיקון הסיווג.
2. להוסיף פרטי אב/עמודות לממצאי containment כדי לאבחן את עמודי הגלישה הגדולים, ואז לתקן את מנגנון חלוקת העמודים ולא להסתיר את החריגות.
3. לבדוק את 12 ממצאי האיזון שנותרו ולוודא שהבחירה בין מועמדים ממזערת פער תחת אילוצי קריאות ושבירה.
4. להוסיף בדיקת ריצה כפולה עם חתימת פריסה זהה, ולאחר מכן להשתמש בה כבדיקת רגרסיה.
5. כל שינוי נשאר ב-`V23`. אין למזג את `V23` ל-`V21`.

**מצב נוכחי:** המדידה המוקדמת של הערות השוליים תוקנה בריצת CI מאומתת. עדיין אין טענה שהמנוע הגיע לשלמות: יש 12 חריגות חמורות שטרם תוקנו, והבדיקה המתוקנת לאלמנות/יתומים ממתינה לריצה מלאה.\n

## 8. Audit coverage update — 2026-10-25

### 8.1 What the deterministic signature now captures

In `tools/geometry-audit-cli.js`, `captureLayoutSignature()` records each paragraph's:
- bounding rectangle;
- visual line bands, formed by merging inline `Range.getClientRects()` fragments that share a half-pixel top coordinate;
- computed typography that can change line breaking or appearance: font family/size/weight/style, line-height, letter/word spacing, text alignment and last-line alignment, direction, white-space, text indent, vertical margins and padding;
- existing class, token ID, continuation flag and raw text.

This extends the previous signature; it does **not** change pagination or balancing. The signature is still not a pixel-image comparison and does not prove that every painted property of every descendant is covered. In particular, CSS effects not represented by paragraph metrics or the existing `geometryNodes` selector may still require additional audit coverage.

### 8.2 Validation status (do not conflate stages)

- **Committed:** commit `14df96adf9bc24fa78c7f2ea7342e8f7957a9f8f` on `V23`.
- **Static parse check:** the fetched CLI source parsed successfully after removing its Node shebang for the in-process JavaScript parser.
- **Not yet confirmed:** GitHub Actions result, real `node --check` step result, long-document run, repeated-render hash equality, or audit artifact contents. The commit's combined status endpoint returned no statuses; that is not a passing CI result.
- **No layout algorithm changes** were made in this audit update.

### 8.3 Next verification gate

Before tuning balance thresholds or changing candidate selection, obtain the long audit report and compare:
1. candidate geometry recorded at selection time;
2. post-global-justify final geometry;
3. any local/global/page rollback diagnostics;
4. per-column paragraph and line rectangles;
5. repeat-render hashes.

The previously observed candidate/final height discrepancy (for example, candidate heights 293/307 px versus final 314/307 px) remains an unresolved diagnostic until reproduced in a current report. Do not label its cause proven based only on the presence of cross-paragraph parenthesis styling.

### 8.4 Decision-ledger completeness cross-check

Commit `77ddc5b60877850c4a7bd2092f9c0a7e1b0d00e5` adds an independently counted DOM total for direct `.page-body-flow > .block-2col` children and reports:
- `domBlockCount`;
- `recordCountMatchesDom`;
- `missingLedgerRecordCount`;
- `excessLedgerRecordCount`.

The Markdown summary exposes the DOM block count and whether it matches the number of serialized decision records. This is a completeness cross-check, not proof that every individual record is semantically correct; schema validation remains a separate metric. Runtime confirmation still depends on the long audit run.

### 8.5 Cross-paragraph-parenthesis geometry checkpoint

Commit `ac234a9e8e75a289ec8567c00e7050bbd3f82d65` adds a diagnostic snapshot immediately before and after `applyCrossParagraphParens(container)`. For each two-column block it records both columns' `scrollHeight`, column bounding height, outer block height, and paragraph-level height/Y/line-count/font-size/line-height/paren-span state. The per-block attribute `data-layout-cross-paren-diagnostic` includes before/after totals, deltas, and up to 40 changed-paragraph entries.

Commit `f6275c357cd74932200f232fdc81d54d48dbfbaa` exports this diagnostic into `geometry.layoutDecisionRecords` in the audit JSON and adds summary counts for blocks with geometry changes and blocks missing the diagnostic.

This creates a direct measurement point for distinguishing changes caused at the parenthesis-wrapping stage from later balancing stages. It is instrumentation only: no candidate selection, balancing threshold, text styling rule, or rollback decision was changed. The measurements still need to be confirmed on a real Chromium run.

### 8.6 Long input availability

The GitHub file-content wrapper returned an empty string for `very_long_test_text.txt`, but fetching the blob by its SHA returned 1,918,760 characters/bytes of non-empty Hebrew test text (the actual byte count is to be confirmed in CI with `wc -c`). The wrapper's empty path response was therefore a retrieval limitation, not evidence that the test fixture is empty. The workflow's `test -s` guard remains appropriate.

### 8.7 Parenthesis checkpoint extended to final geometry

Commits `faed0a8ba563e0309cacbbb62f2fd537beb86e79` and `979cc7865215dc934aff99ebafaf3139d58274cb` extend the parenthesis diagnostic through the final geometry snapshot, after global justification and side-note overflow correction.

The diagnostic now:
- preserves a compact per-paragraph snapshot from immediately after parenthesis wrapping;
- records final right/left column heights, column box heights and outer block height;
- calculates the height deltas between the post-parenthesis state and final state;
- counts paragraph geometry changes between those stages and retains up to 40 examples;
- uses diagnostic schema version 2, which the CLI now requires for a complete checkpoint;
- separately counts blocks whose final diagnostic capture threw an error.

The report summary distinguishes changes during parenthesis wrapping from later geometry changes. A non-zero post-global delta does **not** by itself mean the layout is wrong: global justification is expected to change some paragraph heights. The diagnostic is intended to correlate those changes with final fit, column balance, and rollback data. Runtime evidence is still required before drawing causal conclusions.

### 8.8 Verified long-document baseline before schema-v2 final-stage instrumentation

GitHub Actions run [40141867916](https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40141867916), for commit `ac234a9e8e75a289ec8567c00e7050bbd3f82d65`, completed successfully at the workflow level. The job log confirms:
- input fixture size: `3,387,848` bytes;
- 627 pages rendered;
- 55 geometry-audit findings: 0 high, 20 medium, 35 low;
- issue kinds: 30 containment, 17 imbalance, 4 containment-rounding, 4 sparse-line;
- repeat-render determinism: **PASS**, with no differing page;
- report artifact uploaded successfully.

This is a verified baseline for the code at `ac234a9`, which predates the schema-v2 post-global checkpoint. It does not establish that the newer schema-v2 instrumentation has completed its long run, and it does not mean all geometry findings are resolved. The workflow's success here means the configured `--fail-on high` gate passed; 55 lower-severity findings remain for diagnosis.

### 8.9 Separate geometry deltas from style-only deltas

Commit `a262be3c408f9deeab7b32bfbc1cd50ff52e4fad` extends the parenthesis-stage paragraph snapshot to include merged visual-line rectangles, not only line count. A paragraph is now classified as geometrically changed if its vertical position, height, line count, or line rectangles changed; style-only changes (font size, line height, or presence of `.paren-text`) are counted separately. The same distinction is applied between the post-parenthesis state and the final post-global/post-side-note state.

Commit `db1a7d6b43512bb2d991f47e71f533349523ad27` updates the CLI summary to report geometry-changing blocks separately from style-only blocks at both stages. This prevents a newly added `.paren-text` wrapper from being reported as a geometry change merely because the style marker changed.

These are diagnostic refinements only. They do not alter layout selection, justification, rollback, or CSS. The latest long-run must validate that the added line-rectangle snapshots remain within acceptable runtime and memory costs.

### 8.10 Prevent redundant concurrent audit runs

Commits `973212cff9f1caf6b34ba2a7172e346935f3bf92` and `504329cab98936826f596dd2c115ce6813553241` add workflow-level concurrency groups to the long-document audit and CLI smoke audit. New runs on the same ref cancel superseded runs instead of competing for Chromium downloads and CPU/memory while testing obsolete commits.

This is CI orchestration only. It does not change the layout engine or the audit acceptance thresholds. The newest commit still requires a completed long-document run and inspection of its report.

### 8.11 Make audit instrumentation integrity a hard gate

Commit `9cf55c8dfa84dca6b414ec312ea1f8614464abff` adds a separate integrity gate in the CLI. The report and console now explicitly say whether instrumentation integrity passed. The process exits with code 4 if any of the following occur:
- decision ledger count does not match the independently counted direct two-column DOM blocks;
- one or more decision records are missing or malformed;
- one or more schema-v2 parenthesis diagnostics or their final snapshots are missing;
- parenthesis diagnostic capture throws;
- the parenthesis diagnostic's final column/block heights disagree with the separately exported final geometry by more than 0.5px.

This is independent of the configured geometry severity threshold (`--fail-on`). A run may have zero high-severity layout findings and still fail if its own measurement/reporting pipeline is incomplete or internally inconsistent. Browser errors and nondeterminism retain their separate exit codes.

### 8.12 Surface diagnostic counters in CI logs

Commit `b54961e182267ebfaf77e714893873c49295a961` prints the ledger/DOM parity, valid/malformed record counts, complete parenthesis diagnostic count, geometry-changing versus style-only block counts, post-global changes, final-snapshot mismatch count, and diagnostic-capture errors directly in the workflow log. This avoids having to infer instrumentation status from the audit severity totals or download the JSON artifact merely to see these counts.

### 8.14 Verified smoke test for instrumentation integrity gate

GitHub Actions run [40142356794](https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40142356794) completed the three-page smoke fixture successfully on the CLI/integrity-gate code before the later in-memory snapshot optimization:
- 3 pages; 0 geometry findings;
- decision ledger: 1 record / 1 DOM block; parity PASS; 1 valid record, 0 malformed;
- parenthesis diagnostics: complete 1/1;
- geometry-changing blocks: 0; style-only blocks: 0;
- post-global geometry changes: 0; post-global height deltas: 0;
- final-snapshot mismatches: 0; capture errors: 0;
- repeat-render determinism: PASS;
- audit instrumentation integrity: PASS.

This verifies the hard gate and its console counters on the smoke fixture. The later `a7759009...` in-memory snapshot optimization still needs its own smoke and long-document runs.

### 8.15 Verified smoke test after in-memory snapshot optimization

GitHub Actions run [40142401962](https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40142401962), checked out at commit `a77590094012d1a0d97688de219f2fb4e0d0b170`, completed the smoke test successfully after the full paragraph snapshots were moved from DOM attributes into an in-memory map. The log confirms:
- 3 pages; 0 geometry findings;
- ledger/DOM parity PASS; 1 valid record, 0 malformed;
- parenthesis diagnostics complete 1/1;
- no geometry/style changes, post-global deltas, final-snapshot mismatches, or capture errors on this fixture;
- repeat-render determinism PASS;
- instrumentation integrity PASS.

This verifies the memory-storage refactor on the smoke fixture. The corresponding long-document run is still pending/running and is the necessary performance and full-document check.

### 8.16 Local final-justify overshoot: reproduced and corrected

Analysis of the long-document report from run `40142215120` reproduced the earlier candidate/final discrepancy on page label `לג`:
- selected candidate: right `293px`, left `307px`;
- local final-justify target: `307px`;
- final before the patch: right `314px`, left `307px`;
- parenthesis-stage deltas: `0/0px`.

The cause is not the parenthesis wrapper in this case. `justifyColumnVertically()` overshot the target while distributing padding and line-height; local final justification previously checked only page-fit overflow, not whether the target column overshot its target. The later global pass attempted another correction but rolled it back.

Commit `647cdd719e271b740ff730396b91d715a40031c8` adds a local overshoot correction: after stretching, if the target column exceeds the requested height, it calls `shrinkColumnVertically()` to remove the overshoot. It also rolls back the local adjustment if it worsens absolute column imbalance or violates the existing hard-fit constraint. The attempt, target, before/after heights, overshoot before/after shrink, and rollback reason are recorded in DOM attributes.

Commit `88a41b1846c45f9dc06abf3ae963b47972d1655a` exports those local final-justify details into each decision record. Commit `590306126c9e08c1586322e903b191fb4b9fff90` adds audit counters for attempts, corrected/remaining overshoots, rollbacks, and balance-improved attempts.

The three-page smoke fixture passes with the updated algorithm and reports one final-justify attempt, no overshoot, no rollback, and improved balance. The long-document run for this algorithm change is still running; no claim is made yet that the 627-page imbalance count has decreased.

### 8.17 Residual imbalance after light-justify cap

The latest long report still has one medium imbalance: page label `תקיג`, with a single paragraph split across the two columns (`114px` right / `94px` left). The left fragment was already at its line-height cap (`28.944px` against a base of `21.44px`), so the ordinary light-justify path could not close the remaining `20px` gap. The block had no decision-ledger candidate record because this path did not invoke `balanceColumns()`.

Commit `5832d6d368c6ee443b9c8b05c296c1b5a398a824` adds a deterministic fallback: after light justification, if a block still has an absolute column-height difference greater than `8px` and no balance search has already been run, invoke `balanceColumns()` using the measured available height minus the block's outer-box overhead. Residuals of `8px` or less are left alone to avoid stretching short final blocks merely to fill space.

This targets the unrecorded continuation block without changing the candidate scoring or balance thresholds for blocks that were already searched. Static JavaScript parsing passed; the smoke and long-document runs for this fallback are pending.


## 8.18 Running-header containment: measured follow-up (2026-10-25)

The long-document audit for commit `743226a9ce25b04e1ddc308d7c02166f8dc60a19` completed successfully:
- 627 pages; 850 decision records and 850 direct DOM blocks; ledger parity PASS.
- Repeat-render determinism PASS; instrumentation integrity PASS.
- 48 findings: 0 high, 16 medium, 32 low.
- The prior `line-height: 1` adjustment did **not** resolve the repeated running-header containment issue. On pages 232–236, 535–538 and 586–592, the affected `.header-col-c` box remained 29px tall against a 26px parent, with measured top overflow of about 3.6–3.7px (previous baseline: about 4px). This disproves the hypothesis that line-height alone was sufficient.

Commit `2c996ce74be463ee622058b8051e53cb1aa1478c` adds a bounded 22px box to all three header columns, matching the header's nominal content box (26px row minus 3px bottom padding and 1px divider), and applies single-line ellipsis to `.hdr-txt`. This is a **new hypothesis under test**, not a confirmed fix. The next long-document run must verify:
1. the header containment findings disappear;
2. no text or ornament clipping/regression is introduced;
3. page count remains 627 and repeat-render determinism remains PASS;
4. ledger/DOM parity and instrumentation integrity remain PASS;
5. total issue counts and all non-header issue classes are compared with the 48-finding baseline.

Do not adjust audit thresholds to hide the findings. If the header issue persists, inspect the exact ornament/content node and its rendered rectangle rather than adding further generic line-height changes.


## 8.19 Full balance-candidate ledger (2026-10-25)

The long audit after the running-header fix removed the 16 repeated header-containment findings (48 total findings became 32; medium findings became 0), while retaining 627 pages, 850/850 decision-ledger parity, repeat-render determinism, and clean runtime error lists.

The remaining 9 imbalance findings include a recurring short-block pattern: right column 71px, left column 65px, while the chosen candidate's pre-justify geometry was 71px vs 50px (diff 21px), and final vertical justification reduced the residual gap to 6px. The existing decision record exposes only the winner; it cannot explain whether a better legal alternative existed or why alternatives lost.

Commits `8c2638863ebd7baac0a3f587d120bdbea016673e` and `ec76d68a0171b120dfa3c646e0c60107dd1fdc22` add a complete, ordered candidate table to the decision record for every evaluated split. Each entry records candidate index, split item/line, measured right/left heights, signed/absolute difference, fit and widow/orphan validity, overflow, partial-paragraph line counts, and the exact lexicographic score used by `better()`. The table is diagnostic metadata only and must not change the chosen candidate.

Next audit gate:
1. Confirm the long audit still passes and the ledger remains deterministic.
2. Inspect the candidate table for the repeated 71/65px blocks and the page-231 (reported as page 230 in the human-facing summary) 5px residual.
3. Verify that the selected candidate is the true optimum under the documented priority order; do not assume minimum absolute difference overrides hard fit or widow/orphan validity.
4. Only then decide whether the remaining difference is an algorithm defect, a deliberate widow/orphan trade-off, or a stretch-capacity limit. Do not change the comparator or thresholds before the candidate evidence is reviewed.


## 8.20 Candidate-table audit gate correction (2026-10-25)

The long-document run `40167956770` completed successfully on source commit `8c2638863ebd7baac0a3f587d120bdbea016673e`, but its JSON output contains zero decision records with `selection.candidateTable`. The CLI parser that copies the candidate-table DOM attribute into the ledger was committed later (`ec76d68a0171b120dfa3c646e0c60107dd1fdc22`). Therefore this run verifies the base layout and prior instrumentation, but does **not** verify candidate-table persistence.

Required gate: rerun the long-document audit against the current `V23` HEAD, then assert all of the following from the emitted JSON, not only from workflow exit status:
- 627 pages, 850 decision records, 850 DOM blocks, and parity PASS;
- repeat-render determinism and instrumentation integrity PASS; no runtime/console errors;
- for every record whose selection status is `evaluated`, candidate-table length equals `candidateCount`, every candidate score matches the comparator tuple, and `selectedCandidateIndex` points to the recorded winner;
- the candidate table is present in both repeated renders and does not alter issue counts or selected layout geometry versus the prior run on the same source state.

Do not diagnose or alter the balance algorithm until this gate passes. This is an audit correction, not a layout-algorithm change.


## 8.21 Verified full audit with routing and stretch-capacity diagnostics (2026-10-25)

The long-document audit for commit `0f716014420d36a8c6f895e6382dc7ba77e98d86` completed successfully in GitHub Actions run `40184847298` (artifact `12595317843`). The smoke workflow `40184847280` also completed successfully on the same source state.

Verified directly from `geometry-audit-summary.md` and `geometry-audit.json`:
- 627 pages; 850 decision records; 850 direct two-column DOM blocks; ledger/DOM parity PASS.
- All 850 records valid; no missing/malformed records.
- Repeat-render determinism PASS; instrumentation integrity PASS.
- Runtime page errors and console errors: 0.
- Footnote measurement: 60/60 exact queue matches; maximum absolute discrepancy 0px.
- Findings unchanged at 32 LOW: 14 containment, 9 imbalance, 5 sparse-line, 4 containment-rounding.
- Routing is fully classified: 381 `evaluated/balanceColumns`, 469 `not-requested/light-justify`; no `pending` or `routing-pending` records.
- All 381 evaluated records have a candidate table with length equal to `candidateCount`; selected candidate and selected score match the candidate table in all 381 records.
- Capacity snapshots are present for all 381 evaluated records.

### Proven short-block capacity result

For the seven recurring short-block imbalance findings (page indexes 236, 272, 326, 502, 533, 534, 603):
- Candidate split geometry is 71/50px or 50/71px (absolute pre-justify difference 21px); both symmetric candidates are valid and have the same primary score. The deterministic tie-break selects the 71px right-column candidate.
- The short/left column has two lines and a measured remaining line-height capacity of 15.008px (7.504px per line), with no paragraph-gap capacity.
- Final justification reaches 65px or 66px, leaving a 6px or 5px difference. The recorded overshoot values remain negative (-6px or -5px), meaning the requested 71px target is beyond the current stretch cap.
- This establishes a current policy/capacity limitation, not a candidate-table/comparator mismatch. Do not simply increase the cap: first define the acceptable typography/stretch bounds and add a regression fixture for these exact blocks.

### Light-justify threshold mismatch is explicit

The audit flags imbalance at an absolute residual greater than 4px, while the light-justify policy intentionally accepts residuals up to 8px. There are 21 records with a recorded residual between 5px and 8px; two reported findings are page indexes 230 (5px) and 589 (5px). This is a documented policy/measurement-threshold mismatch, not an instrumentation failure. Keep the raw residuals visible. Before changing the threshold or policy, decide whether the audit should distinguish a policy-accepted residual from an actual balance defect; do not suppress the evidence by globally raising the threshold.

### Remaining geometry findings and next diagnostic focus

The 14 containment findings are not all a single class:
- Some blocks overflow the body-flow by 1–4px even without a page-final-justify diagnostic.
- At page indexes 83, 137, 473 and 492, the late page-final-justify pass records an attempted increase in outer/inner height and restores the pre-attempt DOM state. The recorded attempted outer heights are about 918.9px, 331.2px, 923.1px and 925.8px respectively. The audit still detects the underlying block extending past body-flow, so rollback of that late pass alone is not a complete containment fix.
- Larger late-page cases at page indexes 525 and 609 occur after preceding heading/spacer geometry or a chapter-start offset. These need a coordinate/available-height accounting audit, not a generic CSS overflow clip.
- The four note-marker containment-rounding findings are small vertical excursions around 1.3px. Verify actual glyph/line-box geometry before deciding whether they are true paint overflows or a known fractional metric tolerance.
- The five sparse-line findings remain separate from vertical column balance and require a line-breaking / paragraph-tail policy review.

## 8.22 Ordered completion plan and release gates

Work remains on `V23` only. Do not merge `V23` into `V21`.

The following gates are sequential. Do not proceed to algorithm tuning while a preceding gate fails.

1. **Measurement integrity gate — PASS for commit `0f716014`.** Keep syntax + smoke + long audit, ledger/DOM parity, candidate-table consistency, repeat-render determinism, zero runtime errors, and complete routing as mandatory checks.
2. **Containment root-cause gate — IN PROGRESS.** Classify each of the 14 findings by the first stage at which the outer block exceeds its reserved body-flow interval: initial block construction, local justification, post-fit fallback, page-bottom stretch, orphan reclamation, late page-final justification, note repositioning, or heading/spacer reservation. Capture before/after rectangles and the relevant `actualAvailH`, `remPageHeight`, body-flow bounds and outer-box overhead. Fix the earliest causal stage; do not clip overflow or raise tolerances.
3. **Short-block balance policy gate — OPEN.** Decide the permitted line-height cap and acceptable residual for short blocks; preserve the candidate score ordering. Add a regression test proving the selected candidate, 15.008px capacity, and final residual for the seven recurring cases.
4. **Sparse-line / widow-orphan gate — OPEN.** For each of the five sparse-line findings, record paragraph source text, legal breakpoints, line widths and rejected alternatives. Enforce paragraph-tail and widow/orphan rules without creating a worse column split.
5. **Note-marker geometry gate — OPEN.** Compare marker painted bounds, inline line boxes and baseline metrics; use a tolerance only if it is justified by measured browser fractional layout, and keep it distinct from actual text overflow.
6. **Full geometry inventory gate — OPEN.** Audit all layout-affecting descendants, not only paragraph boxes: ornaments, running headers, dividers, note separators, footnote/endnote regions, headings, page numbers, and decoration elements. Verify that each component has an explicit geometry owner, measured bounds, and a clear relationship to the page's reserved flow area.
7. **Regression and release gate — OPEN.** Run the short smoke fixture, the 1.9MB+ long fixture, repeated render, and targeted regression fixtures for cross-column/page parentheses, heading transitions, footnotes, short final chapters, notes, sparse tails and containment. Compare page count, deterministic signature, issue inventory, and visual output against the preceding accepted baseline. No stage is complete solely because the workflow exits 0.

A stage is accepted only when its specific hypothesis is confirmed by the report and the complete test suite shows no new regressions. Keep unresolved findings in the report; never relabel them as fixed based on severity alone.


## 8.23 Gate update — strict containment and stage trace verified (2026-10-25)

This section supersedes the status labels in §8.22 where they still say containment is in progress. The sequential audit on source commit `14d4d667a11ad0e4b2131af856089a34aa6f0e80` completed successfully in long-document run `40187349255`; the current follow-up commit `0269d5ac7fe7c43a0dfee3fb4e87fb48d67c4bf2` adds further containment-stage fields to the audit model and is undergoing its own long-document rerun (`40188170820`). The smoke workflow for `0269d5ac` passed (`40188170815`).

### Proven on the completed staged-geometry audit

- 854/854 decision records and 854/854 DOM blocks; all records valid; parity PASS.
- Canonical final-stage snapshot: 854/854; missing snapshots 0; capture errors 0.
- Repeat-render determinism PASS; parenthesis final-snapshot mismatches 0; runtime/console errors 0.
- Candidate-selection audit PASS: 389 evaluated records, 389 candidate tables, 389 before/after capacity snapshots; no candidate-table or score failures.
- For the 854 canonical final snapshots, maximum measured block bottom overflow was 0.375px; blocks exceeding 0.5px: 0.
- After orphan reclaim, maximum measured block bottom overflow was 0.375px; blocks exceeding 0.5px: 0.
- Final containment findings: 0. The CLI diagnostic gate reports `passed=true`, with no failures.
- Footnote measurement: 60/60 exact matches, maximum absolute difference 0px.
- Final audit inventory: 19 LOW findings: 10 imbalance, 5 sparse-line, 4 containment-rounding. No HIGH or MEDIUM findings.
- Stage capture coverage: postfit 779; before/after page stretch 533 each; after orphan reclaim 535; after page-final justify 44; canonical final 854.

### Important regression question remains open

The earlier baseline was 627 pages / 850 blocks; this staged, strict-fit run is 629 pages / 854 blocks. The strict-fit gate demonstrates no measured final or post-orphan-reclaim overflow above 0.5px, but it does **not by itself prove text conservation or establish that the +2 pages are an acceptable pagination change**. Do not call the entire engine regression-clean yet. Next gate is content conservation and layout-delta attribution:
1. Verify the exact input hash/byte count is identical between the accepted baseline and current audit.
2. Verify every source text token/paragraph is represented exactly once or has an explicitly documented split/continuation relation; check first/last token, per-token coverage, dropped/duplicated text, and note markers.
3. Compare the 4 additional decision records to the exact pages/blocks introduced by the strict-fit/orphan-reclaim change; explain the two-page increase with a deterministic trace.
4. Repeat the audit at the same commit after the new containment-stage fields land. Do not compare screenshots or signatures from different commits as if they were identical baselines.

### Next issue-resolution order

1. **Content conservation + page-count delta (BLOCKING).** Must pass before accepting the containment fix.
2. **Residual column balance (OPEN).** 10 findings: seven recurring short blocks at 71/65–66px (current stretch cap leaves 5–6px), plus three other residuals. Preserve raw candidate tables and measured capacity; do not raise caps blindly.
3. **Sparse paragraph tails (OPEN).** Five findings, on report pages 58, 260, 316, 327, 550. Capture source paragraph, legal breakpoints, final-line width, and alternative split scores before changing line-breaking.
4. **Note-marker geometry (OPEN).** Four ~1.31px upward excursions. Measure painted glyph and line-box bounds; only then define a justified fractional tolerance.
5. **Complete geometry inventory + visual regression (OPEN).** Check ornaments, running headers, dividers, note separators, footnotes, headings, page numbers, and decoration elements against reserved page geometry. Include visual spot checks for the header ellipsis/clipping policy.
6. **Release gate (OPEN).** Smoke + long-document audit + determinism + ledger/DOM parity + candidate score audit + canonical-stage coverage + zero final containment overflow + content conservation + targeted fixtures for parentheses across columns/pages, headings, short final chapters, notes, sparse tails and page-end fill. Keep V23 separate from V21.

The audit currently proves a strong, measurable containment invariant, not yet complete engine correctness. Keep that distinction explicit in code, reports and worklog.


## 8.23 Reverified staged-geometry audit on commit `7bb3b9bacdc8d5b1f5d753404755ec572f939250` (2026-10-25)

Long audit run `40191571122` completed successfully; smoke run `40191571253` also passed. Artifact `12597768490` was downloaded and its JSON inspected directly.

### Hard gates

- Input: `very_long_test_text.txt`, 3,387,848 bytes.
- 629 pages; repeat-render determinism PASS. Both render hashes are `96bfe7ce5145aa1ae9f032b323d1cedd6abdf6350ffa84e400a3bcfa6838a2dd`.
- 854 decision records / 854 direct two-column DOM blocks; parity PASS; no malformed records.
- 389 evaluated decisions; 389/389 candidate tables complete; 389/389 capacity-before/after snapshots present; diagnostic gate PASS.
- 854/854 canonical final geometry snapshots; missing 0; capture errors 0.
- Stage coverage: postfit 779; before-page-stretch 533; after-page-stretch 533; after-orphan-reclaim 535; after-page-final-justify 44; canonical-final 854.
- In every recorded stage, the maximum block bottom overflow is 0.375px; zero stages exceed the 0.5px hard gate. Canonical final overflow count >0.5px = 0; orphan-reclaim overflow count >0.5px = 0; containment issue count = 0.
- Source conservation PASS: 3,081/3,081 paragraph token IDs rendered; missing 0; text mismatches 0; extra rendered IDs 0. All 524 headings preserved; all 2,043 side notes preserved with text/metadata matches. This fixture contains 0 end notes.
- Runtime/console errors 0; the long audit and smoke workflow both succeeded.

### Current issue inventory (not release-clean)

The audit has 19 LOW findings: 5 sparse-line, 10 imbalance, 4 note-marker containment-rounding. No HIGH or MEDIUM findings and no block containment findings.

The 10 imbalance findings split into:
- Eight balanceColumns residuals on very short blocks: seven at 71/65px and one at 71/66px. Capacity snapshots show the two-line column is already at its permitted line-height stretch cap; remaining capacity is effectively 0, and the residual is 5–6px. Candidate scoring and winner selection are consistent. Do not increase the stretch cap without typography evidence. Next decision: either (a) formally allow a small capacity-limited residual with an explicit diagnostic class and regression assertions, or (b) introduce a better non-distorting balancing policy and prove it improves the rendered baseline.
- Two light-justify residuals at 5px (pages 233 and 592). The existing light-justify policy explicitly accepts residuals up to 8px, while audit tolerance is 5px. This is a policy/audit classification mismatch. Preserve raw measurements and report these as policy-accepted separately from genuine balance defects; do not globally increase the audit tolerance.

The five sparse-line findings remain at pages 59, 261, 317, 328 and 551. Their measured last-line widths are respectively 30, 11, 29, 66 and 18px; corresponding first-line widths are 61, 53, 269, 269 and 38px. They are true paragraph-fragment tails requiring source-token/line-break diagnostics and legal alternative-break evaluation.

The four note-marker findings measure 1.3125px vertical excursions inside p-cut/p-end inline boxes (pages 508, 522, and two on 606). The current report establishes inline-box excursions, not that painted glyph ink actually overflows. Before any tolerance change, measure baseline/line-box and glyph paint metrics or verify against captured rendered pages.

### Page-count change

The accepted strict-containment / atomic orphan-reclaim work changed the long fixture from 627 to 629 pages relative to commit `ec76d68a`. This is deterministic and source conservation passes; nevertheless, page count is a layout output and the change must remain documented. It is not to be reverted merely to recover 627 pages if doing so reintroduces overflow or breaks widow/orphan/content-preservation constraints.

### Next ordered actions

1. Keep the hard gates above mandatory and add a distinct policy-exception section to the report so allowed residuals remain visible without being misrepresented as defects.
2. Add sparse-tail diagnostics to each finding: stable source token ID, full raw paragraph fragment, all rendered line widths, neighboring lines, column width, legal split alternatives, and the selected split's score/constraints.
3. Resolve sparse-line cases through a bounded, deterministic split/line-break policy; run targeted fixtures and the full long audit after each change.
4. Classify the eight short-block residuals using measured remaining capacity; choose and document a typography-preserving policy, then add a fixture that asserts the capacity limit and exact outcome.
5. Resolve note-marker geometry by measuring baseline/line box versus painted glyph bounds; keep this separate from block containment.
6. Only after the issue inventory is reduced and regression fixtures pass, enable a strict release gate that fails on all actionable geometry issues. Keep `V23` separate from `V21`.


## 8.23 Candidate/routing/capacity diagnostics gate — verified (2026-10-25)

The strengthened CLI gate and long audit passed on commit `4327d2e5845ca542c4326c3e06374d88c2558677`:
- CLI workflow run `40185685887`: SUCCESS.
- Long-document workflow run `40185685897`: SUCCESS.
- Long audit artifact `12596307289`: `geometry-audit-long-report`.
- The CLI now validates the diagnostic ledger and fails on missing/unknown routing, candidate table count mismatches, selected-candidate/score mismatches, non-minimal lexicographic selection, or missing before/after capacity snapshots. The diagnostic gate result is persisted into the JSON report as `geometry.layoutDecisionDiagnosticAudit`.
- Prior verified counts remain the expected baseline: 850 decision records, 381 evaluated candidate tables/capacity snapshots, and 469 light-justify/not-requested routes. The artifact from this commit is the release evidence for the strengthened gate.

Important: this passing run verifies diagnostic consistency and instrumentation, not that all page geometry defects are fixed. The 32 LOW findings remain open until their root causes are fixed and a new full audit proves their removal without regressions.

## 8.24 Next execution order

1. Extract the artifact from run `40185685897` and verify `geometry.layoutDecisionDiagnosticAudit.passed === true`, `failures.length === 0`, and the exact expected counts; verify the summary records the same result.
2. Build a per-finding containment table from the JSON: page index, block selector/ID, outer bounds, body-flow bounds, overflow, preceding block, headings/spacers, local final-justify diagnostics, and whether the issue existed before the last mutation stage.
3. Add stage-by-stage snapshots for all geometry-changing operations in the final page pipeline. The first stage where the reserved flow interval is exceeded is the causal stage; avoid CSS clipping and threshold inflation.
4. Fix one causal category at a time, starting with containment. After every change: syntax/smoke -> targeted fixture -> full long audit -> compare page count, deterministic signature, issue inventory, and console errors.
5. Then resolve the seven short-block capacity-limited imbalances through a documented typography policy; separately decide how to report 5–8px light-justify residuals; then address sparse tails and note-marker paint bounds.
6. Complete an explicit geometry inventory for every layout-affecting component (ornaments, headers, separators, footnotes, side notes, headings, page numbers, and decorations), each with a geometry owner and a test.
7. Release only when all required regression fixtures pass, all geometry findings are either fixed or explicitly accepted by a documented rule, and no unresolved instrumentation gap remains.

Branch boundary remains strict: work on `V23` only; do not merge it into `V21`.


## 8.25 Strict containment and stage-by-stage geometry verification (commit `484ec3ce31ae5a5b379f1579a2d433607571d93b`)

The long-document report for this commit completed successfully (workflow run `40192709037`, artifact `12598762427`). The report directly establishes:
- 629 pages; 854 decision records and 854 two-column blocks; ledger/DOM parity PASS.
- Repeat-render determinism PASS, with stable SHA-256 `96bfe7ce5145aa1ae9f032b323d1cedd6abdf6350ffa84e400a3bcfa6838a2dd`.
- Source-to-rendered paragraph conservation: 3,081/3,081; no missing paragraphs, text mismatches, or extra rendered paragraph IDs.
- Heading conservation: 524/524; side-note conservation and rendered text: 2,043/2,043; no metadata or text mismatches.
- Canonical final geometry snapshots: 854/854; stage capture errors: 0. Coverage: postfit 779, before-page-stretch 533, after-page-stretch 533, after-orphan-reclaim 535, after-page-final-justify 44, canonical-final 854.
- Across all captured stage snapshots, no block exceeded the body-flow bottom by more than 0.5px. The geometry audit reports zero `containment` issues, down from 14 in the 627-page baseline.
- Footnote measurement: 60/60 exact matches, max discrepancy 0px.
- Remaining issue inventory: 19 LOW (10 imbalance, 5 sparse-line, 4 containment-rounding).

### Pagination delta is a tracked consequence, not automatically a regression

The page count changed from 627 to 629 and decision records from 850 to 854 relative to commit `0f716014...`. The newer implementation adds strict-fit checks and atomic rollback for orphan reclaim/final stretch. Text, headings and side notes are conserved, and containment findings disappear; nevertheless, the two-page delta must remain explicitly tracked. Before release, compare page-boundary signatures and inspect pages around each newly introduced page break. Do not claim “no regression” from text conservation alone.

### Current residuals and next priority

- Ten balance findings include eight measured capacity-limited residuals and two residuals accepted by the light-justify policy but still shown in the audit inventory.
- Five sparse-line findings are at pages 59, 261, 317, 328 and 551 in this report (page numbering in the issue objects is zero-based; the summary prints one-based page labels). These are paragraph fragments of type `p-cut`; record line-by-line text, widths, legal breakpoints, and split attributes before modifying the line breaker.
- Four note-marker rounding findings remain near 1.3px. Preserve the raw bounds; determine whether they are glyph-paint excursions or line-box/inline geometry mismatch before choosing any tolerance.
- Do not relax strict containment, suppress low findings, or change the line-break/balance policy without a targeted regression fixture and full rerun.


## 8.26 Audit measurement correction: visual line widths (2026-10-25)

Commit `45d28d106c4d3ae9984ddcb9c004ced695bc5431` changes the audit-only `collectLines()` measurement. A DOM Range may return multiple inline fragments for one visual line; the previous implementation deduplicated fragments by vertical key but kept only the first fragment's rectangle. The new implementation groups fragments by vertical center and measures the union of each visual line's horizontal/vertical bounds. This affects audit measurements only; it does not change `typesetter.js` or pagination.

The same commit adds line-token and split-policy details to each sparse-line finding: first/last visual-line text and token geometry, split input/fit/placed counts, widow/orphan minima, parenthesis state, font size, line height and `text-align-last`. These fields are intended to distinguish a real short final line from a measurement artifact before changing the line breaker.

Validation status — PASSED on commit `45d28d106c4d3ae9984ddcb9c004ced695bc5431`:
- CLI syntax + smoke workflow `40193778837`: SUCCESS.
- Full long-document audit `40193778860`: SUCCESS; artifact `12598863365`.
- Repeat-render determinism: PASS; page count 629; ledger/DOM 854/854; decision diagnostic gate PASS (854 records, 389/389 candidate tables and capacity snapshots).
- Content conservation: 3,081/3,081 source paragraphs, 524/524 headings, 2,043/2,043 side notes; zero missing/mismatched content.
- Hard containment and stage capture gates: PASS; canonical snapshots 854/854; stage capture errors 0; no final containment findings.
- Sparse-line findings fell from 5 to **0** after fixing line-fragment aggregation. Total findings fell from 19 to **14**, with no high/medium findings and no runtime/console errors.
- This confirms the five prior sparse-line alerts were artifacts of the audit's line-width measurement, not a proven layout-engine defect. Do not change the line breaker to address those former alerts.


## 8.27 Verified result after visual-line measurement correction (2026-10-25)

The completed long audit for `45d28d106c4d3ae9984ddcb9c004ced695bc5431` confirms that the corrected line-fragment union changed the audit inventory from 19 to 14 LOW findings:
- Sparse-line: 5 -> 0.
- Containment: remains 0.
- Imbalance: remains 10 (8 capacity-limited, 2 policy-accepted residuals).
- Note-marker containment-rounding: remains 4 at about 1.3125px.
- Page count remains 629 and decision records remain 854; deterministic hash and content-conservation gates pass.

The next unresolved work is now narrowed to two independent categories: (1) define and enforce an acceptable mathematical balance/stretch policy for the 10 residuals without violating typographic caps; (2) measure the four note-marker bounds with their computed `vertical-align`, `line-height`, font size and actual line box so that intended superscript/subscript paint bounds can be distinguished from real geometry errors. Do not change line-breaking rules in response to the removed sparse-line alerts.


## 8.23 Parenthesis-scope correlation against every remaining imbalance (2026-10-25)

Verified on code commit `3e2566abb3e45564251c1d84a8aaf7d7583fb893`, long audit run `40194939206`, artifact `12599268878`.

The diagnostic-only parenthesis scope mapper was added after cross-paragraph styling and before the later global balancing pass. It scans the same `p[data-raw-text]` sequence as `applyCrossParagraphParens`, ignores parentheses inside square-bracket note text, pairs actual parenthesis characters, and records each paragraph's page, block, and column. It does not alter layout styles or geometry. The cross-column and cross-page categories are disjoint: a pair crossing pages is counted as cross-page, not also cross-column.

### Integrity / coverage

- 629 pages; 854 decision records and 854 direct two-column blocks; parity PASS.
- 854/854 parenthesis-scope diagnostics; 0 missing diagnostics and 0 capture errors.
- 4,236 rendered paragraph fragments; 2,490 matched parenthesis pairs.
- 87 pairs cross from right to left column on the same page; 46 pairs cross a page boundary.
- 80 blocks intersect at least one same-page cross-column scope; 91 intersect at least one cross-page scope.
- 3 unmatched closing parentheses in the full input sequence; 0 unmatched opening parentheses at document end. This is an input/scan finding to investigate separately, not evidence that any imbalance finding is caused by parentheses.
- Repeat-render determinism PASS; 629 pages in both renders; hash `96bfe7ce5145aa1ae9f032b323d1cedd6abdf6350ffa84e400a3bcfa6838a2dd`.
- No runtime or console errors; source/rendered paragraph conservation PASS.

### Every remaining imbalance case

No remaining imbalance issue intersects a cross-column or cross-page parenthesis scope, and no issue block is an endpoint of such a scope. The issue pages below are 1-based printed page numbers (the report's `pageIdx + 1`).

| Page | Right/left height | Difference | Parenthesis evidence inside the issue block | Cross-column / cross-page scope |
|---:|---:|---:|---|---|
| 220 | 71 / 65px | 6px | No parentheses or `paren-text` paragraphs in either column | 0 / 0 |
| 233 | 479 / 484px | 5px | Local balanced parentheses in both columns (right 4 pairs of characters; left 2 pairs); no open scope crosses a column/page boundary | 0 / 0 |
| 239 | 71 / 65px | 6px | None in either column | 0 / 0 |
| 275 | 71 / 65px | 6px | None in either column | 0 / 0 |
| 329 | 71 / 65px | 6px | None in either column | 0 / 0 |
| 506 | 71 / 65px | 6px | None in either column | 0 / 0 |
| 536 | 71 / 66px | 5px | One local balanced pair in the left column; no crossing scope | 0 / 0 |
| 537 | 71 / 65px | 6px | One local balanced pair in the right column; no crossing scope | 0 / 0 |
| 592 | 157 / 152px | 5px | One local balanced pair in the right column; no crossing scope | 0 / 0 |
| 606 | 71 / 65px | 6px | None in either column | 0 / 0 |

For all 10 cases, the existing before/after cross-paragraph-style diagnostic also reports zero right/left/outer height delta, zero changed paragraphs, and zero geometry/style changes at that stage. Therefore the present evidence rejects the hypothesis that these 10 residuals are caused by **parenthetical spans crossing columns or pages**. Four blocks contain ordinary local parenthetical text; the scope audit alone cannot prove that local smaller-font styling has zero influence on those blocks' heights, but it does show that they are not cross-boundary cases.

The eight capacity-limited residuals correspond to the eight short blocks at pages 220, 239, 275, 329, 506, 536, 537 and 606; the two light-justify residuals at pages 233 and 592 remain policy-accepted 5px differences. Keep these causes separate from parenthesis scope.

### Other audit observations

The 4 remaining `containment-rounding` findings are note-marker top-bound excursions of about 1.3125–1.375px. The 2026-10-26 live-DOM diagnostic now records computed `vertical-align: super`, `line-height: 0px`, font size, and the nearest text-fragment union. Two markers fall inside the measured fragment union; two protrude above it by 1.312px. These are inline-fragment bounds, not painted-glyph bounds or a direct CSS line-box measurement, so all four findings remain visible at LOW severity pending a controlled typographic interpretation. The 5 sparse-line findings were removed by the previously documented line-fragment-union correction; do not treat that change as a consequence of the parenthesis-scope instrumentation.

### Decision

Do not change parenthesis styling or its cross-column/page handling to address the current 10 imbalance findings. The next balance work should focus on the deterministic candidate/capacity policy and the two light-justify residuals. Preserve the scope mapper as a regression diagnostic for future changes.


### Verified three-column running-header ornament geometry — 2026-10-26

The active ornament fixtures now select the external SVG `ext________2_svg` in the right, center and left running-header columns for both regular and verso/even-page settings. The CLI measures each wrapper and its SVG/image independently. CI and downloaded-artifact inspection confirm all six per-column measurements are nonzero in both fixture modes: right/center/left wrappers = 1 each, and right/center/left SVG/image graphics = 1 each. Each fixture has 0 containment, containment-rounding and overlap findings; the two LOW findings in each are column imbalance findings, not ornament geometry.

- CLI run: https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40238938604 (artifact `12615769263`).
- Long-document regression run: https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40238938601 (artifact `12615179711`).

The long regression remains stable at 643 pages with deterministic repeat rendering, 3,105/3,105 source paragraphs, 529/529 headings, 2,042/2,042 side notes, 859/859 valid decision records with DOM parity, zero runtime/console errors, and 14 LOW findings (10 imbalance, 4 note-marker containment-rounding), zero MEDIUM/HIGH. Ornament settings are disabled in the long fixture, so it is a regression check rather than ornament coverage.

Resolved diagnostic follow-up: the issue records now contain matched live-DOM data and nearest text-fragment union measurements. Long-document CI passed with the new `--require-note-marker-line-diagnostics` gate. Run: https://github.com/SUGINACH/IMUD_TORANI/actions/runs/40240403746 (artifact `12617022055`). The measured style is `vertical-align: super`, `line-height: 0px`, font size `10.6667px`; the marker findings remain low and visible because fragment unions are not equivalent to painted-glyph bounds or true CSS line boxes.


### 2026-10-26 — Residual-balance candidate evidence

The 8 short-block residuals were checked against every candidate in their deterministic decision ledgers. Each has the same three candidates: 50/71px, 71/50px, and 114/0px. The first two tie at 21px before stretch; either orientation leaves a 5–6px residual because the short two-line column's stretch capacity is 15.008px, below the 21px gap. The 2 light-justify residuals are separate 5px cases under the explicit 8px policy; on page 233, an attempted 6px growth was rolled back because it increased the tallest content. No candidate or policy change is justified by current evidence alone. Keep these LOW findings visible and investigate the light-justify quantization separately before changing thresholds.


### Active geometry gate scope (2026-10-26)

The focused active-decoration fixtures now fail not only on containment, rounding, and overlap, but also on explicit overflow issue classes emitted by the audit: side-note, footnote, page-number, page-level, and footnote-line overflow. This is a stricter regression gate, not proof that every visual clipping mode is detected: SVG painted-glyph bounds, transparent SVG padding, and clipping caused by ancestor `overflow:hidden` still require dedicated checks.


### Running-header SVG geometry audit (2026-10-26)

The active fixture now records the geometry of each selected external header SVG/image, including wrapper and graphic rectangles, side (right/center/left), SVG `viewBox` parse status, and CSS ancestor overflow clipping. The active gate requires all selected external header positions to render a graphic and rejects missing graphics, malformed explicit viewBoxes, and measured clipping by ancestors. On the active SVG fixture, all three positions rendered `viewBox=[0,0,914,391]`; there were no missing graphics, malformed viewBoxes, or detected clipping ancestors. This is DOM/viewport evidence only; painted path bounds inside the SVG, transparent padding, masks/clip-path, and untested ornament families remain outside this audit. The long-document regression on commit `40555e5fbdc47afe443960e04655dbd2c4b3acd2` also passed: 643 pages, identical repeat-render hash, 3,105/3,105 paragraphs conserved, zero runtime/console errors, and all 4 note-marker line diagnostics matched. Because that long-document fixture disables ornaments, it does not add header-SVG coverage beyond the active fixture.


### Distinct even/odd running-header rendering (2026-10-26)

The renderer now reads the dedicated `hdr-verso-*` type, alignment, font, size and custom-text controls on even pages when `hdr-distinct-even-odd` is enabled; `same_as_odd` inherits the odd-page type. The audit records each header grid's parity, actual selected types and ornament IDs, and the active parity gate compares them against the settings. The parity smoke test passed on 13 pages: 9 header grids (5 even, 4 odd), 82/82 paragraphs conserved, 27 SVGs rendered with valid viewBoxes and no measured ancestor clipping, and no audit/runtime findings. The long-document regression also passed on commit `9ec548a035ebb54aeff2c35aeb809c868f00471e`: 643 pages, identical repeat-render hash, 3,105/3,105 paragraphs conserved, zero runtime/console errors, 14 LOW findings unchanged, and 624 header grids observed (313 even/verso, 311 odd/recto). That long fixture has no active header SVG ornaments, so SVG clipping remains covered by the separate active fixture.


### 2026-10-26 — Two-column block non-empty invariant (confirmed gap)

The long-document geometry report at commit `42d54f5f1ebac08d77e289ce12bdb6a334383920` contains six HIGH `one-column-empty` findings (pages 47, 219, 318, 477, 604, 641). All six blocks have a present but zero-height left column and one short paragraph fragment in the right column (2–3 rendered lines). Their decision ledgers show `candidateCount=1`, `splitItemIndex=1`, `splitLineCount=0`, `fits=true`, and `valid=true`; the candidate scorer does not encode non-empty occupancy as an invariant. Some blocks are adjacent to a section divider or an H3 span, so the correct remedy must respect structural boundaries and widow/orphan constraints rather than simply forcing an arbitrary split.

**Current contract (implemented and long-document regression-tested):** a `block-2col` may not silently accept an empty column as a successful balanced two-column result. When no legal split exists, the engine records `no-legal-two-column-split`, zero candidates, no selected candidate, and an explicit fallback. For a single short rendered paragraph fragment with the opposite column empty, the engine uses `full-width-terminal-residual`: it preserves the existing rendered text DOM, spans the active column across grid columns 3–6, hides the opposite column and gutter divider, repositions applicable side-note anchors, and records the active side plus before/after heights. If the fragment is a `p-cut`, the engine validates actual rendered line count and measures inline fragment widths; it seeks the widest narrower integer width that avoids a last line below 50% of the first line while preserving the configured minimum line count and not increasing the pre-fallback column height. The ledger records whether sparse-line correction was `corrected`, `not-needed`, or `unresolved`; the long-document CI fails if a terminal fallback remains sparse or unresolved. The geometry audit independently verifies the declared side, grid span, hidden opposite column, non-empty rendered text, and widow/orphan line count; invalid fallback geometry is HIGH severity. Other no-legal-split shapes retain `preserve-existing-flow-no-legal-split` and remain auditable; they are not claimed to be visually resolved. `fits=true` alone is never sufficient proof of a valid two-column layout.

**Latest verified long-document result:** commit `74ab453754dd807e71f4410c1dedfd38a994b183` completed the 639-page long audit with identical repeated-render hashes (`55ba00139b1b147a719c34e8165a340a59e925b3c21918951027c8fa4fe6ec5d)), 3,105/3,105 paragraphs, 529/529 headings, 2,042/2,042 side notes, and 858/858 valid decision records. The quality gate passed with zero HIGH findings; the sparse-line issue formerly associated with the terminal residual is gone, and the decision ledger marks that fallback's density correction as `corrected`. Remaining findings: 4 MEDIUM and 23 LOW (9 imbalance, 6 structural-fallback, 6 containment-rounding, 3 sparse-page, 3 square-bracket-scope overall; the MEDIUM subset is one sparse page and three bracket scopes). See the generated audit artifact for exact pages/categories.

Diagnostic note: the double-escaped whitespace-normalization regex was corrected in commit `2368b613b144848d807a63039dbc654949eb1647`. Diagnostics distinguish source/raw-text length from actual rendered text length and record scroll/client/offset heights plus computed display/overflow/line-height. The no-legal-split fixture verifies an explicit fallback and its before/after height. Parenthesis scope coverage includes 86 cross-column and 47 cross-page pairs, but 3 unmatched closing delimiters remain without source-location diagnostics. Ornament geometry is covered by separate active-setting smoke fixtures; the long-document default settings disable ornaments, so that run does not validate their full-document interactions. V21 remains a separate parallel branch and was not modified or merged.


---

## 12. ביקורת כיסוי התמלילים לפני מחיקה — 26.10.2026

בוצעה השוואה שיטתית של שש השיחות `שיחה_מספר_1.md`–`שיחה_מספר_6.md` מול התיעוד הטכני, מפת התלויות, תכנית היציבות ויומן העבודה. הממצאים המפורטים, ה-SHA של המקורות, ההחלטות ההיסטוריות והסתירות הכרונולוגיות נשמרו ב-`V23/TRANSCRIPT_DELETION_AUDIT.md`.

**החלטה:** אין למחוק עדיין את שש השיחות. התיעוד המסכם משפר את המשכיות העבודה, אך לא מחליף את כל ראיות המקור, קובצי ה-attachment או ההקשר של תוצאות CI היסטוריות. מחיקה מהעותק הפעיל תישקל רק לאחר השלמת תנאי הסף במסמך הביקורת ושמירת עותק ארכיוני עצמאי.

הביקורת היא שינוי תיעוד בלבד: לא שונה קוד המנוע, לא שונה מדיניות הפריסה, ולא בוצע מיזוג או שינוי בענף `V21`. יש להמשיך להבחין בין תוצאות Smoke לבין long audit, ולשייך כל תוצאה ל-commit ול-artifact המדויקים.
