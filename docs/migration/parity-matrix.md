# מטריצת parity בפועל — שלב 5 בתכנית 100 השלבים

**אסמכתא:** אפיון §2 (כללי פרשנות), §3.1 · תכנית 100 השלבים, שלב 5. **מקור הטענות:** README.md, docs/green-V23/MASTER_WORK_REGISTER.md ו־worklog.md של Orange @ `93ad1e57`.

**סיכום:** 22 טענות — 17 מאומתות, 4 היסטוריות, 1 עקרון מתועד. **16 יעדי differential** לשלב 48 ואילך (הטענות המאומתות).

הספירות ההיסטוריות (27/37 ממצאים, 858/886 רשומות, 525 גופנים, 1,923 עיטורים) נכונות ל־Green runs המקוריים בלבד ואינן יעד; ספירות העמודים (639/659) והמדדים המבניים אומתו מחדש בבייסליין שלנו.

| מזהה | טענה | מקור | סטטוס | ראיה / הערה | יעד differential |
|---|---|---|---|---|---|
| C-01 | תצורת ברירת מחדל: 639 עמודים במסמך הקנוני | README.md · MASTER_WORK_REGISTER §1 | **מאומתת בבייסליין** | artifacts: `canonical.json.gz` (pageCount) | כן |
| C-02 | עיטורים פעילים: 659 עמודים במסמך הקנוני | README.md · MASTER_WORK_REGISTER §1 | **מאומתת בבייסליין** | artifacts: `ornaments.json.gz` (pageCount) | כן |
| C-03 | ברירת מחדל: 0 ממצאי HIGH | README.md · MASTER_WORK_REGISTER §1 | **מאומתת בבייסליין** | artifacts: `canonical.json.gz` (audit.summary.high) | כן |
| C-04 | עיטורים פעילים: 0 ממצאי HIGH | README.md · MASTER_WORK_REGISTER §1 | **מאומתת בבייסליין** | artifacts: `ornaments.json.gz` (audit.summary.high) | כן |
| C-05 | ברירת מחדל: 27 ממצאים (0 HIGH, 4 MEDIUM, 23 LOW) | README.md — Green run 40386889244 (code 3a7c3b67) | **היסטורית (SHA-locked)** | לא שוחזר: בבייסליין שלנו (Orange@93ad1e57) — 39 ממצאים (0/11/28). צנרת הממצאים התפתחה בין הריצות. ספירות היסטוריות הן baseline ל־SHA שלהן בלבד, לא יעד. | — |
| C-06 | עיטורים פעילים: 37 ממצאים (0 HIGH, 6 MEDIUM, 31 LOW) | README.md — Green run 40386889244 (code 3a7c3b67) | **היסטורית (SHA-locked)** | לא שוחזר: 59 ממצאים (0/23/36) בבייסליין שלנו. כנ"ל — ספירות SHA-locked. | — |
| C-07 | ברירת מחדל: hash פריסה זהה בריצה חוזרת (repeat-check) | README.md · MASTER_WORK_REGISTER §2.4 | **מאומתת בבייסליין** | artifacts: `canonical.json.gz` (run.determinismCheck.identical) | כן |
| C-08 | עיטורים פעילים: hash פריסה זהה בריצה חוזרת | MASTER_WORK_REGISTER §1 (טבלה: "hash בריצה חוזרת — זהה") | **מאומתת בבייסליין** | artifacts: `ornaments.json.gz` (run.determinismCheck.identical) | כן |
| C-09 | שימור תוכן בברירת מחדל: 0 פסקאות חסרות / 0 טקסט לא תואם | MASTER_WORK_REGISTER §1 (טבלה: 0/0) | **מאומתת בבייסליין** | artifacts: `canonical.json.gz` (geometry.textConservationAudit.missingSourceParagraphCount, geometry.textConservationAudit.textMismatchCount) | כן |
| C-10 | שימור תוכן בעיטורים פעילים: 0 פסקאות חסרות / 0 טקסט לא תואם | MASTER_WORK_REGISTER §1 (טבלה: 0/0) | **מאומתת בבייסליין** | artifacts: `ornaments.json.gz` (geometry.textConservationAudit.missingSourceParagraphCount, geometry.textConservationAudit.textMismatchCount) | כן |
| C-11 | יומן החלטות בברירת מחדל: מספר רשומות תואם לבלוקי DOM, 0 פגומות | MASTER_WORK_REGISTER §1 (858/858, 0 פגומות) | **מאומתת בבייסליין** | artifacts: `canonical.json.gz` (geometry.layoutDecisionRecordAudit.recordCountMatchesDom, geometry.layoutDecisionRecordAudit.missingOrMalformedCount) | כן |
| C-12 | יומן החלטות בעיטורים פעילים: תאימות רשומות↔DOM, 0 פגומות | MASTER_WORK_REGISTER §1 (886/886, 0 פגומות) | **מאומתת בבייסליין** | artifacts: `ornaments.json.gz` (geometry.layoutDecisionRecordAudit.recordCountMatchesDom, geometry.layoutDecisionRecordAudit.missingOrMalformedCount) | כן |
| C-13 | ספירות מדויקות: 858/858 ברירת מחדל, 886/886 עיטורים; 525 גופנים; 1,923 עטיפות עיטור | MASTER_WORK_REGISTER §1 — Green runs (code 3a7c3b67) | **היסטורית (SHA-locked)** | ספירות אלו SHA-locked: אצלנו 857/857, 888/888, 485 גופנים, 996 אלמנטי עיטור. התכונות (תאימות, 0 כשלים, כיסוי עיטורים) אומתו — הספירות המדויקות אינן יעד. | — |
| C-14 | עמודים דלילים: 3 בברירת מחדל | MASTER_WORK_REGISTER §1 (הממצאים שנותרו) | **מאומתת בבייסליין** | artifacts: `canonical.json.gz` (audit.summary.byKind.sparse-page) | כן |
| C-15 | עמודים דלילים: 9 בעיטורים פעילים | MASTER_WORK_REGISTER §1 (הממצאים שנותרו) | **מאומתת בבייסליין** | artifacts: `ornaments.json.gz` (audit.summary.byKind.sparse-page) | כן |
| C-16 | כל הגופנים נטענים ואין כשלי טעינה (בשתי התצורות) | MASTER_WORK_REGISTER §1 (525/0) | **מאומתת בבייסליין** | artifacts: `canonical.json.gz` (geometry.fontPreflight.failed, geometry.fontPreflight.loaded, geometry.fontPreflight.faceCount) | כן |
| C-17 | בתצורת עיטורים פעילים נוצר כיסוי עיטורים מלא (H2 עליון/תחתון, H3 ימין/שמאל, כותרות הערות); בברירת מחדל — אפס | MASTER_WORK_REGISTER §1 (1,923 עטיפות; כיסוי חיובי) | **מאומתת בבייסליין** | artifacts: `ornaments.json.gz` (geometry.ornamentDomCoverage.h2Top, geometry.ornamentDomCoverage.h3Right, geometry.ornamentDomCoverage.noteHeaderRight) | כן |
| C-18 | המנוע רץ offline — אין בקשות רשת חיצוניות (guard: קוד יציאה 7) | README.md · PROVENANCE.md | **מאומתת בבייסליין** | artifacts: `canonical.json.gz` (run.externalRequests.length, run.externalRequests) | כן |
| C-19 | סביבת הריצה הנדרשת: Node 22 | README.md ("נדרשים Node.js 22 ו־npm") | **מאומתת בבייסליין** | artifacts: `baseline-run.json` (environment.node) | — |
| C-20 | worklog (2026-10-11): "0 עמודים עם חוסר איזון טורים >30px" במסמך של 97 עמודים | worklog.md — Task column-balance-fixes / github-fonts-and-bug-fixes | **היסטורית (SHA-locked)** | מסמך אחר (97 עמודים) ו־SHA אחר; בקנוני שלנו יש 8 ממצאי imbalance פתוחים. הטענה נכונה לנקודת הזמן שלה בלבד. | — |
| C-21 | הצלחת CI אינה מבטיחה שכל עמוד מיטבי; ממצאי MEDIUM/LOW נשארים גלויים עד שהוכרעו | README.md ("מה הבדיקות מוכיחות — ומה לא") | **עקרון מתועד** | כלל פרשנות מחייב, לא טענת ריצה — אומץ גם באפיון §2 ובתכנית. | — |
| C-22 | קורפוס ה-smoke בודק מקרי קצה ממוקדים (טור ריק, אין פיצול חוקי, סוגריים, עיטורים, כותרות) | README.md · tests/fixtures/ | **מאומתת בבייסליין** | artifacts: `mid.json.gz` (pageCount) | כן |

## אימות

```bash
node scripts/migration/verify-parity-matrix.mjs
```

הסקריפט מאמת מחדש כל טענה "מאומתת" מול ה-artifacts בפועל (פריסת gzip, ניווט לשדה, השוואת ערך) — לא מסתפק בסיווג.
