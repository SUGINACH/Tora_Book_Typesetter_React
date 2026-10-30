# מלאי ההעברה הנעול מהתוכנה הישנה — שלב 2 בתכנית 100 השלבים

**מקור הסמכות:** Orange @ `93ad1e570440` (הבייסליין הנעול) · **אסמכתא:** אפיון §2, §3.3, §5, §21 · **תכנית:** סעיף ד + שלב 2

עקרון מחייב (כלל 9 בתכנית): כל פריט של התוכנה הישנה מועבר בשלמות או נזנח בהחלטה מפורשת ומתועדת בלבד. ברירת המחדל: **מועבר**. הסטטוסים: `transferred` — עותק נעול כבר נמצא תחת `assets/`; `deferred` — הפריט הוקפא ב־hash ויועבר בשלב המצוין ביעד.

## מזהי טקסט ותחביר קלט (`text-identifiers`)

- **היקף:** כותרות H0–H7, שערים (main/back/sub), הערות שוליים/צד/סיום, first-word-window, dibbur hamatchil, drop-word, סוגריים, מפרידי מוסף, עיטורים, כותרות רצות, הערות עורך וחלקי עמוד מיוחדים
- **סטטוס:** `deferred` · **יעד:** docs/migration/identifiers.md + חבילת content-model (שלב 17); provenance (שלבים 14–16); סוגריים (שלב 19)

| קובץ מקור (Orange) | SHA-256 | בתים | תפקיד |
|---|---|---|---|
| `typesetter.js` | `e5fe969a9d48…` | 368,647 | הפרסר והמנוע — מקור כל מזהי הטקסט |
| `app.js` | `1e10f71cb7c5…` | 137,656 | קלט משתמש וזיהוי מזהים בזמן ייבוא |
| `decorations.js` | `e87bb1792e06…` | 36,801 | עיטורים פעילים וחישוב השפעתם |
| `settings-manager.js` | `09475f6a52a7…` | 12,510 | ניהול הגדרות ומפתחות |

## סגנונות עימוד והגדרות (`settings`)

- **היקף:** כל מפתחות ההגדרות, ובהם: page-num-initial-value, avoid-runt-word, body-last-line-align, same_as_even, hdr-h1-title-mode, h2-orn-scope, מספור הערות, מצבי first-word, טווחי כותרות, גאומטריית עמוד וטורים, ריווח, letter-spacing, כותרות רצות ופוליו
- **סטטוס:** `deferred` · **יעד:** docs/migration/settings-matrix.md + Setting Registry (שלבים 26, 78–79, 84)

| קובץ מקור (Orange) | SHA-256 | בתים | תפקיד |
|---|---|---|---|
| `default_settings.json` | `576dc778869e…` | 8,078 | ברירות המחדל המלאות — חוזה ההגדרות |
| `setting_sets/פרשנות.json` | `f7705745c20b…` | 7,959 | פריסט ספר פרשנות |
| `setting_sets/קונטרס.json` | `567461b08a9b…` | 7,951 | פריסט קונטרס |
| `setting_sets/תלמוד.json` | `d27ae1d52e85…` | 7,950 | פריסט ספר תלמוד |
| `LAYOUT_DEPENDENCY_MAP.md` | `006da8e9b780…` | 102,228 | מפת תלות הגדרות־עימוד (מלאי דרישות) |

## גופנים (`fonts`)

- **היקף:** סט הגופנים המלא ששימש את התוכנה הישנה, כולל משקלים וסגנונות
- **סטטוס:** `transferred` · **יעד:** measurement-harfbuzz + manifest גופנים (שלבים 23–24)
- **עותק נעול:** `assets/fonts/`

רשימה מלאה ב־assets/fonts/manifest.json — 1,757 גופנים מצורפים (woff2+woff) + Guttman-Rashi + 38 גופני selfhost תחת רישיון OFL + 7 רישיונות/CSS + 5 מטא-דאטה

## חלקי עמוד (`page-parts`)

- **היקף:** כותרות עליונות/רצות (recto/verso), פוטר, פוליו וגימטריה, טורי גוף, אזורי הערות, תיבות מותאמות
- **סטטוס:** `deferred` · **יעד:** Page Templates לפי סוג עמוד ו־parity + מבחני מבנה עמוד (שלבים 50, 67)

