# Worklog — Tora Book Typesetter React

## תכנית 100 השלבים — יומן ביצוע מחדש (מ־2026-10-30, לאחר האיפוס)

> מבוצעת `תכנית_עבודה_מפורטת_לסוכן_AI_100_שלבים.md` שלב אחר שלב מ־שלב 1, כאילו שום שלב לא בוצע קודם לכן. מבנה רשומה: שלב ← תוצרים ← פקודות בדיקה שרצו ← ממצאים. איפוס ההתחלה מתועד ברשומה הבאה שבסוף היומן הזה.

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
