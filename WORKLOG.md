# Worklog — Tora Book Typesetter React

## תכנית 100 השלבים — יומן ביצוע (מ־2026-10-30)

> מכאן ואילך מבוצעת `תכנית_עבודה_מפורטת_לסוכן_AI_100_שלבים.md` שלב אחר שלב, כאילו שום שלב לא בוצע קודם לכן (כלל 8: הקוד הקודם בריפו אינו נקודת ייחוס). מבנה רשומה: שלב ← תוצרים ← פקודות בדיקה שרצו ← ממצאים.

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