| קובץ מקור (Orange) | SHA-256 | בתים | תפקיד |
|---|---|---|---|
| `typesetter.js` | `e5fe969a9d48…` | 368,647 | בניית חלקי העמוד והתבניות בפועל |
| `renderer-bridge.js` | `957ad8dd83b2…` | 19,194 | גשר רינדור ותבניות עמוד |
| `style.css` | `9fdf0c178bab…` | 58,503 | עיצוב חלקי העמוד בפועל |

## שערים ועיטורים (`shaar-ornaments`)

- **היקף:** עיצובי שער main/back/sub (תיבות טקסט, anchors, safe areas), עיטורי H2 לפי scope, עיטורי H3, עיטורי סוף פרק, מחיצות מוסף, עיטורי כותרת
- **סטטוס:** `transferred` · **יעד:** manifests נכסים והשפעת עיטורים על המקום הזמין (שלבים 68–69)
- **עותק נעול:** `assets/shaar/ + assets/ornaments/`

| נכס | כמות עיצובים | מניפסט |
|---|---|---|
| `shaar_main.json` | 32 | `assets/shaar/manifest.json` |
| `shaar_back.json` | 27 | `assets/shaar/manifest.json` |
| `shaar_sub.json` | 27 | `assets/shaar/manifest.json` |
| `ornaments_up_down.json` | 302 | `assets/ornaments/manifest.json` |
| `ornaments_left_right.json` | 302 | `assets/ornaments/manifest.json` |
| `header_ornaments.json` | 5 | `assets/ornaments/manifest.json` |
| `section_dividers.json` | 323 | `assets/ornaments/manifest.json` |

## חוקי הערות (`note-rules`)

- **היקף:** כללי הצבה, מספור ואיזון של הערות שוליים/צד/סיום + מפרידי אזור הערות
- **סטטוס:** `transferred-visual-deferred-logic` · **יעד:** policy-torah + fixtures ייעודיים (שלבים 20, 53–55)
- **עותק נעול:** `assets/ornaments/note_rules.json (35 מפרידים)`

| קובץ מקור (Orange) | SHA-256 | בתים | תפקיד |
|---|---|---|---|
| `note_rules.json` | `c4c116583208…` | 162,900 | 35 מפרידי אזור הערות (SVG) |
| `default_settings.json` | `576dc778869e…` | 8,078 | מפתחות מספור ופריסת הערות (page/siman/part/continuous, fn-layout-mode ועוד) |
| `typesetter.js` | `e5fe969a9d48…` | 368,647 | לוגיקת הצבה ואיזון הערות בפועל |

## קורפוס בדיקה (`test-corpus`)

- **היקף:** קובצי הטקסט של הבדיקות והמסמך הארוך הקנוני
- **סטטוס:** `deferred` · **יעד:** packages/test-fixtures עם sourceSha256 לכל fixture (שלבים 4, 74)

