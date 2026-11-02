# Worklog — Tora Book Typesetter React

## תכנית 100 השלבים — יומן ביצוע מחדש (מ־2026-10-30, לאחר האיפוס)

> מבוצעת `תכנית_עבודה_מפורטת_לסוכן_AI_100_שלבים.md` שלב אחר שלב מ־שלב 1, כאילו שום שלב לא בוצע קודם לכן. מבנה רשומה: שלב ← תוצרים ← פקודות בדיקה שרצו ← ממצאים. איפוס ההתחלה מתועד ברשומה הבאה שבסוף היומן הזה.

### שלב 41 — מועמדי שורה וחישוב רוחב מגליפים (M5) — הושלם 2026-11-02
- **תוצרים:**
  - `layout-engine/src/linebreak/tokens.ts` — מודל הטוקנים הוצא מ־typeset-v0 ללא שינוי התנהגות (תשתית משותפת לשבירה ולהצבה): Cell/Token/BlockTokens, tokenize, tokenizeNotesBody, coalesceSpans + מיפוי אטום←טוקן.
  - `layout-engine/src/linebreak/shaping.ts` — shapeParagraph לפי רצופי רמה הוצא מ־typeset-v0 (§8.1#4–5: cluster→atom mapping; רוחב מ־glyph advances).
  - `layout-engine/src/linebreak/candidates.ts` — **מודול מועמדי השורה**: (א) `buildLineBreakPoints` — נקודות שבירה UAX #14 (שלב 26, ממופה לגבולות אטומים) ∩ breakBefore של הפרסר + explicit-break כ־forced + סוף פסקה; הזדמנות שהפרסר אסר **מסומנת** ברשימת blocked (reason: parser-forbidden) ואינה נעלמת; (ב) `LineCandidateIndex` — טבלאות קידומות O(1) למדידת כל מקטע: רוחב (glyph advances + סמנים), stretch/shrink **פר־רווח** בחשבון שלם (roundDiv), רווחים עוקבים בסוף מחוץ לרוחב אך האטומים נשמרים (אין מחיקת atoms), רווחים מובילים בתוך הרוחב, hyphenEnd לפי התו האחרון של אטום־המילה, wordCount/singleWordWidth; (ג) `reconstructMetrics` — שחזור ישיר מהמקור ומהמדידה (שער השלב); (ד) `LineCandidate` עם id קנוני `c:{start}:{end}`.
  - `layout-api` מייצא כעת גם את `computeBreakOpportunities` (תקדים computeBidi — רכזת ה-re-export §5).
- **החלטות מתועדות (ייכנסו ל־ADR-004 בשלב 43):** מודל האטומים של הפרסר הוא **מילים** — רצף רווחים הוא אטום אחד ולכן הקוונטיזציה פר־רווח מפרקת אטום רווחים ל־k רווחים זהים; NBSP (U+00A0) אינו נחתך ואינו נמתח; שבירה חוקית בין אטומים בלבד (גבולות UAX #14 שנופלים בדיוק על תחילת אטום — מקף בתוך מילה אינו נקודת שבירה במודל זה).
- **בדיקות:** `test:packages` — **628/628** (615+13); `verify-line-candidates` — **22/22** (חוזה, נקודות שבירה, שער שחזור על מדגם דטרמיניסטי, רוחב מגליפים, דטרמיניזם, רגרסיה); verify-layout-engine — 24/24.
- **ממצאים:** נעילת המונה 615→628 עודכנה ב־CI וב־24 המאמתים. המאמת עבר על פסקת הייחוס הארוכה (1.4M זוגות שחזור) — הוגבל למדגם 3000 זוגות בצעד קבוע (זמן ריצה ב-CI). אין שינוי בקוד הישן ואין שינוי layoutHash (המודול עדיין אינו מחובר למסלול הייצור).

### שלב 42 — אלגוריתם DP גלובלי לפסקה בסגנון Knuth–Plass (M5) — הושלם 2026-11-02
- **תוצרים:**
  - `layout-engine/src/linebreak/dp.ts` — **ה־DP הגלובלי**: active nodes על נקודות השבירה, best[end] = מינימום על כל המסלולים; סדר עיבוד קבוע (קצוות בסדר עולה, פעילים בסדר קנוני); מודל עלות **מוזרק** (CostModel) ומדיניות חוקיות **מוזרקת** (FeasibilityPolicy) — מועמד לא חוקי נפסל לפני תמחור; תיקו נשבר לפי מזהה יצירה (סדר קבוע — "אין tie לפי זמן"); ניטרול צמתים מתים (רוחב מונוטוני בקצה); אלומה (maxBeamWidth) ותקציב מועמדים (maxCandidatesPerState) עם רישום מיצוי; איסור שורה החוצה שבירה כפויה/חובה (spans-mandatory-break); שחזור מסלול מלא + רשומות rejections/dominated לפנקס.
  - `layout-engine/src/linebreak/cost-scalar.ts` — מודל העלות הסקלרי של השלב: badness שלם (SCALE·num²/den², תקרה 40000; אין float/Infinity), שורת last/natural ללא מתיחה (badness 0), עונש מקף 20000. יוחלף ב־QualityVector בשלב 43 בלי לגעת בליבה.
  - `layout-engine/src/linebreak/policy.ts` — מדיניות שלב־0: justify חוקי רק אם אין גלישה אחרי כיווץ מלא ואין חסר מילוי אחרי מתיחה מלאה; natural/last רק איסור גלישה.
  - `layout-engine/src/linebreak/greedy.ts` — **פיקסטורת השוואה בלבד** (מסומנת במפורש; אסורה בייצור): מילוי מקסימלי על אותו אינדקס מועמדים ואותו מודל רוחב — מבודד את האלגוריתם לבדיקות differential (שלב 48).
- **בדיקות:** `test:packages` — **638/638** (628+10); `verify-paragraph-dp` — **22/22**.
- **ממצאים:** הוכחת הגלובליות נבנתה בעבודה מספרית: בספק הבדיקה רוחבי המילה גדולים מסבילות המתיחה, ולכן הפרדת greedy/DP דורשת עונש מקף — נמצא W=96000 שבו החמדני נגמר במילה־מקף (33864) וה־DP נמנע (8258) בבחירות שונות בפועל. מסלול הייצור (typeset) עדיין בשבירת v0 — ההחלפה בשלב 47 בלבד. אין שינוי layoutHash.

### שלב 43 — אילוצים קשים מול עלויות, QualityVector ו־comparator לקסיקוגרפי; ADR-004 (M5) — הושלם 2026-11-02
- **תוצרים:**
  - `docs/adr/ADR-004-linebreak-quality.md` — **ה־ADR ננעל לפני המימוש**: 9 רכיבי QualityVector בסדר מחייב (fallbackSeverity → escort → notes → widowOrphan → runt → lineBadness → hyphen → imbalance → pageCount; הטלת §6.6 — הרכיבים של M6/M7 קבועים ל־0), קבועי המדידה (מתיחה/2, כיווץ/3 פר־רווח; NBSP; רצף רווחים=k רווחים), מצבי justification, badness שלם עם תקרה, תיקו לפי רצף אינדקסי שבירה, אלטרנטיבות שנדחו (סקלר משוקלל, Pareto, Infinity) ותנאי ביטול.
  - `layout-engine/src/linebreak/quality.ts` — QualityVector, compareQuality לקסיקוגרפי (total order), addQuality (אינווריאנטי לחיבוד — תנאי ה־DP), lineQualityVector, createQualityCostModel (מודל הייצור משלב זה), qualityDisplayScalar (תצוגה בפנקס בלבד).
  - `dp.ts` שודרג: תיקו וקטורי נשבר לפי **רצף אינדקסי השבירה** של המסלול (מטמון עצל לכל צומת) ורק אחר־כך מזהה יצירה — תאום מלא ל־ADR-004 §3 ולאפיון §8.2 ("כל tie נשבר לפי רשימת break indices").
  - `layout-engine/src/linebreak/ledger-adapter.ts` — **כל דחייה וניצחון נרשמים**: לכל קו רשומת line-break עם המועמדים שהוערכו בנקודת הקצה שלו, הזוכה, הדחויים (overflow/underfill/spans/dominated-by-comparator), תקציב ו־spans; תקף מול DecisionLedgerBuilder אמיתי (חיבור ל־typeset בשלב 47).
- **בדיקות:** `test:packages` — **648/648** (638+10); `verify-quality-comparator` — **25/25** (כולל תכונות סדר דטרמיניסטיות: אנטי־סימטריה ואינווריאנטיות לחיבוד על מדגמים מוזרעים); root `tsc --noEmit` נקי.
- **ממצאים:** הוכח כי אילוץ קשה אינו מנוצח על ידי cost: פסקה עם מילה גולשת ⇒ best=null עם דחיות מתועדות — ה־DP מסרב לתמחר מועמד בלתי חוקי גם במחיר "אין פריסה" (הסולם בשלב 44 פותר זאת במדורג). המודל הסקלרי של שלב 42 נשאר לבדיקות בלבד. אין שינוי layoutHash.

### תיקון CI סבב י"ד–ט"ו — יישום אבחון סבב ט' ונעילת מונה בצעד האב; **ה־CI ירוק** — 2026-11-02
- **סבב י"ד (יישום האבחון הגנוז מסבב ט'):** ריצת הסוויטה שותפה — ה־CI מריץ `test:packages` **פעם אחת** בצעד האב (כולל נעילת מונה מדויקת), והמאמתים מדלגים על ריצות הבת הכפולות תחת `TORA_SKIP_TEST_REGRESSION=1`; מקומית הם ממשיכים להריץ הכל. הרקע: 26 ריצות מלאות ברצף באותו job קרסו מלחץ משאבים (הכשל של 67e8f8d — verify-enforcement קיבל פלט בלי "Tests N passed").
- **סבב ט"ו:** נעילת המונה בצעד האב נכשלה בגלל **צבעי ANSI בפלט vitest תחת CI=true גם בלי TTY** (שיעור חוזר מסבב ה') — תוקן: `NO_COLOR=1` לריצה + הסרת ANSI לפני ה-grep.
- **תוצאה:** **ה־CI (תכנית 100 השלבים) ירוק במלואו** ב־453c901 — לראשונה מאז שלב 33 כל השרשרת עוברת: build → typecheck (חבילות+שורש) → lint → deps → הסוויטה (615/615 עם נעילת מונה) → 30 מאמתים (כולל verify-text-audit הכבד ו-source-manifest עם token) → workspaces + conventions. **artifacts שלד המהלך עולים כ-artifact של הריצה** (upload-artifact).
- **הלקח המסכם של המילסטון:** חסימת CI ממושכת מסתירה שכבות כשל נוספות מתחתיה — עם שחרורה חייבים מלוא הסוללה מקומית + אימות שיבוט-טרי; ופלט תהליכי-בת תמיד עובר NO_COLOR+ניקוי ANSI לפני התאמת טקסט.

### תיקון CI סבב י"ג — קילוף הבצל: שלושה מאמתים ותיקים עודכנו לארכיטקטורה של פרק ה — 2026-11-02
- **הרקע:** לאחר שהבנייה וההקלדה ירוקו ב-CI (סבב י"ב), נחשפו שלוש בדיקות ותיקות שנכתבו לפני פרק ה ולא ראו את הקוד החדש (ה-CI היה חסום בבנייה מאז שלב 33): (א) verify-fixtures-schema סרק את כל src/ ותפס את תיקיות המעטפת החדשות כ"קוד ישן מחובר לחבילות" — עודכן לפטור את src/worker-host, src/renderers, src/stores (הנתיבים המאושרים של התכנית; הבדיקה מכוונת לקוד הישן בלבד); (ב) verify-notes תפס כל אזכור שם מספור במנוע — עודכן לזהות **הגדרה מקומית** (האנטי-תבנית האמיתית) ולא צריכה קנונית: המנוע v0 קורא ל-numberNotes/toGematriaLabel של שלב 20 דרך layout-api (רכזת ה-re-export של הגרף §5 — גם היא קיבלה פטור כמו content-model/index); (ג) verify-workspaces השווה את dependencies לגרף בדיוק ותפס את harfbuzzjs/wawoff2 של ה-CLI — עודכן: הגרף ממפה תלויות פנימיות בלבד; תלויות חוץ מותרות למארח בלבד ורק להרכבת הספק (ADR-003) — נוספה בדיקה ייעודית לכך; (ד) verify-work-conventions: תבנית tests/ הורחבה לספרות (tests/e2e-skeleton).
- **הלקח השיטתי:** כשה-CI חסום חודשים בשכבה אחת, השכבות שמתחתיה לא נבדקות — עם שחרור החסימה חייבים להריץ **את מלוא הסוללה מקומית** (לא רק את מאמתי השלב החדש) לפני push. סבב זה הריץ את כל 30 המאמתים הניתנים להרצה מקומית (source-manifest עם token) — הכול ירוק; text-audit נבדק ב-CI בלבד (זיכרון).
- **בדיקות (ירוק):** מלוא הסוללה המקומית — 30 מאמתים; `test:packages` 615/615; `tsc --noEmit` שורש.

### תיקון CI סבב י"ב — הקלדת בדיקת ה-E2E (נתפס בשיבוט-טרי לפני אדום) — 2026-11-02
- **הבעיה:** בדיקת ה-E2E של שלב 39 (tests/e2e-skeleton) נכתבה בהקלדה חלקית — vitest מריץ אותה ירוק (esbuild משמיט טיפוסים) אבל typecheck השורש (צעד CI משלב 35) נכשל: שמות מרחב דינמיים כטיפוסים (ma./la.), narrowing של find() לא נשמר בפונקציה מורמת, והתאמת WorkerLike. **נתפס באימות שיבוט-טרי** (הריצות b77bddf/6f6689d ב-CI אכן נכשלו על זה) — מקומית דילגתי על root tsc אחרי שלב 39.
- **התיקון:** ייבואי טיפוסים סטטיים; היצרות const אחרי ה-guard; הקלדת הערוץ כ-WorkerLike. **typecheck שורש נוסף ל-verify-e2e-skeleton** — כל מאמת שלב שמוסיף קוד חייב להריץ אותו מעכשיו (vitest אינו בודק טיפוסים).
- **בדיקות (ירוק):** `tsc --noEmit` שורש; 10/10 E2E; `verify-e2e-skeleton` — 12/12.

### שלב 40 — דגל מנוע מפורש engine: legacy|next (שער M4) — הושלם 2026-11-02
- **תוצרים:**
  - `layout-api/src/run-manifest.ts` — **הדגל שדה חובה בכל RunManifest**: `engine: 'legacy' | 'next'` — validation דוחה manifest בלי הדגל או עם ערך זר; makeRunManifest מקבל ומקפיא אותו. ההסתייגות של שלב 32 ("השדה יתווסף בשלב 40 בלבד") מומש.
  - `layout-engine` — חבילה זו היא 'next': כל מניפסט שלה נושא engine='next' מהמקור; **legacy אינו חלק מחבילות הליבה** — הוא הבייסליין הקפוא (docs/migration/baseline) לריצות differential (שלב 48+).
  - `cli` — דגל `--engine legacy|next` (ברירת מחדל next לתקופת הפיתוח): **legacy ⇒ דחייה מקוטלגת ENGINE_LEGACY_LOCKED לפני כל ריצה** — המנוע אינו מופעל, לא נכתבים artifacts, אין fallback שקט ל-next ואין מסלול צד; ערך זר ⇒ שגיאת שימוש. report.json נושא את הדגל. **rollback מוגדר: החזרת next ל-SHA קודם (git revert) — לא החלפת מנוע בשקט.**
  - בדיקות: מנוע — manifest.engine='next' ואינו משנה hash; CLI — legacy נדחה עם קוד+פרמטרים ובלי artifacts, bogus נדחה, ברירת מחדל רצה ומניפסט נושא next.
  - `verify-engine-flag.mjs` — 19 בדיקות + **שער M4 המלא**: validation דוחה חסר/זר; מניפסט מנוע/CLI נושאים next; legacy ⇒ 2 + ENGINE_LEGACY_LOCKED + אפס artifacts; **שער §18-M4 — fixture קטן קצה־לקצה ב-Node וב-Worker עם אותו hash (10/10); אין HTML בתוך החלטות המנוע (סריקת קוד); ביטול job עובד; rollback מתועד**; רגרסיה מלאה.
- **בדיקות:** `npm run test:packages` — 615/615 (613+2); `verify-engine-flag` — 19/19; verify-typeset-contract/layout-ir/layout-engine/render-html — ירוקים.
- **ממצאים:** **שער M4 מלא עבר** — פרק ה כולו (31–40) שלם: IR, חוזה typeset, מנוע v0, CLI, Worker, preview, render-html, audit, E2E ודגל מנוע. הלקח הכפול מסבב י"א (קובץ חסר בעקיבה): אימות `git ls-files` אחרי כל שלב נכנס לשגרה. אין שינוי בקוד הישן.

### שלב 39 — מבחן שלד מהלך קצה־לקצה (M4) — הושלם 2026-11-02
- **תוצרים:**
  - `tests/e2e-skeleton/e2e-skeleton.test.ts` — **מבחן E2E ארכיטקטוני (10 בדיקות)** על fixture ייחוס אחד עם הספק האמיתי (HarfBuzz/WASM): (1) שלוש ריצות CLI כתהליכים אמיתיים (כולל שם קובץ שונה) ⇐ אותו layoutHash + artifacts מלאים; (2) IR קנוני שומר hash ב-round-trip והמניפסט תואם; (3) Node בתהליך — trace off/decisions ⇐ אותו hash וגם == hash ה-CLI; (4) **cold/warm (withShapingCache שלב 26) ⇐ אותו hash**; (5) **Worker דרך הפרוטוקול (WorkerClient+handler) ⇐ אותו hash — Node==Worker מוכח**; ביטול job עובד ואינו משפיע על הבא; (6) HTML קנוני ביט-ביט — render-html מה-IR של שתי ריצות ו-preview.html של ה-CLI ⇐ אותם bytes; (7) audit נקי עם כיסוי אטומים מלא; (8) מודל preview דטרמיניסטי; (9) engine:audit בקריאה נפרשת ⇒ 0; (10) **שחזור מלא מ-request.json — אותה בקשה ⇐ אותו hash (offline)**.
  - `scripts/migration/verify-e2e-skeleton.mjs` — 11 בדיקות: ה-E2E ירוק; **ריצת ייחוס ← artifacts/e2e-reference/ (שבעה artifacts) — מועלים כ-artifact ב-CI** (upload-artifact, שמירה 30 יום); engine:verify הרשמי (§12.2) מריץ בדיוק מאמת זה; רגרסיה מלאה.
  - `artifacts/` נוסף ל-.gitignore (פלט ריצות בלבד).
- **בדיקות:** `npm run test:packages` — 613/613 (603+10); `verify-e2e-skeleton` — 11/11; `npm run engine:verify` — ירוק.
- **ממצאים:** (א) השוואת ה-HTML דרשה את אותו AssetManifest שה-CLI מעביר (עיגון גופנים) — הועתק לבדיקה; (ב) הייבוא של קוד המעטפת בבדיקות נעשה סטטי (כמו ב-tests/worker-host) — עקבי ופשוט יותר מדינמי. אין שינוי בקוד הישן.

### שלב 38 — Audit גאומטי וטקסטואלי על IR (M4) — הושלם 2026-11-02
- **תוצרים:**
  - `packages/audit-core/src/layout-audit.ts` — **auditLayout (§12, §14.2)**: שכבת טקסט — **כיסוי אטומים** (כל אטום מקור בדיוק פעם אחת בגוף/notes, בניכוי suppress מוצהרות; איבוד/שכפול/זר ⇒ HIGH) + **קישוריות הערות** (סמן↔גוף; גוף ממוספר בלי סמן ⇒ HIGH — sidenotes לא-ממוספרות פטורות ב-v0, החלטת מנוע מתועדת); שכבת גאומטריה — גלישת run מרוחב הקו (HIGH; §8.2 — הועבר מהאימות המבני), הכלה region⊆page ו-item⊆region, חפיפת קווים באזור (HIGH), baseline בתוך הקו (HIGH — הגנה כפולה מעבר לשער ה-IR), ייחוס אזור (HIGH); איכות — סדר טורים RTL (MEDIUM; שמאל מלא בעוד ימין ריק) ואחידות גובה שורה (MEDIUM). ממצא §14.1 מלא: code/severity/messageKey/params + מיקום ב-IR (pageId/regionId/itemId) + sourceSpans + actual/expected. **12 קודי ממצא רשומים — אין קוד צד.**
  - הביקורת טהורה: לא משנה את התוצאה, לא מריצה מדידה מחדש (חתימת המדידה נשמרת לפי §12 לשכבות עתידיות); שתי קריאות ⇐ דוח זהה.
  - **ה-CLI משלב את הביקורת** (השלמת חובת שלב 34): engine:layout מפיק audit.json + סיכום ב-report.json; **engine:audit (בקריאה נפרשת, §12) על artifacts קיימים** — layout.json+request.json → audit.json; **קוד יציאה 7 = ממצאי HIGH** (מתועד ב-USAGE ובקטלוג).
  - `tests: packages/audit-core/test/layout-audit.test.ts` — **12 בדיקות**: פריסת v0 תקינה ⇐ 0 HIGH + כיסוי מלא; טוהר; איבוד/שכפול אטום; גלישת run (מוטציה עוברת את שער ה-IR ונתפסת בביקורת); חפיפת קווים; סמן בלי גוף; גוף ממוספר בלי סמן; סדר טורים (MEDIUM בלבד); baseline (על אובייקט גולמי — הגנה כפולה); קלט שגוי מקוטלג. `packages/cli/test/cli.test.ts` +2 — מצב הביקורת העצמאי וקוד 7.
  - `verify-layout-audit.mjs` — 16 בדיקות: חוזה סגור; 12 בדיקות יחידה; ה-CLI כתהליך-בן אמיתי — layout נקי ⇒ 0, audit נפרד ⇒ 0, **מוטציית איבוד אטום דרך ה-CLI ⇒ יציאה 7 + ATOM_MISSING ב-audit.json**; רגרסיה.
- **בדיקות:** `npm run test:packages` — 603/603 (589+12+2); `verify-layout-audit` — 16/16; `verify-cli` — 28/28.
- **ממצאים:** **הביקורת תפסה מיד שתי סוגיות אמיתיות בפריסת הייחוס**: (א) גוף sidenote (דיבור המתחיל, sn-1) בלי סמן — התברר כהחלטת v0 מתועדת (sidenote לא-ממוספרת אינה מקבלת סמן; כללי H בפרק ז) — הכלל הותאם להערות ממוספרות בלבד; (ב) **גלישת קו חירום אמיתית** — מילת הענק מבחינת המנוע (EMERGENCY_LINE, §8.2 אין חיתוך) גורמת overflow HIGH — התנהגות נכונה של הביקורת; הוסרה מפיקסטורת הייחוס (תרחיש החירום מכוסה בבדיקות המנוע והביקורת) — **ריצת הייחוס נקייה: 0 ממצאים, 191/191 אטומים**. אין שינוי בקוד הישן.

### שלב 36 — תצוגה מקדימה בריאקט צורכת IR (M4) — הושלם 2026-11-02
- **תוצרים:**
  - `src/renderers/preview-model.ts` — **ההיטל הטהור IR←מודל תצוגה**: חד-כיווני, דטרמיניסטי (אותו IR ⇐ אותו מודל), **CSS logical properties בלבד** — insetInlineStart/insetBlockStart/inlineSize/blockSize בפרשנות הכיוון של ה-DOM (עמוד rtl — מימין), בלי חישוב שמאל/ימין כפול. ההמרה LU→px רציונלית (luToCssPx).
  - `src/renderers/PageView.tsx` — **PageView מקבל LayoutPage בלבד (§13.2)**: עמודים/אזורים/קווים/ריצות/סמני הערה עם data-page-id/data-region-id/data-fragment-id/data-source-id; הטקסט כערכי React — אין dangerouslySetInnerHTML.
  - `src/renderers/LayoutPreview.tsx` — המיכל: מצבי loading/error/empty/ready מגיעים מה-props (הקומפוננטה אינה מכירה Worker ואינה מריצה typeset); שגיאה מוצגת כמפתח קטלוגי+params; **zoom הוא transform של המיכל בלבד — אינו מודד מחדש ואינו משתתף ב-layoutHash**.
  - `src/worker-host/use-typeset-worker.ts` — החיבור ל-WorkerClient: מצב idle/running/done/error/cancelled (תואם runStore §13.1); ריצה חדשה מבטלת את הקודמת (supersede); ה-IR מגיע מ-parseLayoutDocument של התוצאה הקנונית.
  - `tests/component/preview.test.tsx` — **8 בדיקות ב-jsdom** על IR אמיתי מהמנוע: IR קבוע מוצג עם מאפייני הזהות; **נאמנות היטל — כל span של run נושא בדיוק את טקסט ה-IR** (סדר חזותי כמקובל ב-v1 — ההחלטה הסופית ADR-008 שלב 88); zoom=2.5 משנה transform בלבד והפיקסלים הפנימיים זהים; **אפס קריאות getBoundingClientRect ברינדור**; מצבי error/running/empty; ההיטל טהור (זהות עמוקה + הכלה לוגית); ה-hook עם המנוע האמיתי דרך הערוץ — layoutHash זהה לקריאה ישירה.
  - `verify-preview.mjs` — 15 בדיקות: אין ייבוא מנוע בתצוגה; אין dangerouslySetInnerHTML בשימוש; אין מדידת DOM בקוד; logical properties בלבד; 8 בדיקות קומפוננטה; typecheck שורש; רגרסיה.
- **בדיקות:** `npm run test:packages` — 589/589 (581+8); `verify-preview` — 15/15; `tsc --noEmit` (שורש) — ירוק.
- **ממצאים:** (א) טקסט הריצות ב-IR מאוחסן בסדר חזותי (מיפוי ה-BiDi של שלב 33) — התצוגה נאמנה ל-IR כפי שהוא; ייצוג הקו הסופי יוחלט ב-ADR-008 (שלב 88) ואז כל ההיטלים יתעדכנו יחד. (ב) jsdom מסופק ברמת הקובץ (docblock) בתוך תצורת החבילות. אין שינוי בקוד הישן.

### שלב 35 — פרוטוקול Worker ו־WorkerClient (M4) — הושלם 2026-11-02
- **תוצרים:**
  - `src/worker-host/protocol.ts` — **הפרוטוקול לפי §12.1 בדיוק**: WorkerRequest = prepare (jobId + protocolVersion + payload) | cancel; WorkerResponse = progress (stage/completedUnits/totalUnits?) | done | error (errorCode + params — לעולם לא raw message). PreparePayload: בקשת typeset מלאה + גופנים (רשומת מניפסט + bytes) + WASM — **הכול עובר מקומית בערוץ** (אין רשת; §19). אימות הודעות מלא (workerRequestIssues/workerResponseIssues) — errorCode חייב תבנית קטלוגית.
  - `src/worker-host/engine-worker.ts` — ה-handler הטהור (אין self/onmessage — הקשירה לדפדפן בקובץ עטיפה נפרד): בניית ספק מהמטען → typeset עם observer שמתורגם ל-progress → done עם **ה-IR בסריאליזציה הקנונית (זהה ביט-ביט ל-CLI)**; שגיאה ⇒ מפתח קטלוגי + params; jobId כפול נדחה; **cancel לפני הרצה — ה-job לא רץ כלל; cancel במהלך/אחרי — התוצאה נזרקת** (המנוע סינכרוני ב-v0 — הביטול מכובד בגבולות job והלקוח זורק תוצאות מאוחרות; מתועד).
  - `src/worker-host/worker-client.ts` — WorkerClient: מפת עבודות עם **הגנת stale-job דו-שכבתית** — לפי jobId (ביטול ⇒ כל הודעה מאוחרת נזרקת) **ולפי inputHash** (done עם inputHash שגוי נזרק — לא מוצג ישן כחדש); supersede אוטומטי ב-submit חדש; שגיאות כ-WorkerTypesetError (מפתח+params); ביטול אינו משנה job הבא (§17.2#10); **אין לו כל גישה למנוע — אין עימוד ב-main thread**.
  - `src/worker-host/worker-entry.ts` — הקשירה לדפדפן (דק במכוון): self.onmessage → handler; הספק נבנה בעובד מה-bytes שהועברו עם אימות hash חוזר (verifyFontBytes שלב 25).
  - `tests/worker-host/worker-host.test.ts` — **13 בדיקות עם ערוץ מזויף (FakeChannel) המחובר ל-handler האמיתי עם המנוע האמיתי**: אימות הודעות (קבלה/דחייה); progress זורם ו-done קנוני; שגיאה עם מפתח קטלוגי ולא message גולמי (נאסר "סודות" בפלט); jobId כפול; cancel מוקדם; **hash זהה ל־Node** (submit דרך הערוץ ⇐ קריאה ישירה למנוע — אותו layoutHash); ביטול ⇒ rejects + done מאוחר נזרק; inputHash שגוי נזרק; supersede.
  - `verify-worker-host.mjs` — 19 בדיקות: טוהר ההפרדה (המנוע נקי מ-Worker; הלקוח אינו מייבא typeset); 13 בדיקות ההודעות; **typecheck שורש (src+tests) — חדש ב-CI**; הפרוטוקול תואם §12.1; רגרסיה מלאה.
- **בדיקות:** `npm run test:packages` — 581/581 (568+13); `verify-worker-host` — 19/19; `npx tsc --noEmit` (שורש) — ירוק.
- **ממצאים:** (א) layout-api החל להחזיר גם את FontManifestRecord (הצרכנים מקבלים הכל דרך layout-api — גרף §5); ProviderFactory מוגדר על AnyProvider (ספק בדיקה חוקי בהזרקה, לא רק ספק ייצור). (ב) בדיקות המעטפת נוספו ל-vitest.packages.config.ts (tests/worker-host) — סביבת node. (ג) שני קודי שגיאת עובד חדשים (errors.worker.DUPLICATE_JOB/ENGINE_UNCLASSIFIED) תועדו בקטלוג ה-i18n. אין שינוי בקוד הישן.

### שלב 34 — CLI reference runner (M4) — הושלם 2026-11-02
- **תוצרים:**
  - `packages/cli` — **ה־reference runner המלא (§12.2)**: `main.ts` (בינארי דק: args ← runCli ← קוד יציאה; stdout קנוני בלבד, הודעות אנושיות ב־stderr), `args.ts` (מנתח טיעונים ללא תלות חיצונית; דגלים: input/out/settings/preset/fonts-manifest/fonts-dir/body-font/trace/repeat/html/help), `inputs.ts` (קלט מאומת: מרשם הגדרות, שכבות preset+settings דרך buildEffectiveSettings של שלב 30, מניפסט גופנים + פתרון גוף לפי fontId/קובץ/משפחה, loadFontSet + createHarfbuzzProvider — הספק האמיתי), `offline-guard.ts` (שומר רשת מרגע ההתחלה — §19; אין דגל היתר), `runner.ts` (תזמורת: repeat ריצות חייבות אותו hash; אימות round-trip של הסריאליזציה §17.2#9; כתיבת artifacts).
  - **Artifacts קנוניים ללא חותמות זמן** (§15.1): layout.json (IR מסודר), manifest.json, ledger.json (כש-trace≠off), request.json (קלט מלא לשחזור — מקור+הגדרות+גופן+האשים), report.json (סיכום: layoutHash/עמודים/דטרמיניזם) ו־preview.html עם --html (דרך render-html של שלב 37).
  - **קודי יציאה מתועדים** (§12.2): 0 הצלחה · 2 שימוש · 3 קלט · 4 גופן/מדידה · 5 מנוע · 6 פלט. קטלוג `CLI_ERROR_CATALOG` — 13 קודים מתועדים ב־docs/i18n/error-keys.md.
  - **documentId קבוע 'cli-reference'** — שם הקובץ/נתיב אינם נכנסים לפריסה (§17.2#8); גרסת פרסר `content-model@0.1.0` נעולה ונבדקת מול package.json במאמת.
  - סקריפט שורש `engine:layout`; bin `tora-engine`; `registry.json` של settings-schema נחשף כ-subpath export.
  - `verify-cli.mjs` — 28 בדיקות: הבינארי כתהליך-בן אמיתי (לא רק ה-API) — exit codes בפועל; שלוש ריצות ⇐ אותו hash; אדישות לשם קובץ; שגיאות ממוקדות עם קוד+מיקום; עקביות גרסאות וקטלוג; רגרסיה מלאה.
- **בדיקות:** 8 בדיקות יחידה (`cli.test.ts`) — ריצת reference מלאה עם הספק האמיתי; שתי ריצות CLI שלמות ⇐ אותו hash; שם קובץ שונה ⇐ אותו hash; קלט חסר/JSON שגוי/מפתח זר ⇒ exit 3 ממוקד; גופן לא קיים ⇒ exit 4; דגלים שגויים ⇒ exit 2. `npm run test:packages` — 568/568; `verify-cli` — 28/28.
- **ממצאים:** (א) ה־CLI מפיק IR+מניפסט+פנקס+HTML אך עדיין לא audit — הביקורת נבנית בשלב 38 ואז תתווסף לפלט (תלות טבעית: 34 לפני 38 בתכנית). (ב) wawoff2 חסר טיפוסים — הצהרת vendor.d.ts מקומית ב־CLI בלבד. (ג) הגדרות דרך שכבות בלבד — אין עקיפת צינור הייבוא של שלב 30. אין שינוי בקוד הישן; הוספות בלבד (בחבילת cli שנוצרה בשלב 7).

### תיקון CI סבב י' — ריכוז העיגול נאכף גם על קוד המנוע (ריצות a452c69/eb43302) — 2026-11-02
- **הבעיה:** ה־CI נכשל בשלב 33 (ובעקבותיו ב־37) במאמת היחידות: `Math.round` מחוץ ל־units.ts — `packages/layout-engine/src/v0/v0-settings.ts` (שלוש נקודות: קוונטיזציית prop-margin לאחוזים-שלמים, מכפיל line-height לאחוזים, ערך התחלתי של פוליו). מקומית לא נראה כי שלב 33 הריץ את מאמתי היחידות — רק את verify-layout-engine שלו.
- **התיקון:** הפונקציה `quantizeSetting(value, denominator, ctx)` נוספה ל־`units.ts` (מרכז העיגול לפי ADR-001 §4) עם קוד שגיאה ייעודי `errors.units.NON_FINITE_QUANTIZE`; היא מיוצאת דרך layout-api; שלוש הנקודות ב־v0-settings הוחלפו אליה — **ללא שינוי ערכים** (עיגול חצי-כלפי-∞ זהה). קטלוג השגיאות תועד ב־docs/i18n/error-keys.md; מאמת measurement-api עודכן ל־23 קודים.
- **השלמת חובות תיעוד:** רישומי ה־WORKLOG של שלבים 33 ו־37 לא נכתבו בזמן (ההודעה נקטעה באמצע הרצה) — הם מושלמים כאן לפי ה־commits המדויקים; CHECKLIST סומן ל־37/100 (31–33, 37).
- **פקודות בדיקה שרצו (ירוק):** `npm run build:packages`; `npm run test:packages` — 560/560 (557 + 3 בדיקות quantizeSetting); `verify-units` — 39/39; `verify-measurement-api` — 31/31; `verify-parser` עודכן ל־560.
- **הלקח:** שלב שנוגע בגאומטריה/הגדרות חייב להריץ את `verify-units` (כלל שנלמד בסבב ג' אך לא הוחל על הקוד החדש של פרק ה); ריצת CI אדומה היא חובת תיקון לפני כל שלב הבא.

### שלב 37 — render-html טהור v1 (M4) — הושלם 2026-11-01 (commit eb43302)
- **תוצרים:**
  - `packages/render-html/src/render.ts` — **renderHtml(layout, styleManifest?, assetManifest?) טהורה (§15.1)**: היטל HTML/CSS מה־IR בלבד; המרה רציונלית LU→px בלבד (`luToCssPx` = roundDiv(lu,49152), 12pt=16px); escaping קבוע לטקסט/מאפיינים (escapeHtmlText/escapeAttr); עיגון גופנים לפי AssetManifest (@font-face עם src קבוע; אין גופן רשת/CDN); **קנוני ביט-ביט** — אותו layout+assets ⇐ אותם bytes; נקי מ-DOM/CSSOM/רשת/`window.print`.
  - ייצוג הקו ב-v1 (מסומן כזמני): ריצות ממוקמות פיזית (left/top) עם `dir` לפי כיוון הריצה; ההחלטה הסופית — ADR-008 (שלב 88).
  - `verify-render-html.mjs` — 15 בדיקות: חוזה מיוצא; קנוניות חיה על פלט v0 (שתי קריאות ביט-ביט; round-trip דרך parseLayoutDocument ⇐ אותם bytes; שינוי IR ⇒ bytes שונים); טוהר הקוד (אין document/window/fetch); רגרסיה.
- **בדיקות:** 9 בדיקות יחידה (`render-html.test.ts`); `npm run test:packages` — 557/557 (548+9); `verify-render-html` — 24/24.
- **ממצאים:** אין שינוי בקוד הישן; הוספות בלבד. השלב בוצע מחוץ לסדר (לפני 34–36) — תועד כאן; החובות המסתובכות (CLI/Worker/Preview) בשלבים 34–36.

### שלב 33 — מנוע בסיסי דטרמיניסטי v0 (M4) — הושלם 2026-11-01 (commit a452c69)
- **תוצרים:**
  - `packages/layout-engine/src/v0/typeset-v0.ts` (747 שורות) — **הצינור המלא (§5–7, §18-M4)**: קלט → טוקנים (אטומים+סמני הערה+עוגנים+שבירה כפויה) → BiDi (UAX #9 שלב 28) → shaping לפי רצופי רמה → **שבירה גרידית נרשמת בפנקס** (כל קו = רשומת החלטה עם מועמדים, דחיות וחירום רשום EMERGENCY_LINE) → עמודים (טור ימין 0 ואז שמאל 1; §9.3) → עמודי notes לגופי ההערות (NOTES_V0_DEFERRED) → IR + מניפסט + פנקס. אין Canvas/DOM/שעון/אקראיות; observer מדווח בלבד.
  - `v0-settings.ts` — קריאת הגדרות v0 מאומתות: גאומטריית A4 + שוליים 25mm (ברירת המחדל הנעולה של הישן) + רוחב טורים לפי נוסחת הישן (typeset-document.ts:33–40) בחשבון LU שלם; folio גימטריא.
  - השלמת חוזה שלב 32: `sourceSha256`/`parserVersion` בבקשה; `environmentHash` רופף למחרוזת נעולה; **גלישת קו הועברה מהאימות המבני של ה־IR לביקורת** (§8.2 — אין חיתוך; האימות בודק הכלה מבנית בלבד והביקורת תדווח overflow בשלב 38).
  - `verify-layout-engine.mjs` — 24 בדיקות: דטרמיניזם (שתי ריצות ⇐ אותו hash); trace off/on; observer נטול השפעה; חירום מילה ארוכה + כיסוי אטומים 100%; מבנה עמודים/טורים/עמודי notes/סמני הערה; רגרסיה.
- **בדיקות:** 16 בדיקות יחידה (`typeset-v0.test.ts`); `npm run test:packages` — 548/548 (532+16); `verify-layout-engine` — 30/30.
- **ממצאים:** (א) עיגול ההגדרות נכתב עם Math.round מקומי — **נתפס על ידי verify-units ב־CI ותוקן בסבב י'** (ראו למעלה). (ב) הערות בהיקף 'page' נדחות בהסבר (NOTES_V0_DEFERRED בפנקס) — שריון אמיתי בפרק ז. אין שינוי בקוד הישן.

### שלב 32 — חוזה typeset(), RunManifest ו־Decision Ledger (M4) — הושלם 2026-11-02
- **תוצרים:**
  - `packages/layout-api/src/typeset.ts` — **החוזה המלא (§12)**: `TypesetRequest` (מסמך+הגדרות+נכסים פתורים+trace+budget), `TypesetSuccess`, `LayoutPolicy` (hooks של §10: legalBreaks/hardConstraints/pageTemplate/score/onAnchor/anchorPlacement — ממומשים בפועל בפרק ח; הליבה אינה יודעת מהו H2), `LayoutObserver` (progress בלבד; אין ערוץ השפעה), `ContentDocument` = TorahDocument + ספר טרנספורמציות, `SearchBudget` (יחידות מצבים, לא מילישניות; §9.2), `ResolvedAssetManifest` (גופנים פתורים לפי usage + האשים שנכנסים ל-inputHash).
  - `run-manifest.ts` — RunManifest עם כל ההאשים: input/config/fontsManifest/assetsManifest/environment/layout + engineVersion/codeSha ('dev' בפיתוח, §12). השדה `engine` יתווסף בשלב 40 בלבד (אין לסמן לפי תקווה — כלל 5).
  - `decision-ledger.ts` — DecisionRecord (stage/scopeId/sourceSpans/stateHash/candidates/selected/rejected/fallbackCode/budget), `DecisionLedgerBuilder` עם trace off|summary|decisions|full (off ⇒ אין ledger; §6.7), סריאליזציה round-trip; **`LAYOUT_FALLBACK_CODES` — קטלוג fallback רשום מראש** (EMERGENCY_LINE/NOTES_V0_DEFERRED ל-v0 + SEARCH_BUDGET_EXHAUSTED/EMERGENCY_STRETCH/LONG_NOTE_SPLIT/TOC_FIXED_POINT_NOT_REACHED לעתיד) — קוד לא רשום נדחה בזמן יצירה; אין קוד צד.
  - TraceLevel עבר ל-decision-ledger (typeset→decision-ledger הכיוון היחיד) — תפיסת no-circular של depcruise.
- **בדיקות:** 13 בדיקות (`typeset-contract.test.ts`) — trace off/on; round-trip רשומות; fallback לא רשום ⇒ דחייה; configHash אדיש לסדר מפתחות (§17.2#4). מאמת `verify-typeset-contract.mjs` — 33/33.
- **ממצאים:** הוספות בלבד; קטלוג שגיאות layout-api (9 קודים) תועד ב-docs/i18n/error-keys.md; אין שינוי בקוד הישן.

### שלב 31 — Layout IR מלא (layout-api) — הושלם 2026-11-02
- **תוצרים:**
  - `packages/layout-api/src/ir.ts` — **כל צורות ה-IR (§6.5)**: LayoutDocument (schemaVersion/policyId/pages/anchors/transformations), LayoutPage (parity לפי physicalIndex עוקב; kind; printedFolio), LayoutRegion (7 סוגים; columnIndex 0|1), LineFragment (breakReason/continuation/fragmentIndex/lineIndex/baseline/runs/sourceSpans), PositionedRun (**נושא text בסדר לוגי** — ה-IR נושא את הטקסט כדי ש-render-html יעבוד ללו� תלות ב-content-model; §6.5 "אין contentHtml" — טקסט חי אינו HTML), PositionedGlyph, PositionedRule/Ornament (נכס לפי מזהה+hash; אין SVG מוטמע)/NoteMarker (label resolved + superscript)/Anchor, PageAnchor. PlacedItem = חמשת הסוגים.
  - אימות מבני מלא `layoutDocumentIssues`: ייחוסי regionId/itemId/pageId/anchorId (כולל כפילויות), physicalIndex עוקב 1..n, parity לפיו, rect חיוביים-בטוחים, **הכלה: region⊆page ו-item⊆region**, runs ללא חפיפה ובלי חריגה מרוחב הקו, baseline בתוך ה-rect. `createLayoutDocument` — אימות + הקפאה עמוקה (deep freeze).
  - `ir-serialize.ts` — serialize/parse קנוני (canonicalJson) — **round-trip משמר layoutHash ביט-ביט** (§17.2#9).
  - `projection.ts` — **luToCssPx = roundDiv(lu, 49152)** — רציונלי 1pt=4/3px; לא px/mm ההיסטורי האסור (§6.1).
  - index.ts: מונחי יסוד מומרזים (AtomId/SourceSpan/Rect/FontFaceKey/MeasurementProvider/computeBidi) — גרף §5 נשמר: הצרכנים מקבלים הכל דרך layout-api.
- **בדיקות:** 20 בדיקות (`ir.test.ts`) — round-trip; כפילויות/ייחוסי רפא/parity/קו מחוץ לאזור/run חורג; הקפאה (מוטציה נזרקת); היטל px. מאמת `verify-layout-ir.mjs` — 35/35 (כולל סריקה: אין 3.7795 בקוד החבילה).
- **ממצאים:** (א) בדיקת "אין רווחים קנוניים" נוסחה מחדש — שם משפחת הגופן ('Guttman Rashi') כשלעצמו מכיל רווח; הבדיקה מכוונת למבנה ולא לתוכן. (ב) verify-parser עודכן ל-532 (499 + 20 + 13). אין שינוי בקוד הישן.

### תיקון CI — הסרת שאריות בנייה מהעקיבה (בין שלב 27 ל־28) — 2026-11-01
- **הבעיה:** ה־CI ב־GitHub נכשל בצעד "בניית החבילות" מאז שלב 18 (לפחות), בעוד הרצות מקומיות היו ירוקות. **שורש התקלה:** בשלב 7 נכנסו לעקיבה 12 קבצי `tsconfig.tsbuildinfo` (מצב בנייה מקומי של TypeScript) ו־11 קבצי `src/index.d.ts.map` (שאריות פלט בנייה שנפלטו אז אל תוך `src/`; שלב 24 ניקה את ה־`.js`/`.d.ts` אך ה־`.d.ts.map` הושמטו). בשיבוט טרי — כמו בראנר של CI — ‎`dist/`‎ אינו קיים, ו־`tsc -b` קורא את ה־tsbuildinfo הישן ומדלג/נכשל בפתרון `@tora/content-model` ו־`@tora/measurement-api` (TS2307). מקומית זה לא נראה כי ‎`dist/`‎ מהבנייה הקודמת נשאר על הדיסק.
- **התיקון:** הסרת כל הקבצים מהעקיבה ומהדיסק; הוספת חוקי `.gitignore` (`*.tsbuildinfo`, `packages/*/src/**/*.js|*.js.map|*.d.ts|*.d.ts.map`). בנוסף תוקנה שגיאת lint שנשארה מוסתרת מאחורי ה־CI האדום: ייבוא ‎`PreparedProviderCore`‎ שלא בשימוש ב־`packages/measurement-api/src/cache.ts` (שלב 26) — שתי הבדיקות שנכשלו ב־`verify-dependency-rules` איתרו אותה.
- **לקח ביצוע (תועד ביומן, שני commits):** הניסיון הראשון (‎3053448‎) נכשל חלקית — שרשרת הפקודה נקטעה ב־‎git rm‎ על קובץ בעל שינוי מקומי, עדכון ה־`.gitignore` לא רץ כלל, והבניות שאחר כך יצרו את ה־tsbuildinfo מחדש ו־‎git add -A‎ החזיר אותם לעקיבה מבלי שאיש יבחין. ה־CI המשיך להיכשל באותן שגיאות — **בדיקת אימות חייבת לכוון לתוצאה ("‎git ls-files | grep tsbuildinfo‎ ריק"), לא ל"הפקודה רצה"**. התיקון השני אוכף: ‎`.gitignore`‎ נכתב ואומת ראשון, רק אחר כך ההסרה, ואז אימות כפול (לא בעקיבה + מוסתר מ־status) ושחזור שיבוט-טרי מלא עד ירוק.
- **פקודות בדיקה שרצו (ירוק):** ניקוי מלא (`rm -rf packages/*/dist` + tsbuildinfo) ← `npm run build:packages` (עובר מאפס); `npm run test:packages` — 455/455; `npm run typecheck:packages`; `npm run lint:packages` (נקי); `npm run deps:check`; `verify-dependency-rules` — 22/22; `verify-units`, `verify-error-catalog`, `verify-fixtures-schema`, `verify-measurement-api` — ירוקים. אימות סופי: ריצת ה־CI ב־GitHub עצמה.
- **רגרסיה שנתגלתה לאחר שהבנייה הורתחה (שלישי):** מאמת היחידות סורק איסור הזזות סיביות (ADR-001) בקוד המקור — 3 קבצים משלבים 23/24/27 הפרו: ‎`font-manifest.ts`‎ (קריאת uint16 ביג-אנדיאנית) ו־‎`uax14.ts`‎ + ‎`provider.ts`‎ (נקודת אמצע בחיפוש בינארי, ‎(lo+hi)>>1‎). תוקן לחשבון שלם בטוח: כפל ב־‎0x100‎ במקום ‎<<8‎; ‎Math.floor((lo+hi)/2)‎ במקום ‎>>1‎ — מוסכמת הקוד הקיימת (notes.ts, hash.ts). הפרות אלו חדרו כי שלבים 23–27 הריצו את המאמתים הייעודיים שלהם אך לא את ‎verify-units‎, וה־CI — שמריץ את כל הסוללה — היה אדום בבנייה. לקח: מאמת יחידות רץ בכל שלב שנוגע ב־measurement; ו־CI אדום הוא חובת תיקון מיידית, לא רקע.
- **סבב רביעי — השלמת כל המאמתים שלא רצו מאז שלב 18 (הכל ירוק):** לאחר שהבנייה ובדיקות היחידה הורתחו ב־CI, הורצה מקומית הסוללה המלאה ונתגלו ותוקנו שלוש ציפיות מיושנות שנצברו בשלבים 23–27: (א) ‎`registry.json`‎ של test-fixtures הקפיד ‎fontManifestSha256‎ של מניפסט v1 — עודכן ל־v2 של שלב 23 (27 מופעים; הצלבה נועלת גרסת מניפסט); (ב) ‎`verify-parser`‎ נעל ‎373 בדיקות — עודכן ל־455 (323 עד שלב 21 + 50+13+21+17+16+15 שלבים 22–27); (ג) ‎`verify-measurement-api`‎ נעל 18 קודי שגיאה — עודכן ל־22 (15+3+3+1). בנוסף התקבל חריג תשתית מתועד: ‎`.gitignore`‎ נוסף ל־LIVING_FILES ב־‎verify-work-conventions`‎ (תקדים package.json — קובץ תשתית ללא השפעה על הקוד הישן; הכלל 8 נאכף על קוד/נכסים/תצורה של הישן). הערת סביבה: ‎`verify-text-audit`‎ (קורפוס מלא) נהרג מקומית מחוסר זיכרון (סביבת העבודה: 4GB) — עבר בשלב 21 וייבדק ב־CI (7GB); כך גם ‎`verify-source-manifest`‎ שדורש ‎GITHUB_TOKEN‎ (מוזרק ב־CI). תוצאה מקומית: כל 26 המאמתים שרצים ירוקים; ‎test:packages`‎ 455/455.
- **סבב חמישי — צבעי ANSI שברו התאמות טקסט ב־CI (נמצא בריצה efbfde4):** הבדיקות עצמן עברו ב־CI (455/455, 48/48) אך המאמתים נכשלו — ב־GitHub Actions ‎(CI=true)‎ chalk/vitest מצבעים את הפלט גם שלא דרך TTY, וקודי הצבע בין ‎"Tests"‎ למספר שברו את ‎includes('Tests  455 passed')‎. מקומית (בלי TTY) אין צבעים ולכן לא נראה. תוקן בארבעה מאמתים שמנתחים טקסט פלט vitest (‎parser, brackets, enforcement, text-audit‎): ‎run()‎ מזריק ‎NO_COLOR=1‎ לתהליך-בן וגם מנקה קודי ANSI מהפלט לפני ההתאמה (שתי הגנות עצמאיות). אומת בסימולציה מדויקת: ‎CI=true FORCE_COLOR=3‎ ← השלושה שרצים מקומית ירוקים; ‎text-audit`‎ נבדק ב־CI (מקומית חסר זיכרון לקורפוס המלא).
- **סבב שישי — verify-unicode כבן של text-audit נכשל תעתיק (ריצה 2bf0c76):** המאמת עבר עצמאית באותה ריצת CI (29 בדיקות, 17:01) אך נכשל כש־verify-text-audit הריץ אותו כבן (17:17) — הפרש הזיכרון: האב מחזיק את ביקורת הקורפוס המלאה שלו בזמן שהבן מריץ קורפוס + vitest. תוקן באבחון-ומיגון: מאמתי-הבן בסעיף 5 מקבלים ניסיון חוזר אחד + הדפסת 25 השורות האחרונות של פלט הבן בכל כשל — כשל דטרמיניסטי אמיתי יישאר אדום עם ראיה מלאה בלוג; קריסת זיכרון תעבור בניסיון השני. אין שינוי בלוגיקת הבדיקות עצמן.
- **סבב שביעי — הרחבת ה-ANSI-safe לכל המאמתים שמפענחים stdout (ריצה 3fde66a):** ה־CI נכשל בצעד 10 במאמת ‎verify-measurement-api‎: סעיף הרגרסיה דיווח ‎test:packages — נכשל‎ ב־18:06, בעוד שבאותה ריצה עצמה ‎test:packages‎ עבר מוקדם יותר (17:56, 455/455) — כלומר vitest ירוק וההתאמה ‎Tests\s+(\d+)\s+passed‎ נשברה. **שורש התקלה:** סבב חמישי תיקן את ארבעת המאמתים שנכשלו אז, אך לא את שאר המאמתים שמפענחים stdout של תהליכי-בן באותו תבנית בדיוק — ב־CI=true צובעים chalk/vitest/eslint/depcruise גם פלט שאינו TTY, והצבע נכנס בין "Tests" למספר. תוקן בשמונה קבצים: שמונה מאמתים קיבלו את התבנית המלאה (‎stripAnsi‎ + הזרקת ‎NO_COLOR=1‎ + ניקוי בשני המסלולים — הצלחה וכשל): ‎measurement-api, unicode, notes, fonts-manifest, harfbuzz-provider, shaping-cache, uax14‎ (סוג ‎A/B‎ — פלט נפרש לטקסט) ו־‎dependency-rules‎ (פלט eslint/depcruise). שמונה מאמתים שפוסקים לפי קוד יציאה בלבד (atoms, spans, inline-blocks, canonical-hash, error-catalog, fixtures-schema, property-tests, units) לא נדרשו — צבע אינו משפיע על קוד יציאה; ההחלטה מתועדת כאן. **הלקח המרכזי: תיקון תשתית חייב להיעשות לפי תבנית (pattern) ולא לפי מיקום הסימפטום** — תיקון לפי-סימפטום (whack-a-mole) היה חוזר בכל ריצת CI; כאן נסרקו כל 26 המאמתים, סווגו לפי סוג ה־run()‎ וכולם שנוגעים לפענוח טקסט תוקנו במכה אחת. אומת בסימולציה ‎CI=true FORCE_COLOR=3‎: שמונה מתוך שמונה ירוקים (31/29/22/29/31/17/20/22 בדיקות), כולל השורה שנשברה — ‎test:packages — 455 עוברות‎. אין שינוי בלוגיקת הבדיקות; אין שינוי בקוד הישן.
- **סבב שמיני — אכיפת lint במאמתים הייתה חיובית-שקרית (ריצה b72a048):** ה־CI של שלב 28 נכשל בצעד lint על שני משתנים שלא היו בשימוש ב־bidi.ts (STRONG, type) — בעוד שמקומית כל המאמתים הראו "lint:packages נקי". **שורש התקלה:** בדיקת ה־lint במאמתים הייתה ‎`lint !== null`‎ — אבל ‎run()‎ מחזיר את ‎e.stdout‎ גם בכשל (exit ≠ 0): פלט שגיאות ה־lint אינו null, ולכן כל כשל lint דווח כירוק. תוקן לפי התבנית שכבר הייתה קיימת ב־deps:check: ‎`lint !== null && !/\berror\b|✖/m.test(lint)`‎ — בכל 9 המאמתים שבדקו lint בדרך זו; בנוסף תוקנו שתי בדיקות build מוטמעות (unicode, brackets) בלי שומר טקסט. **הוכחה שהתיקון עובד:** נדקר במכוון משתנה שלא בשימוש ב־bidi.ts — המאמת דיווח ‎[FAIL] lint:packages נקי‎; הדיקור הוסר. הלקח: **בדיקת פלט תהליך-בן חייב להתבסס על תוכן הפלט ולא על קיומו** — exit ≠ 0 מגיע עם stdout שאינו null; רק תבנית הטקסט (error/✖/error TS) או קוד יציאה מפורש מבחינים בין הצלחה לכשל.

- **סבב תשיעי — חריגים מתועדים לשני סורקים + אבחון אי-יציבות test:packages ב-CI (ריצות b72a048/bf9fba1/3922918):** (א) שני סורקים תפסו את הקוד החדש של שלבים 28/30 כדפוס אסור, בלי להיות כפילות אמיתית: verify-units (ADR-001) — hash.ts של settings-schema הוא העתק מקומי של SHA-256 הנייב (מילים של 32 סיביות הן טבע האלגוריתם; אותו יישור כ-measurement-api/hash.ts); verify-brackets — BD16 של bidi.ts הוא זיווג סוגריים מקוונים של UAX #9 (Unicode), לא זיווג סוגריים legacy; שניהם קיבלו חריג מתועד עם נימוק. (ב) **אי-יציבות test:packages ב-CI**: באותו job עצמו (bf9fba1) הרצה דרך verify-cross-host הראתה 486/486 ירוקות, ואילו הרצה דרך verify-brackets נכשלה — הריצות של test:packages ב-CI אינן יציבות עדיין. **אבחון השוואה:** זו הפעם הראשונה שה-CI מגיע בכלל לצעד הבדיקות (היסטורית נחסם בבנייה); הכישלון אינו מלווה בפלט vitest כלל — המאמתים מסוג C (קוד יציאה בלבד) משליכים את הפלט. **תיקון נדרש בסבב הבא**: הוספת פלט אבחון לכל קריאת test:packages (25 שורות אחרונות בכל כשל — תבנית סבב ד') כדי לזהות את הבדיקה הכושלת; ייתכן גם לחץ משאבים ברצף 26 המאמתים (כל אחד מריץ build+test במלואם) — מועמד להפרדה/שיתוף. אין שינוי בלוגיקת הבדיקות עצמן.

- **ממצאים ולקח:** (א) **לולאת האימות שלב-אחר-שלב נשענה על ריצות מקומיות עם דיסק "חם"** — ה־CI האמיתי נכשל במשך עשרה שלבים מבלי שאיש שם לב, כי הבדיקה המקומית לא שחזרה שיבוט טרי. (ב) tsbuildinfo הוא מצב מקומי מכונה-תלוי ואסור שיהיה בעקיבה גיט — עקרון שייאכף גם בכל קובץ פלט בנייה עתידי. (ג) אין שינוי בקוד הישן; אין שינוי התנהגות (התיקון היחיד בקוד הוא הסרת ייבוא טיפוס שלא בשימוש).

### שלב 30 — חוזה settings-schema, מרשם כל הגדרות legacy והמיגרציות (שער M3) — הושלם 2026-11-02
- **תוצרים:**
  - `assets/settings/` — העתק נעול של מקורות ההגדרות (Orange@93ad1e57; SHA-256 נעול במרשם): default_settings.json (248 מפתחות) + שלושה פריסטים (פרשנות/קונטרס/תלמוד) + LAYOUT_DEPENDENCY_MAP.md.
  - `packages/settings-schema` — **החוזה המלא (§6.3)**: SettingDefinition (legacyKey/canonicalKey/default/טיפוס/enum/יחידה/affectsLayout/consumerId/ui), SettingRegistry, importSettings (השוואה דו-כיוונית; מפתח לא מוכר ← path+קוד, אינו נמחק), validateSettingValue, EffectiveSettings עם **configHash קנוני** (רק מפתחות פריסה; סדר keys אינו משנה; UI-only אינם נכנסים), buildEffectiveSettings עם סדר קדימות defaults<preset<document<override — **כל שכבה עוברת את אותו צינור ייבוא** (אין עקיפת אימות; המחרוזות-מספר legacy מוקנונות לפני ה-hash). SHA-256/canonicalJson — העתק מקומי מ-measurement-api (גרף §5 אינו מאפשר ייבוא צולב; תקדים ADR-002).
  - `registry.json` (מיוצר דטרמיניסטי) — **257 מפתחות = default ∪ פריסטים** (השוואה דו-כיוונית): 236 משפיעי פריסה + 21 UI-only (13 קבועים + 8 בוררי file-* מהפריסטים). לכל מפתח: מקור+SHA, ברירת מחדל מקורית, טיפוס (enum/number/boolean/dimension/color/font-stack/string), enum מתחומי הערכים שנצפתו, יחידה (למידות CSS), affectsLayout, consumerId, ui, section/control.
  - `docs/migration/settings-matrix.md` — המטריצה המלאה עם כללי הסיווג המתועדים; migrations — שרשרת טהורה vN→vN+1 (ריקה כרגע; v1→v1 זהות; הוספה תדרוש fixture לכל פריסט ולכל גרסה).
- **פקודות בדיקה שרצו (ירוק):** `npm run test:packages` — 499/499 (486 + 13); `verify-settings-schema` — 21/21 (CI=true FORCE_COLOR=3).
- **ממצאים:** (א) **מפתחות פריסט בלבד** — 9 מפתחות שאינם ב-default (בוררי file-*, assets-folder-input): נכנסו למרשם באיחוד; file-* ← UI-only (מצב בורר; התוכן נשמר ב-data-*), assets-folder-input ← פריסה (שורש נכסים). (ב) **ערכי legacy בעלי משמעות מיוחדת** — f-paren ריק = לא הוגדר (לא נפסל); s-paren:-2 חוקי במצב יחסי (s-paren-mode:'relative'; נעילה כ-RELATIVE_NEGATIVE_KEYS מתועד); inp-* ← string חופשי (לא enum). (ג) **"window" של drop-word-mode נשמר כערך legacy חוקי** — enum=['none','window']; אין המרה אוטומטית ל-sunken (נעילת התכנית; נבדק במאמת). (ד) **טעות יישום שנתפסה בבדיקות**: שכבות buildEffectiveSettings עקפו את צינור הייבוא — תוקן: כל שכבה עוברת importSettings (ערכים לא-חוקיים בשכבה ← דחייה; קנוניזציה אחידה לפני ה-hash). אין שינוי בקוד הישן; הוספות בלבד (מוני המאמתים עודכנו ל-499).

### שלב 29 — זהות מדידה בין hosts ואכיפת offline (M3) — הושלם 2026-11-02
- **תוצרים:**
  - `packages/measurement-harfbuzz/test/cross-host.worker.mjs` — מודול כפול: (א) **host שני עצמאי** ב־worker_threads (טעינה מלאה משלו: manifest → loadFontSet → פריקת WOFF2 → ספק; מופע WASM משלו; מחסנית משלו); (ב) הגדרת **הקורפוס הייצגי** — 14 כניסות על פני 4 משפחות גופנים, ≥5 גדלים (8–24pt), שני כיוונים (גם הפוך מהתוכן), he/en, features (kern/liga), ריווח אותיות 0/420, ניקוד וטעמים, מספרים, סוגריים, מעורב ופסוק ארוך.
  - **שומר הרשת (network deny)** — installNetworkDeny(): fetch/http/https נעטפים בספירה+זריקה סינכרונית; מותקן בשני ה-hosts מרגע ההתחלה, לפני כל טעינה. הרצה ירוקה של טעינה+מדידה תחת השומר = הוכחה שאין CDN, גופן רשת, WASM מרוחק או טעינה אקראית.
  - `cross-host.test.ts` (9 בדיקות) + `verify-cross-host.mjs` (21 בדיקות): environmentHash זהה בין ה-hosts (נגזר מהנעילות בלבד); **וקטורי הגליפים המלאים זהים ביט-ביט** (glyphId/clusterAtomIndex/advance/offsets/widthLu/חסרים — לא רק רוחבי מחרוזת); requestHash זהה לכל כניסה; cold ⇐ warm (withShapingCache) וזהה גם בין ה-hosts; אפס ניסיונות רשת בשני ה-hosts + עדות שלילית (fetch בפועל נתפס); סריקת מקור — קוד הייצור נקי מ-fetch/CDN.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 486/486 (477 + 9); `node scripts/migration/verify-cross-host.mjs` — 21/21 (CI=true FORCE_COLOR=3).
- **ממצאים:** (א) **כיסוי גופנים בקורפוס** — frank-ruhl-libre-hebrew ו-Guttman-Rashi שניהם חסרים אותיות לטיניות (קבצי המשנה של Google מפוצלים; גם המניפסט אינו מכיל גופן מעורב) — הקורפוס תוקן: מעורב = עברית+מספרים ב-Guttman (המספרים קיימים); הלטינית דרך assistant-latin בלבד. הבדיקה "נטול גליפים חסרים" שומרת שהקורפוס מודד גליפים אמיתיים ולא ‎.notdef‎. (ב) שומר הרשת זורק **באופן סינכרוני** — ניסיון גישה נכשל מיד, לא ב-promise; העדות השלילית מנוסחת בהתאם. (ג) worker_threads כ-host שני — עצמאות מלאה: ה-WASM מופעל מחדש, ההטמעות של שלב 24 (environmentHash מהנעילות בלבד) הוכחה כאן בפועל: שני hosts ⇐ אותם וקטורים ביט-ביט. אין שינוי בקוד הישן; הוספות בלבד (verify-parser/verify-bidi עודכנו ל-486).

### שלב 28 — רמות BiDi (UAX #9) עם מיפוי חזותי←לוגי (M3) — הושלם 2026-11-02
- **תוצרים:**
  - `packages/measurement-api/src/bidi.ts` + `bidi-tables.ts` (מיוצר) — **האלגוריתם המלא של UAX #9 revision 50 (Unicode 16.0.0)**: P2/P3 (auto; דילוג על תוכן isolates ועל מפעילי הטמעה); X1–X8 מלאים — מחסנית מצב כיווני, מוני overflow-isolate/embedding ו-valid-isolate, הגבלת עומק max_depth=125; X9 — הסרה לוגית בלבד (RLE/LRE/RLO/LRO/PDF/BN ← null; הסדר החזותי מדלג; **אין שינוי תוכן**); X10+BD13 — isolating run sequences כולל שרשור רצפים על פני PDI; sos/eos מחושבים **ברמות ה-X-שלב** (xLevel — תמונת מצב לפני I1/I2, כנדרש במפורש ב-X10; בלי זאת, סדר הטיפול ברצפים היה משנה את הגבולות של הבאים — נתגלה ב-conformance); W1–W7; N0 עם BD16 מלא — **סוגר סוגר מחפש במחסנית כלפי מטה עד עומק 63** (לא רק בראשה) עם pop-through-inclusive, השקילות הקנונית U+3008/3009↔U+2329/232A, סוגריים בסוג נוכחי ON (BD14/BD15 — אחרי override של X6), וסעיף ה-NSM העוקבים (NSM צמוד אחרי סוגר ששונה ← טיפוס הסוגר; הצמידות נבדקת בסדרת ה-aliVe — X9-הוסרים אינם חוסמים); N1–N2; I1–I2; L1 (הנחת שורה אחת כמו בקובצי ה-conformance); L2 — מעבר **על כל הרמות מהגבוהה ועד האי-זוגית הנמוכה, כולל רמות זוגיות וביניים שאינן קיימות** (דוגמה: 1,2,3,2,1 — צעד הרמה 2 חובה); L3 מובטח מבנית ברמת האטום (האטום = האשכול, אינו נחתך); L4 — דגל mirror בלבד (גליף מראה בקרנה; התוכן לא משתנה לעולם).
  - **נתוני המקור נעולים** — ארבעה קבצי UCD רשמיים (Unicode 16.0.0) ב־`packages/test-fixtures/unicode/` נעולים ב־BIDI_SOURCE_SHA256 של הטבלאות: DerivedBidiClass.txt (מחלקות; מחוץ לטבלה ← L), BidiBrackets.txt (BD14/15/16 + דגל mirror מ-UnicodeData שדה 9), ושני קובצי ה-conformance הרשמיים BidiTest.txt + BidiCharacterTest.txt; מחולל דטרמיניסטי (`gen-bidi-tables.mjs`; ריצה חוזרת ⇐ ביט-ביט).
  - **API ברמת נקודות הקוד** — `resolveBidiCodePoints(cps, paragraphLevel)`: רמות (null=x ל-conformance), סדר חזותי (visualOrder — אינדקסים משמאל לימין, מדלג הוסרים), דגלי mirror; `paragraphLevelFor(cps, default)` — P2/P3 עצמאי.
  - **API ברמת האטום** — `computeBidi(atoms, opts)`: הטקסט המאוחד נפתר בנקודות קוד והרמות ממופות חזרה — האטום (האשכול) כולו נושא רמה אחת (NSM ב-W1 נגזר מהבסיס); פלט: levels, runs (כיסוי מלא ורציף, כיוון לפי זוגיות), visualOrder (**תמורה של 0..n-1**), logicalToVisual (ההפך — למיפוי בחירה/audit אל ה-SourceSpan), mirrored. **שער השלב הוכח: reordering אינו משנה תוכן ולא זהות** — הפלט הוא מיפוי בלבד; האטומים עצמם לא נוגעים (אותו אובייקט).
  - 22 בדיקות יחידה (`bidi.test.ts`); מאמת `verify-bidi.mjs` — 28 בדיקות (כולל אמת נעילות המקור, דטרמיניזם המחולל, conformance כפול, וקטורי עברית ושער); i18n ו־CI מחוברים.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 477/477 (455 + 22); `node scripts/migration/verify-bidi.mjs` — 28/28 (בסימולציית CI=true FORCE_COLOR=3).
- **ממצאים:** (א) **לקחי ה-conformance — שלוש טעויות ראשוניות שנתפסו רק על ידי קובצי הבדיקה הרשמיים:** (1) L2 חייב לעבור גם על רמות זוגיות (ראה 1,2,3,2,1) — מימוש "רק אי-זוגיות" היה נראה הגיוני אך שגוי; (2) sos/eos חייבים להיחשב מרמות ה-X-שלב — עדכון במקום (in-place) של I1/I2 זיהם את חישוב הגבולות של הרצפים שטופלו אחריהם; (3) BD16 — סוגר סוגר מחפש בכל עומק המחסנית (לא רק בראשה), עם pop-through-inclusive. בנוסף: סעיף ה-NSM העוקבים של N0 חייב לדלג על X9-הוסרים בבדיקת הצמידות. (ב) **אין חיתוך שקט של רמות** — מפורש ≤125, I1/I2 עד 126 בקיצון תיאורטי; הצרכן אחראי לחוזה שלו (MAX_SHAPING_BIDI_LEVEL=125 ב-provider; נתפס בבדיקות). (ג) תווי הייצוג של BidiTest (מחלקות ללא תווים) נבדקים בעצמם — תו הייצוג של LRO/RLO נתפס הפוך על ידי הבדיקה עצמה (0x202D=LRO, 0x202E=RLO). (ד) רישום קובצי ה-UCD ב-registry.json נדחה גם כאן — כמו בשלב 27. אין שינוי בקוד הישן; הוספות בלבד (verify-parser עודכן ל-477 — ציפייה מיושנת מתועדת; run() של verify-bidi נכתב מראש ANSI-safe לפי סבב ז').

### שלב 27 — הזדמנויות שבירה לפי UAX #14 עם hooks מדיניות (M3) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/measurement-api/src/uax14.ts` + `uax14-tables.ts` (מיוצר) — **האלגוריתם המלא של UAX #14 revision 53 (Unicode 16.0.0)**: LB2–LB31 כולל הכללים החדשים של rev 53 (LB15a-d לפיסוק פותח/מסיים וסימן עשרוני, LB19a לגרשיים מוקפי מזרח-אסייאתיים, LB20a למקף תחילת מילה, LB21a המשוכתב לעברית, LB28a לכתבים ברהמיים); עיבוד מקדים LB9/LB10 עם דגל wasZwj (LB8a נשמר גם על ZWJ שלא מוזג, ומתאפס כש־CM נדבק אחריו — נלמד מהמבחנים). **Conformance 100%: 16,672/16,672 מקרים** מול LineBreakTest.txt הרשמי.
  - **נתוני המקור נעולים** — חמישה קבצי UCD רשמיים (LineBreak, LineBreakTest, EastAsianWidth, UnicodeData, emoji-data — Unicode 16.0.0) ב־`packages/test-fixtures/unicode/` עם SHA-256 נעול בטבלאות (UAX14_SOURCE_SHA256); מחולל דטרמיניסטי (ריצה חוזרת ⇐ ביט-ביט). LB1 נאפה בטבלה (AI/SG/XX→AL; SA→CM ל־Mn/Mc; CJ→NS לפי ההמלצה); ‎$EastAsian = EAW∈{F,W,H}‎.
  - **API ברמת האטום** — `computeBreakOpportunities(atoms, hooks?)`: UAX על הטקסט המאוחד, ממופה לגבולות אטומים בלבד (אין שבירה בתוך cluster — עקבי עם LB9 גם לניקוד החוצה אטומים); הפלט: הזדמנויות + שבירות חובה + רישומי hook:forbid לביקורת — **כל נקודה מקושרת למזהה אטום (שער השלב)**. Hooks: forbid/allow מקומיים עם סיבה מתועדת (למשל מדיניות התורה תאסור שבירה אחרי מקף עברי — UAX מתיר זאת כברירת מחדל); mandatory אינו ניתן לאיסור.
  - **הספק עודכן** — lineOpportunities של harfbuzz עבר מהמימוש הזמני (שדה breakBefore) ל־UAX האמיתי; הוכח במאמת ('אבג אדה' → [4] בלבד, בעוד הזמני היה מחזיר [2,3]).
  - 15 בדיקות יחידה (conformance מלא + וקטורי עברית: מקף/סוגריים/ניקוד/מילה ארוכה/RLM/מספרים + hooks + מיפוי אטומים); מאמת `verify-uax14.mjs` — 20 בדיקות (כולל אמת נעילות המקור ודטרמיניזם המחולל).
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 455/455 (440 + 15); `node scripts/migration/verify-uax14.mjs` — 20/20.
- **ממצאים:** (א) **מקף עברי U+05BE הוא מחלקה BA (לא HY)** — UAX ברירת המחדל מתיר שבירה אחריו; זה בדיוק המקום שבו hooks המדיניות נדרשים (הישן אינו שובר אחרי מקף — policy-torah יאסור בשלב 58+). (ב) כללי rev 53 החדשים דרשו נתונים מעבר ל־LineBreak.txt: Pi/Pf (מ־UnicodeData), ‎$EastAsian‎ כולל Halfwidth (מ־EastAsianWidth), Extended_Pictographic∩Cn (מ־emoji-data) — כל החמישה נעולים ב־SHA. (ג) למידות מה-conformance: הפולבק לתווים שמחוץ לטבלה חייב XX→AL; ZWJ שלא מוזג שומר על LB8a עד ש־CM נדבק אליו. (ד) רישום קובצי ה־UCD ב־registry.json של test-fixtures נדחה — הרישום מיועד למסמכים (סכמה עם settings/invariants); הנעילה נעשית ב־UAX14_SOURCE_SHA256 של הטבלאות + המאמת. אין שינוי בקוד הישן.

### שלב 26 — מטמון shaping (M3) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/measurement-api/src/cache.ts` — **LruShapingCache**: LRU עם שתי תקרות (רשומות — ברירת מחדל 4096; אומדן בתים — 32MiB), ערכים קפואים ומשותפים, מדדים מצטברים (hits/misses/evictions) ו־‎clear()‎ לביטול job. **withShapingCache(provider)** — עטיפת הספק: מפתח קנוני מלא של שלב 22 (טקסט+מזהי אטומים, טביעת פנים כולל contentSha256, גודל, features, כיוון, שפה, ריווח, זהות provider מלאה) — אין זמן, אין מונה, אין מיקום ב־batch, אין תלות בסדר קריאות; הזהות ו־lineOpportunities עוברים כמות שהם; batch ממומש דרך ה־shape הממוקד (שקיפות מלאה); ניתן להזריק מטמון משותף.
  - **16 בדיקות**: קר/חם ביט-ביט; לאחר clear (ביטול job) — חישוב מחדש לאותה תוצאה; פינוי LRU עם רענון ב־get; תקציב בתים; אין תלות בסדר קריאות; בקשות שונות אינן חולקות ערך; batch דרך המטמון; מטמון מוזרק משותף; property — דטרמיניזן תחת פינוי אגרסיבי (maxEntries=2) מול מטמון פתוח; עקביות המפתח מול שלב 22. מאמת `verify-shaping-cache.mjs` — 17 בדיקות, כולל קר/חם על הספק האמיתי (פסוק מנוקד מלא) ופינוי אוטומטי.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 440/440 (424 + 16); `node scripts/migration/verify-shaping-cache.mjs` — 17/17.
- **ממצאים:** אין שינוי בקוד הישן. העטיפה נבנתה עם הסתעפות טיפוסים לפי providerId (ייצור/בדיקה) כדי לשמר את הטיפוסים המילוליים של שלב 22 — ה־wasmSha256 של ספק בדיקה נעול ל־SHA-256 של מחרורת ריקה (ערך ה"אין bytes"), כך שהמפתח הקנוני יציב גם שם.

### שלב 25 — איסור fallback שקט במדידה (M3) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/measurement-api/src/enforcement.ts` — **המדיניות הנעולה** `MEASUREMENT_ERROR_POLICY` (שמונה מצבים): חמישה קודי פונט + MEASUREMENT_UNAVAILABLE — חריגה מיידית מקוטלגת; MISSING_GLYPH — דיווח מלא + שער קשיח; SimulatedMeasurer — אסור בייצור. **missingGlyphFindings** — ממצא אחיד (§14.1) לכל אטום חסר: מפתח קטלוגי, path=מזהה האטום, פרמטרים {fontId, fontFingerprint, atomId, atomIndex}, חומרת HIGH לפי §14.3 ("fallback לא מוסבר"); אטום זר מסומן provider-bug ואינו מושמט. **assertNoMissingGlyphs/shapeStrict** — השער הקשיח: MISSING_GLYPH {fontId, count}. **תיעוד tofu**: ‎.notdef‎ (glyphId 0) הוא ה-tofu היחיד — לעולם לא גליף מגופן אחר/מערכת.
  - **17 בדיקות שליליות** (7 טהורות ב־measurement-api + 10 על הספק האמיתי): ארבעת התרחישים המחייבים — הסרת גופן (MISSING_FONT עם family+fontId; אף תוצאה לא הוחזרה), שינוי byte (FONT_HASH_MISMATCH עם שני הגיבובים; אין טעינה חלקית — סט עם גופן פגום נדחה כולו), גליף חסר (ממצא + שער + tofu=0 בלבד), WASM בלתי-זמין (MEASUREMENT_UNAVAILABLE). **הוכחה מבנית לאי-נסיגה**: טקסט שהגופן אינו מכיל מניב ‎.notdef‎ בלבד (10/11 ב־hello world — הרווח דווקא קיים בגופן, גליף לגיטימי), לעולם לא גליפים מגופן אחר.
  - מאמת `verify-enforcement.mjs` — 21 בדיקות: המדיניות + תיעוד tofu ב-GLOSSARY + ארבעת התרחישים על הספק האמיתי + סריקת קוד נגד Canvas/fetch/CDN/גופני מערכת/SimulatedMeasurer + רגרסיה.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 424/424 (407 + 17); `node scripts/migration/verify-enforcement.mjs` — 21/21.
- **ממצאים:** למידה מהבדיקות: בדיקת הרווח ב־hello world — הרווח קיים בגוטמן-רש"י (גליף לגיטימי) ואינו נחשב חסר; הבדיקה הותאמה להבחין בין גליף חסר אמיתי לבין תו שכן קיים. החומרה HIGH לגליף חסר מגובה ישירות ב§14.3 ("fallback לא מוסבר"). אין שינוי בקוד הישן; הוספות בלבד.

### שלב 24 — [ADR-003] ספק מדידה HarfBuzz/WASM נעול (M3) — הושלם 2026-11-01
- **תוצרים:**
  - `docs/adr/ADR-003-harfbuzz-wasm.md` — **ההחלטה נעולה**: HarfBuzz 15.0.0 דרך harfbuzzjs 1.6.4 (exact) + wawoff2 2.0.1 לפריקת WOFF2; שני גיבובי SHA-256 נעולים (harfbuzz.wasm: `6eeed8e1…`, decompress_binding.js: `112a89e7…`); אריזה מקומית בלבד — אין CDN ואין רשת; הפרדת אחריות (shaping בלבד — BiDi ו־UAX #14 חיצוניים, שלבים 27–28); שיקולים שנדחו מתועדים (Canvas, גופן מערכת, פרסר WOFF2 עצמאי, העתקת ה־WASM לתוך הריפו).
  - `packages/measurement-harfbuzz` — **הספק היחיד של הייצור** מול `measurement-api` (גרף §5). **מודל הזרקה מלא**: ל־src אין ייבוא של harfbuzzjs/wawoff2 ואין Node/DOM — ה־host מזריק את המודולים + bytes ה־WASM; peerDeps exact לשתי הספריות. בזמן היצירה הספק מאמת: ‎sha256(wasmBytes) === נעילה‎, גרסת HarfBuzz, גיבוב מפרק ה־WOFF2 (כשיש גופני WOFF2) — **‎wasmSha256 שהספק מדווח תמיד אמת ומאומת, לא מוצהר**. WASM זר ← ‎MEASUREMENT_UNAVAILABLE‎.
  - **אימות sfnt כפול** — לכל גופן WOFF2: פריקה דרך wawoff2 ואז ‎sha256(sfnt) === sfntSha256‎ מהמניפסט (שלב 23) — גרסת מפרק שונה או גופן שהוחלף נתפסים לפני כל מדידה (קוד חדש ‎FONT_SFNT_MISMATCH‎). טעינה עצמה דרך ‎loadFontSet‎ של שלב 23 — הצינור המלא: מניפסט → hash + חתימה → פריקה + אימות → ‎hb.Face/hb.Font‎.
  - **shaping** — buffer בסקייל ‎upem‎ (יחידות גופן שלמות; ללא איבוד דיוק בזמן העיצוב); המרה ל־LU ב־roundDiv (ADR-001) אחר כך; מיפוי קלסטרים UTF-16 → ‎clusterAtomIndex‎ בחיפוש בינארי; ריווח אותיות בתוך ה־advance של כל גליף (חוזה שלב 22); מטריקות אנכיות מ־hhea עם מוסכמת סימן מתועדת (y חיובי מטה — הופכי ל־HarfBuzz); גליף חסר (‎.notdef‎) מדווח ב־‎missingGlyphAtomIds‎ בסדר לוגי; ‎environmentHash‎ נגזר מהנעילות בלבד ⇒ זהה בכל host (הוכחה מלאה — שלב 29); ‎lineOpportunities‎ זמני לפי שדה האטום עד שלב 27 (אין צרכן ייצור עד M4+).
  - **21 בדיקות על וקטורים אמיתיים**: שלום (4 גליפים, RTL — קלסטרים יורדים [3,2,1,0]), ניקוד (marks ב־advance 0 עם offsets; דגש חוצה אטומים מתלה על אשכול הבסיס), מקף עברי, גליף חסר Ω ולטינית בגופן עברי (דיווח מלא), LTR ב־assistant-latin, upem 2048 (david-libre) — חשבונאות בכל קנה מידה, hhea (925/‎-388‎/0), ריווח אותיות, דטרמיניזן בין שתי יצירות, batch שקוף, ‎FONT_SFNT_MISMATCH‎ על רשומת שקר, MISSING_FONT על גופן מחוץ לסט, פסוק מנוקד מלא. מאמת `verify-harfbuzz-provider.mjs` — 31 בדיקות (כולל אמת הנעילות מול הדיסק וה־lockfile).
  - **ניקוי שאריות build** — 33 קובצי ‎js/d.ts/map‎ מקומפלים שנתקעו בתוך ‎packages/*/src‎ משלב 7 הוסרו מהמעקב (הם הצלילו ייבוא ‎../src/index.js‎ בבדיקות והסתירו את קובצי ה־TS; הבעיה התגלתה כשבדיקות הספק ייבאו index.js ישן וריק).
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 407/407 (386 + 21); `node scripts/migration/verify-harfbuzz-provider.mjs` — 31/31; build/lint/deps נקיים.
- **ממצאים:** (א) **harfbuzzjs API** — השמת מאפיינים (‎buffer.direction = …‎) אינה קוראת ל־C API — חייבים ‎setDirection/setScript/setLanguage‎; גם ‎font.scale‎ חייב הצבה מפורשת לפני העיצוב. הטיפוסים המבניים בחבילה מנעים את המלכודת לעתיד. (ב) **קלסטרים** — ערכי הקלסטר של HarfBuzz הם אינדקסים ב־UTF-16 של המחרוזת המאוחדת (‎addText‎ משתמש ב־hb_buffer_add_utf16) — המיפוי לאטומים מדויק גם עבור surrogate pairs. (ג) RTL: הפלט בסדר חזותי (קלסטרים יורדים) — נעול בבדיקות ובתיעוד. (ד) בדיקת ליגטורות: ‎frank-ruhl-libre-hebrew‎ מכיל ‎hebr+latn+DFLT‎ אך קובצי המשנה של Google (hebrew/latin) מפוצלים — ‎assistant-latin‎ הוא הגופן הלטיני המלא; הבדיקות מכסות את שניהם. אין שינוי בקוד הישן; הוספות בלבד לחוזים קודמים (קוד שגיאה חדש).

### שלב 23 — manifest גופנים מלא מהתוכנה הישנה (M3) — הושלם 2026-11-01
- **תוצרים:**
  - `assets/fonts/manifest.json` **v2** (מחולל דטרמיניסטי `gen-fonts-manifest.mjs` — אותם קלטים ⇐ אותו מניפסט ביט-ביט; idempotent) — **כל 1,796 הגופנים בכיסוי 100%**: לכל קובץ ‎fontId (font:v1|contentSha256 — זהות מה־bytes בלבד)‎, contentSha256, family, weight (usWeightClass), style (fsSelection), unitsPerEm (head), binaryFormat (לפי החתימה), nameTable, sfntSha256, source (Orange@93ad1e57) ו־distributionBlocked. כולל היסטוריים וכאלה שלא זוהה להם שימוש — אין סינון, אין השמטה שקטה, אין שינוי bytes (hash מחושב מחדש לכל קובץ במאמת).
  - **פריקת WOFF2 ביישום הייחוס** — wawoff2 2.0.1 (Google woff2; נעול exact ב־devDependencies) מחלץ את המטא־דאטה הבינארית ואת ה־sfnt הקנוני. **sfntSha256 לכל קובץ WOFF2** — נעילת דטרמיניזם הפריקה לקראת זהות המדידה בין hosts (שלב 29); המאמת מוכיח בפריקה חוזרת: אותם bytes ⇐ אותו sfnt ⇐ אותו גיבוב.
  - `packages/measurement-api/src/font-manifest.ts` — **החוזה ואכיפת הטעינה (טהור לחלוטין)**: `FontManifestRecord` + `isFontManifestRecord`/`assertFontManifest` (מבנה, טווחים, נגזרות fontId); `findFontRecord` (מזהה בלתי-מוכר = UNKNOWN_FONT_ID — לא undefined בשקט); `fontFaceKeyOf`; `binaryFormatOf` (magic bytes, לא סיומות); `verifyFontBytes` — שער "אותם bytes": hash שונה = FONT_HASH_MISMATCH, חתימה שאינה תואמת = FONT_FORMAT_MISMATCH; **`loadFontSet`** — כל הגופנים הדרושים לקונפיגורציה נטענים ומאומתים לפני המדידה הראשונה; כל כשל עוצר את הריצה כולה — אין טעינה חלקית. ה־bytes מוזרקים (fetchBytes) — אין fs/רשת בליבה, אין גופן מערכת, אין fallback.
  - **distributionBlocked לפי החלטות המלאי** — bundled (1,757) + Guttman-Rashi (1) מסומנים LICENSE_UNVERIFIED (D-001/D-002): כשירים לשימוש לצורך תאימות, מוחרגים מחבילת ההפצה (שער שלב 99). הדגל אינו מסיר מהמרשם, אינו מחליף גופן ואינו משנה bytes. selfhost (38) — OFL-1.1 מתועד, קובצי הרישיון על הדיסק.
  - `docs/migration/fonts-coverage.md` — דוח כיסוי מלא עם התפלגויות (קבוצות/פורמטים/unitsPerEm/משקלים) ותגליות הרישום.
  - 3 קודי שגיאה חדשים (UNKNOWN_FONT_ID, FONT_FORMAT_MISMATCH, MANIFEST_INVALID — קטלוג measurement-api: 21); 13 בדיקות יחידה חדשות; מאמת `verify-fonts-manifest.mjs` — 29 בדיקות; i18n, GLOSSARY ו־CI מחוברים.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 386/386 (373 + 13); `node scripts/migration/verify-fonts-manifest.mjs` — 29/29; `verify-transfer-inventory` — ירוק (v2 תואם לבדיקות שלב 2); דטרמיניזם המחולל הוכח (שתי ריצות ⇐ אותו hash קובץ).
- **ממצאים:** (א) **סיומות מטעות** — 4 קבצי ‎.woff שתוכנם WOFF2 בפועל; הערת שלב 2 (״4 קבצי woff1״) תוקנה במניפסט: אין אף WOFF1 אמיתי במלאי. הפורמט נקבע לפי החתימה בלבד. (ב) **טבלאות שמות מנוונות** — 116 גופנים ללא nameID 1 (למשל Abir-Black: nameID 1 באורך 0, subfamily תו DEL); שם המשפחה העברי מ־fonts.json נשאר הקנוני, nameTable לתיעוד בלבד. (ג) **משקלים לא-סטנדרטיים** — usWeightClass 4–99 בחלק מהגופנים (האמת הבינארית נשמרת; הישן בחר גופנים לפי שם משפחה ייחודי, לא לפי משקל). (ד) ניסיון ראשון לפרסר WOFF2 ידנית נכשל על קידודים אמיתיים — הוחלף ביישום הייחוס של Google; למידה: פורמט בינארי בן 20 שנה עם legacy fonts דורש את הספרייה הקנונית, לא מימוש עצמאי. (ה) המחולל הראשון צבר הערות v2 בין ריצות — תוקן ל־idempotent; הדטרמיניזם נאכף בבדיקת hash כפולה. אין שינוי בקוד הישן; אין שינוי בחוזים קודמים (הוספות בלבד).

### שלב 22 — חוזי measurement-api (M3) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/measurement-api/src/provider.ts` — **החוזה המלא של §6.4**: `FontFaceKey` (fontId, contentSha256, family, weight 1–1000, style) + `fontFingerprint` (SHA-256 קנוני — כל שינוי bytes/משקל מחליף טביעה); `ShapeRequest` (אטומים+פנים+fontSizeLu+כיוון+שפה+features+letterSpacingLu — הכל מפורש, אין ברירת מחדל שקטה) עם ולידציה מלאה `shapeRequestIssues`/`assertShapeRequest` (lone surrogates, תווי בקרה, תגי features 4 תווים, BCP-47, שלמים בטוחים); `ShapedGlyph`/`ShapedRun` עם **חוזה חשבונאות נעול** `widthLu === Σ advanceLu` (ריווח האותיות בתוך advance של כל גליף — דפוס CSS; רוחב קו ניתן לחישוב מחדש מהגליפים, §6.5) ובדיקת `shapedRunAccountingIssues`; `MeasurementProvider` (providerId מילולי 'harfbuzz-wasm' — ספק מדומה אינו יכול להחליף בטיפוס) ו־`TestMeasurementProvider` ('test-simulated') כטיפוסים נפרדים; `ProviderLoader` — טעינה אסינכרונית ב־host, ואחריה shape() סינכרוני ודטרמיניסטי; `shapeRequestHash` — SHA-256 קנוני של (זהות provider, בקשה) עם environmentHash בתוך הזהות.
  - **ShapingAtom — חוזה מבני בלי תלות**: ל־measurement-api אין תלויות (גרף §5), ולכן האטום הנמדד הוא interface מבני (id/text/script/bidiLevel/breakBefore) ש־`TextAtom` של content-model מקיים מבנית — המזהים הממותגים זהים (brand 'AtomId') וההשמה דו־כיוונית. **הוכח במאמת**: פלט הפרסר האמיתי עובר `isShapeRequest` ומעוצד בהצלחה.
  - `packages/measurement-api/src/cache-key.ts` — **מפתח מטמון קנוני** `canonicalShapeCacheKey`: כל רכיבי ההשפעה (בקשה + טביעת פנים + זהות provider מלאה) ורק הם — אסור זמן/מונה/מיקום ב־batch (אחרת cold/warm של שלב 26 וזהות hosts של שלב 29 היו נשברים); חוזה `ShapingCache` מוצהר (get/set/size/metrics — פינוי מותר רק כשינוי ביצועים, לא תוצאה); `CacheMetrics` — מדדי hit/miss מחוץ לקביעת התוצאה.
  - `packages/measurement-api/src/hash.ts` + `canonical.ts` — SHA-256 נייב מקומי (JS טהור, FIPS-180-4) ו־canonicalJson מקומי בכללי ADR-002: ל־measurement-api אסור לייבא את layout-api (הגרף חד־כיווני), בדיוק כמו הקטלוג המקומי של content-model — התקדים שתועד בשלב 14. מאומת מול וקטורי FIPS ומול node:crypto כאורקל.
  - `packages/measurement-api/src/test-provider.ts` — **TestMeasurementProvider עם וקטורים קבועים**: טבלאות אלפיות-em סגורות לפי קטגוריית נקודת קוד (אות עברית 556, רווח 250, ספרה 500, ניקוד 0 — מתלה על אשכול הבסיס, בקרות פורמט גליף 2 עם advance 0); **טווח U+E000–U+E0FF מדמה גליף חסר** (.notdef + missingGlyphAtomIds) לתרגול שלבים 25/26/29; אפס מצב פנימי; shapeBatch דרך shapeBatchViaSingle. **מיוצא מ־subpath './test' בלבד** — index.ts אינו מייצא אותו.
  - **אכיפת "אין SimulatedMeasurer בייצור"** — שלוש שכבות: (א) providerId מילולי נפרד בטיפוס; (ב) כלל depcruise `no-test-provider-in-production` (ייבוא ה־subpath מקוד ריצה = שגיאה) + כלל `core-no-dom-libs` (react/jsdom/canvas אסורים בליבה); (ג) סריקת המאמת. כללי גרף חדשים נוספו ל־.dependency-cruiser.cjs.
  - 3 קודי שגיאה חדשים (`errors.font.MISSING_GLYPH` מ§6.4, `errors.shape.INVALID_REQUEST`, `errors.shape.INVALID_PROVIDER` — קטלוג measurement-api: 18); 50 בדיקות חדשות (hash: FIPS-180-4 + אורקל node:crypto כולל עברית מנוקדת ורב-בלוקים; provider: ולידציה, קנוניות, חשבונאות, batching; cache-key: קנוניות ורגישות; test-provider: דטרמיניזם property, וקטורים קבועים, הדמיית גליף חסר); מאמת `verify-measurement-api.mjs` — 31 בדיקות; i18n, GLOSSARY ו־CI מחוברים.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 373/373 (323 + 50); `node scripts/migration/verify-measurement-api.mjs` — 31/31; רגרסיה מלאה: כל 22 המאמתים PASS.
- **ממצאים:** תקלת העתקה בקבוע K[42] של SHA-256 המקומי (0x4ed8aa4b במקום 0x4ed8aa4a) נתפסה מיד על ידי וקטורי FIPS — הערך השגוי הניב hash עקבי אך שגוי; זו בדיוק הסיבה שהחוזה נבדק מול אורקל חיצוני ולא רק מול עצמו. למידות: (א) סריקת "אין DOM" נאיבית תפסה את המילה Canvas בתוך הערת קוד — הסורק מפשיט הערות לפני ההתאמה; (ב) טיפוס AtomIdRef עם brand זהה ל־AtomId של content-model נותן השמה דו־כיוונית בלי תלות — התבנית לכל חוזה עתידי על פני גבולות חבילות. אין שינוי בקוד הישן; אין שינוי בחוזים קודמים.

### שלב 21 — Text Audit v1 וספר טרנספורמציות; **שער M2 מלא עבר** (M2) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/audit-core/src/text-audit.ts` — **Text Audit v1**: הוכחה עצמאית שהקלט לא אבד ולא שוכפל — הביקורת מחשבת מחדש את הכיסוי מהמסמך עצמו (§14 "בלתי תלוי"; חילוקי דעות עם הוכחת הפרסר ← ממצא COVERAGE_DISAGREEMENT); כל עמדת מקור חייבת כיסוי אחד בדיוק (אטום תוכן / תחביר / ערך metadata / שבירה מפורשת); כפילות מזהה אטום = שכפול נוסח; **מבוסס פרוסות ומזהים — לא join('')** (§14.2); נאמנות פרוסה מילולית (ADR-007); sentinel/placeholders גולמיים = HIGH; HTML מילולי = LOW; **11 קודי ממצא סגורים** בפורמט §14.1 (code/severity/messageKey/params/sourceSpans/actual/expected) עם חומרות §14.3; מעבר יחיד ללא אובייקטי ביניים (הקורפוס: 3,391,406 אטומים — אופטימיזציית זיכרון אחרי OOM בסביבת 4GB).
  - **טרנספורמציות מוצהרות** — כל רשומה בספר (split/merge/reorder/bidi/insert/suppress, שלב 15) נבדקת: שלמות הספר (ledgerIntegrityIssues: אטום לא נולד פעמיים; כל מקור קיים) עם ‎presentedAtomIds‎ למסמכים שעברו פיצול/איחוי; הסרות הערות עורך והחדרות חיבור פסקאות נספרות ומדווחות.
  - **fuzz (§17.1)** — מחולל כל תחביר הקלט ממרשם שלב 17 (כותרות תקינות/כמעט-תקינות, H7, סיום, עורך סגור/פתוח, סוגריים, ניקוד בסדר לא-קנוני, RLM, em-space, metadata): ‎parse ← coverage.ok ← audit.ok‎ על 400 ריצות; דחיית קלט פגום = שגיאה מקוטלגת וממוקמת (לא crash); דטרמיניזן שלוש ריצות; **מטמורפי §17.2#6** — פיצול אטום אקראי (סימולציית פיצול XML runs של DOCX): כיסוי נשמר, טקסט בלוק זהה, הספר מתעד, איחוי חוזר מחזיר את אותו מזהה בדיוק.
  - **תגלית אמיתית של ה-fuzz — באג בפרסר תוקן**: תוחמי הערת שוליים שבולעים הערת עורך שהוצאה קודם (`[ …\n## x ##\n… ]`) — ה-explicit-break כיסה את כל הפער בין הטווחים השורדים **כולל התוכן שהוסר**, ויצר חפיפה כפולה; תוקן: השבירה מכסה רק את רצפי מפרידי השורות שבפער. הדיפרנציאל של שלב 17 נשאר ירוק (הקורפוס אינו מכיל את המקרה; פערי newline טהורים התנהגו זהה לפני ואחרי).
  - 10 בדיקות יחידה (זיופים מבוקרים: אטום מושמט/משוכפל, יתומה, ספר שבור, פיצול DOCX) + 5 תכונות fuzz; קטלוג שגיאות מקומי ב־audit-core (2 קודים); מאמת `verify-text-audit.mjs` — **23 בדיקות כולל שעד M2 מלא**; i18n, GLOSSARY ו־CI מחוברים.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 323/323 (308 + 15); `node scripts/migration/verify-text-audit.mjs` — 23/23 (**שער M2**); רגרסיה מלאה: כל **21** המאמתים PASS.
- **שער M2 (§18-M2) — עבר במלואו:** round-trip מוכיח 100% כיסוי אטומים על 26 מסמכי המרשם (שלב 4) ועל כל 63 קבצי הקורפוס (3.39M אטומים, 13,022 החדרות חיבור, 5 הסרות מוצהרות — הכל נספר ודווח); הערות וסוגריים שומרים מקור (אפס יתומות; המשכיות מצבי גבול); שגיאות קלט מקומיות (קוד קטלוגי + מיקום בפרמטרים); rollback מתועד (react-lock שלם, 18 קבצים מאומתי SHA, differential בלבד, אף חבילת ייצור אינה מייבאת אותו). **פרק ג (שלבים 14–21) הושלם.**
- **ממצאים:** ה־fuzz עשה בדיוק את שלו — גילה באג אמיתי בפרסר ביום הראשון שלו (חפיפת explicit-break על תוכן מוסר; פורט לעיל). למידות נוספות: (א) הודעות השגיאה הפנימיות אינן כוללות מיקום — המיקום בפרמטרים לתצוגת i18n (הבדיקות מאמתות params); (ב) שורת metadata שחוזרת אחרי כותרת היא תוכן גוף לגיטימי — הכפילות נדחית רק בתוך בלוק הפתיחה; (ג) הסרת הפניית הערה אינה מאבדת טקסט (התוחמים מכוסים תחביר) — רק הקישוריות נשברת ומדווחת. אין שינוי בקוד הישן; שינוי אחד בפרסר החדש (תיקון ה-bug) מתועד לעיל.

### שלב 20 — זרמי הערות ומספורן טרם העימוד (M2) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/content-model/src/notes.ts` — **numberNotes**: מספור הערות כולו לפני העימוד עם **resolved labels** — היפוך הישן, שמספר בתוך renderFootnotes לפי אינדקס העמוד (‎toGematria(i+1)‎ — מספור סמוי ברינדור, §10.3 אוסר). הסדר לפי מיקום ההפניה הראשונה בזרימת המסמך; לכל סוג הערה יש הפניה מפורשת בגוף (שוליים — בפסקה; סיום — בשורה; H7 — בלוק סמן) — העוגן ההדדי נשמר בכל הצבה (anchorStart + referenceCount).
  - **היקפים (§10.3)**: ‎page | siman | part | continuous‎ כמדיניות מפורשת; איפוסים מפורשים ב־scopeCounts; הכלל הקובע לחלק/סימן — "הכותרת הקודמת הקרובה" (פרוסות החלקים/סימנים הן טווחי כותרות). ‎page‎ נפתר רק עם הקשר עמודים מפורש (NumberingPageContext — המנוע יספק בשלב 49+); בלי הקשר — ‎errors.notes.PAGE_SCOPE_REQUIRES_CONTEXT‎, לא ניחוש. ברירת המחדל משוחזרת מהישן: page+גימטריא+שוליים/סיום.
  - **toGematriaLabel** — פורט נאמן של ‎src/lib/gematria.ts‎ הישן; **parity מלא 1..3000 מוכח במאמת** מול הקוד הקפוא (כולל 1000=תת״ר — הקוד הישן, לא ההערה שבראש הקובץ); וקטורי בדיקות הישן הועברו לבדיקות החבילה. מדיניות גימטריא מלאה של פוליו — שלב 67.
  - **אף הערה אינה נבלעת בשקט**: יתומות (בלי הפניה) מדווחות ואינן ממוספרות; הערות עורך אינן מודפסות ממילא ואינן נספרות כיתומות (ההסרה נרשמת בספר הטרנספורמציות, שלב 17); הפניות מרובות מדווחות וממוספרות לפי הראשונה; documentOrder — כל ההערות המופנות לפי מיקום (ה־FIFO של הערות צד, §10.3).
  - 14 בדיקות חדשות (היקפים, יתומה מזויפת שנתפסת, הפניה כפולה, H7 לא ממוספרת כברירת מחדל אך בסדר המסמך, דטרמיניזם, מדיניות שגויה); 3 קודי שגיאה (82 סה"כ); מאמת `verify-notes.mjs` — 22 בדיקות (כולל סריקת האנטי־תבנית: אף חבילה אינה מקשרת הערות לפי אינדקס עמוד כמו ‎doc.sidenotes[pageNumber-1]‎ הישן); i18n, GLOSSARY ו־CI מחוברים.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 308/308 (294 + 14); `node scripts/migration/verify-notes.mjs` — 22/22; רגרסיה מלאה: כל **20** המאמתים PASS.
- **ממצאים:** הקורפוס במספרים: 10,301 הערות דפוס ב־63 קבצים, **אפס יתומות מפלט הפרסר** — לכל הערה עוגן (§10.3/§14.2 הוכחו על הקורפוס כולו); 472 הצבות בשוליים+סיון ב־continuous. למידה: פרוסות חלקים/סימנים במסמך הן טווחי שורות הכותרת — עוגני הגוף נופלים אחריהן, ולכן "הכותרת הקודמת הקרובה" הוא הכלל הקובע (תועד בקוד). הערת הקובץ הישן של הגימטריא טוענת 1000→א׳ אך הקוד מחזיר תת״ר (מסלול האלפים נכנס רק מ־1001) — הפורט נאמן לקוד וההבדל מתועד. אין שינוי מנוע; אין שינוי בקוד הישן.

### שלב 19 — עץ סוגריים בפרסר (M2) — הושלם 2026-11-01
- **תוצרים:**
  - `packages/content-model/src/brackets.ts` — **scanBrackets**: עץ סוגריים מבני מעל אטומי התוכן בלבד (תוחמי הערות [..] הם תחביר שהוצא בשלב 17 — אינם מזהמים); גוף המסמך זרימה רציפה אחת, וכל גוף הערה זרימה עצמאית. זוגות ()‏ ו־[] בלבד («» פיסוק תוכן); **התאמה פר־סוג** — מחסנית עצמאית לכל סוג, בדיוק כמו ‎findMatchingCloseBracket‎ הישן; העץ מקנן גם בין סוגים ([ ( ) ] — ה־( ילד של ה־[). כל זוג: מזהה דטרמיניסטי ‎bracket:v1|…‎, פרוסות פתיחה/סגירה מדויקות, עומק כולל, ילדים, ו־**blockIds** — הבלוקים שהזוג חוצה.
  - **BracketBlockState — נעילת ה־continuation** (§10.4: "מצב ה־stack נמצא ב־PaginationState"): לכל בלוק בכל זרימה — openAtStart/openAtEnd/openedWithin/closedWithin; שאילתות טהורות ‎crossingPairs‎/‎blockExitState‎/‎endsInsideBracket‎. המנוע (שלבים 49+/65) יצרוך את המבנה ישירות — **בלי regex ובלי ניחוש היררכיה; אין צורך ב־protectParens שמשנה עמודים אחרי האיזון**.
  - **דיווח בלבד**: unclosed-open/stray-close מדווחים כאזהרות ממוקמות (WARN_UNCLOSED_BRACKET/WARN_STRAY_CLOSE_BRACKET); אף תו אינו מושלם/מוסר/מוחלף (ADR-007, §10.4).
  - `ParseResult.brackets` — העץ מסופק מהפרסור עצמו; ‎scanBrackets(doc)‎ ציבורי לחישוב מחדש (דטרמיניסטי — הוכח שווה ביט-ביט).
  - `packages/content-model/test/brackets.test.ts` — 16 בדיקות (קינון בין סוגים ב־H7, חציית בלוקים והפניות, פר־סוג על קלט מעורב, תוחמי הערה אינם נספרים, קלט פגום, דטרמיניזם, חשבונאות); `packages/test-fixtures/test/brackets.differential.test.ts` — **differential מלא מול הישן**: לכל זוג בעץ — ה־oracle מה־react-lock (@ 0c7b9927, SHA-מאומת) מוצא את אותה סגירה; לכל בלוק — ‎hasOpenBracket‎ הישן (protectParens) ⟺ יציאה עם מרובע פתוח. 3 קודי שגיאה חדשים (79 סה"כ); מאמת `verify-brackets.mjs` — 26 בדיקות; i18n, GLOSSARY ו־CI מחוברים.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 294/294 (274 + 16 + 4); `node scripts/migration/verify-brackets.mjs` — 26/26; רגרסיה מלאה: כל **19** המאמתים PASS.
- **ממצאים:** הקורפוס במספרים: 10,721 זוגות (11 חוצי בלוקים — בעיקר long_test_text_2), 106 בעיות מדווחות, 24,997 מצבי בלוק, 10,306 סריקות הערות; בקנוני: 2,508 זוגות עגולים בלבד, כולם בתוך בלוקים בודדים, 3 בעיות — הקורפוס האמיתי מכיל סוגריים לא-מאוזנים, ואלה מדווחים ולא מתוקנים (§10.4 במלואו). למידה מהוכחת ההתנהגות: מרובעים תואמים תמיד הופכים להערה (החילוץ על הטקסט המחובר כולו — לא חסום פסקאות); המקרה המילולי היחיד הוא פתיחה בלי סגירה — בדיוק המקרה ש־protectParens הישן הגן עליו; הפרשי הדקדוק תועדו בבדיקות. המאמתים הישנים עודכנו לגדלים שהתפתחו (inline-blocks: 79 קודים; parser: 294 בדיקות). אין שינוי מנוע; אין שינוי בקוד הישן.

### שלב 18 — [ADR-007] נאמנות נוסח ו־Unicode (M2) — הושלם 2026-11-01
- **תוצרים:**
  - `docs/adr/ADR-007-unicode-fidelity.md` — ההחלטה נעולה: **נרמול Unicode אסור בכל מסלול הייצור**; המקור נשמר תו-מול-תו; `normalizeView` הוא ההיתר היחיד (פרויקציה ממופה source↔view, לא נשמרת ולא חוזרת לצינור); חלופות (NFC בקלט / NFC+מיפוי / נרמול במדידה) נשקלו ונדחו בנימוקים; 11 קטגוריות תווים עם מדיניות מפורשת (ניקוד/טעמים/קרי-כתיב/מקף/גרשיים/בקרות BiDi/HTML entities/תגיות/רווחית שולית/BOM/נרמול) — אף אחת אינה "תיקון".
  - **הראיה מהקורפוס (נספר במדויק בסביבה זו):** **231 רצפים שאינם NFC בכל אחד משלושת הקבצים הארוכים** (בסיס+דגש+תנועה, למשל בֵּ — NFC מסדר מחדש את הנקודות לבֵּ), 230‏ RLM לכל קובץ ארוך, 5 em-space בקצוות — נרמול "נוחות" היה משנה נוסח של קודש בשקט. מספר זה מתועד ב־ADR ובמאמת.
  - `packages/content-model/src/unicode.ts` — `findNormalizationSpans` (גילוי בלבד; אינווריאנט מוחלט: רשימה ריקה ⟺ `text.normalize(form)===text`; מיקום עדין לרמת יחידת נרמול בכתבי הקורפוס, מילולי בקיום וגס במיקום לכתבים אחרים כגון Hangul Jamo — הפיצול ברווחית בטוח כי אף רכב/פירוק קנוני אינו חוצה רווחית); `normalizeView` (מיפוי רב־לאחד מלא, ה־view עצמו מנורמל — נבדק); `inspectUnicode` (מאגר דיווח מלא: ניקוד/טעמים/מקף/גרשיים/BiDi/em-space/nbsp/BOM/surrogates/בקרה/entities/תגיות + דגלי NFC/NFD/NFKC); `UNICODE_FIDELITY_RULES` (11 הכללים, מכונה־קריאה, אסמכתא לסעיף ADR); `atomFidelityIssues` (כל אטום מקור שווה לפרוסת המקור; אטומי החדרה פטורים עם origin).
  - 3 קודי שגיאה חדשים (`errors.unicode.*` — 76 סה"כ ב־content-model); 26 בדיקות חדשות (יחידה: אינווריאנט, מיפוי view, מאגר, זיוף אטום שנתפס, שימור non-NFC ו־RLM דרך הפרסר); `scripts/migration/verify-unicode.mjs` — 29 בדיקות; i18n, GLOSSARY ו־CI מחוברים.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 274/274 (248 + 26); `node scripts/migration/verify-unicode.mjs` — 29/29; רגרסיה מלאה: כל **18** המאמתים PASS.
- **ממצאים:** (א) ספירת non-NFC הראשונית (6 לכל קובץ) הייתה מדגם בלבד — הספירה המלאה: **231 לכל קובץ**; ה־ADR והמאמת מתעדים את המספר המדויק, וזו ראיה חזקה עוד יותר נגד נרמול. (ב) NFKC **וגם** NFD מסדרים מחדש ניקוד עברי (שתיהן מיישמות canonical ordering) — המאגר מדווח על שלושתן. (ג) המאמתים הישנים שנעלו גדלים (inline-blocks: 73 קודים; parser: 248 בדיקות) עודכנו לגדלים שהתפתחו (76, 274) — תבנית מקובלת שתועדה כבר בשלב 17. (ד) `String.prototype.normalize` מעביר lone surrogates ללא שינוי (נבדק) — אין הפתעות בגילוי. אין שינוי מנוע; אין שינוי בקוד הישן.

### שלב 17 — פורט הפרסר הישן בשלמות (M2) — הושלם 2026-11-01
- **תוצרים:**
  - **מרשם המזהים** `docs/migration/identifiers.json` — מקור אחד מוקפא: 38 רשומות (10 מפתחות metadata, כותרות, הערות צד/סיום/שוליים, הערות עורך, סגנונות linePrefix/inlineMarker/regex, כללי מבנה, מספור סימנים, מושגי פריסה ואסמכתאות שליליות); לכל רשומה: תחביר מדויק, זרם, קדימות, מקורות נעוכים עם SHA-256 (מאומתים מול מניפסט המקורות), מקרי קצה עם החלטות מתועדות, fixture ומיפוי ל־ContentBlock/InlineItem. `identifiers.md` ו־`registry-data.ts` מופקים ממנו (`gen-identifier-registry.mjs`); הפרסר צורך את התחביר מה־registry-data — אינו יכול לסטות מהמרשם; סנכרון נאכף ביט-ביט.
  - `packages/content-model/src/parser/parse.ts` — **parseSourceText**: צינור הישן במלואו (metadata ← editorial ← sidenote-H7 ← endnote ← footnote-מחובר ← custom-linePrefix ← heading ← AST) בלי הרס — מרחב קואורדינטות UTF-16 אחד של המקור הגולמי. אין sentinel: הפניית הערה = InlineItem מפורש; הסרת הערת עורך = TransformRecord‏ (suppress) + שימור התוכן בזרם editorial; מבנה חלקים←סימנים←בלוקים (H1 פותח חלק; H2/מספר מפורש פותחים סימן; רטרואקטיביות בלוקים ממתינים); קינון כותרות כמו ast-builder הישן; sourceHash מוזרק (ADR-002).
  - **חשבונאות מלאה** — `CoverageProof`: כל תו מקור מסווג לאחת מארבע קטגוריות (אטום תוכן / ערך metadata / syntax span / explicit-break); אין רווחים ואין חפיפות — `coverage.ok` הוא שער "אין אטום אבוד", מוכח על כל 26 מסמכי הקורפוס ו־38 ה־fixtures.
  - **הפרסר הישן המוחזק** `packages/test-fixtures/legacy/react-lock/` — 18 קובצים מילוליים מ־React @ 0c7b9927 (manifest.json מאמת ביט-ביט) — מופעל בבדיקות הדיפרנציאל; מוחרג מ־depcruise ומסריקת היחידות (קוד ייחוס קפוא).
  - `packages/test-fixtures/test/legacy-parser.differential.test.ts` — **48 בדיקות דיפרנציאל**: לכל אחד מ־26 מסמכי הקורפוס (canonical, long×3, mid, chapters×14, cases×7) — השוואת ניתוב כל שורה גולמית מול הרצת שלבי הפרסר הישן אחד-לאחד, הערות שוליים/סיום בדיוק מלא, הערות צד כוללות, metadata שלם, וכיסוי מלא; בקבצים ללא הפרשים — גם שוויון רצף צמתי AST מלא.
  - 38 fixtures מזהים (`corpus/identifiers/`), 15 קודי שגיאה/אזהרה חדשים (`errors.parser.*` — 73 סה"כ ב־content-model), i18n ו־GLOSSARY עודכנו; CI מחובר ל־verify-parser.
- **פקודות בדיקה שרצו (ירוק):**
  - `npm run test:packages` — 248/248 (165 קודמות + 35 פרסר + 48 דיפרנציאל); `node scripts/migration/verify-parser.mjs` — 23/23; רגרסיה מלאה: כל 17 המאמתים PASS.
- **ממצאים:** הבדלי מקור אמת שנתגלו והוכרעו במרשם: (א) **התבנית הגמישה של Orange** — 82 שורות `כותרת 7 (מקור: …) - …` בקורפוס הקנוני שהבייסליין מזהה כהערות צד ו־React-lock דוחה; ההחלטה: הבייסליין קובע (מובנית קודם, גמישה אחר כך) — הפרש מוסבר ומתועד, מאומת בדיפרנציאל. (ב) **בליעת שורות** — הערת שוליים חוצת שורות מוחקת את ה־\n שבתוכן בטקסט המחובר של הישן: השורות מתמזגות לשורה סופית אחת (בלי מפריד פסקה ובלי רווח חיבור) — שוחזר במדויק בחדש (שורות נבלעות/שורת סגירה מרוקנת אינן מפרידות). (ג) **רווחית Unicode** — em-space (U+2003) בקצוות שורות בקורפוס: ‎trim‎ של הישן מקצץ אותה; הוגדרה ‎isWs‎ ‎=/\s/‎ בדיוק כמו trim. (ד) לכל אזהרה יש קוד קטלוגי מלא — אף זיהוי כמעט-כותרת לא נבלע בשקט. (ה) תיקוני מאמתים: units מחריג את הקוד הישן הקפוא; inline-blocks מעודכן ל־73 קודים.

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