| קובץ מקור (Orange) | SHA-256 | בתים | תפקיד |
|---|---|---|---|
| `very_long_test_text.txt` | `5e73b913f984…` | 3,424,454 | המסמך הארוך הקנוני — זהה ל־fixtures/canonical_very_long_test_text.txt |
| `long_test_text.txt` | `d039b599cfc1…` | 2,718,900 | מסמך ארוך 1 |
| `long_test_text_2.txt` | `3b11f4e30e70…` | 2,646,152 | מסמך ארוך 2 |
| `long_test_text_no_parentheses.txt` | `d48786f63aa6…` | 2,715,579 | מסמך ארוך ללא סוגריים |
| `mid_long_test_text.txt` | `d1ffea910215…` | 667,221 | מסמך בינוני |
| `fixtures/base_very_long_test_text.txt` | `e9681f1ee990…` | 3,387,848 | בסיס להשוואת מסמך ארוך |
| `fixtures/canonical_very_long_test_text.txt` | `5e73b913f984…` | 3,424,454 | העתק קנוני של very_long_test_text.txt (hash זהה) |
| `fixtures/ch63_final_paragraph_failure_case.txt` | `4699a3070479…` | 28,668 | מקרה כשל פסקה אחרונה — פרק 63 |
| `fixtures/chapters_focus/ch05.txt` | `3ae75db1ca7b…` | 44,257 | פרק ממוקד לבדיקות — ch05.txt |
| `fixtures/chapters_focus/ch09.txt` | `a87bd1cb2961…` | 89,783 | פרק ממוקד לבדיקות — ch09.txt |
| `fixtures/chapters_focus/ch13.txt` | `3aef5ddb0364…` | 87,615 | פרק ממוקד לבדיקות — ch13.txt |
| `fixtures/chapters_focus/ch35.txt` | `5b1719560f57…` | 12,023 | פרק ממוקד לבדיקות — ch35.txt |
| `fixtures/chapters_focus/ch42.txt` | `b45f75719669…` | 27,034 | פרק ממוקד לבדיקות — ch42.txt |
| `fixtures/chapters_focus/ch55.txt` | `191ec6d32753…` | 126,628 | פרק ממוקד לבדיקות — ch55.txt |
| `fixtures/chapters_focus/ch62.txt` | `821c3394a7f3…` | 32,750 | פרק ממוקד לבדיקות — ch62.txt |
| `fixtures/chapters_focus/ch63.txt` | `0e8d77ebbe1a…` | 112,619 | פרק ממוקד לבדיקות — ch63.txt |
| `fixtures/chapters_focus/ch67.txt` | `f377d8e37e9b…` | 54,972 | פרק ממוקד לבדיקות — ch67.txt |
| `fixtures/chapters_focus/ch71.txt` | `91be1c944af6…` | 41,645 | פרק ממוקד לבדיקות — ch71.txt |
| `fixtures/chapters_focus/ch72.txt` | `5c3046351d0a…` | 59,689 | פרק ממוקד לבדיקות — ch72.txt |
| `fixtures/chapters_focus/ch73.txt` | `ddf1b1b2b770…` | 37,707 | פרק ממוקד לבדיקות — ch73.txt |
| `fixtures/chapters_focus/ch75.txt` | `3672d6c5f99d…` | 58,497 | פרק ממוקד לבדיקות — ch75.txt |
| `tests/fixtures/geometry-audit-diagnostics-smoke.txt` | `25b5f1fc10f8…` | 622 | קלט smoke לביקורת גאומטריה |
| `tests/fixtures/geometry-audit-smoke.txt` | `1aec66889762…` | 1,020 | קלט smoke לביקורת גאומטריה |
| `tests/fixtures/no-legal-two-column-split.txt` | `6e6c1729a8eb…` | 268 | קלט smoke לביקורת גאומטריה |
| `tests/fixtures/ornament-geometry-parity-settings.json` | `5e0f35c0fb9f…` | 8,062 | הגדרות בדיקת עיטורים |
| `tests/fixtures/ornament-geometry-parity-smoke.txt` | `d5fbfe050856…` | 41,568 | קלט smoke לביקורת גאומטריה |
| `tests/fixtures/ornament-geometry-settings.json` | `1a4e63bf5f37…` | 8,075 | הגדרות בדיקת עיטורים |
| `tests/fixtures/ornament-geometry-smoke.txt` | `452a1a158659…` | 1,244 | קלט smoke לביקורת גאומטריה |
| `tests/fixtures/ornament-geometry-title-tb-settings.json` | `f6bb9435c235…` | 8,085 | הגדרות בדיקת עיטורים |

## החלטות מתועדות

| מזהה | נושא | החלטה | נימוק |
|---|---|---|---|
| **D-001** | רישוי אוסף 1,760 הגופנים המצורפים (fonts/*.woff2) | מועבר בשלמות, כמו שהוא | תנאי התאימות של התכנית דורש את מלוא הסט; בתוכנה הישנה לא תועד רישיון לפי משפחה, והאוסף שימש בפועל את המערכת (רשימות priority/extended + בורר הגופנים). |
| **D-002** | Guttman-Rashi-Normal.woff2 | מועבר כמו שהוא | נחוץ לתאימות מלאה (גופן רש"י להערות); רישיון לא תועד במקור. |
| **D-003** | קובצי בדיקה שנוספו בריפו ה-React מחוץ לבייסליין (no_long_test_text.txt, very_long_test_text_2.txt) | מוגדרים מחוץ למלאי הנעול; לא ייכנסו ל־packages/test-fixtures אלא בהחלטה מפורשת בשלב 4 | כלל 8 בתכנית: הקוד והקבצים שנוספו לריפו ה-React אינם נקודת ייחוס; הבייסליין הנעול הוא Orange בלבד. הקבצים נותרים בריפו ללא שינוי. |

## בדיקות אימות צולבות

- `very_long_test_text.txt` — `5e73b913f9843fce695d0e4073c176961b8dbc2fa87e8e4c3d99051a826ce0e4` — אומת מול PROVENANCE.md של Orange (תיעוד hash מקורי: 5e73b913…ce0e4).

## פקודת אימות

```bash
node scripts/migration/verify-transfer-inventory.mjs
```
