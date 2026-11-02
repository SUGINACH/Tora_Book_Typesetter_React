# @tora/test-fixtures — קורפוס בדיקה נעול (שלב 4 בתכנית 100 השלבים)

**אסמכתא:** אפיון §17.3, §18-M0, §23 · תכנית 100 השלבים, שלב 4. סטטוס: רשימה ראשונית; הסכמה המלאה (goldenLayoutSha256, fontManifestSha256, כלי golden) תושלם בשלב 13.

## מבנה

- `registry.json` — הרישום הראשי: 26 fixtures, כל אחד עם `sourceSha256`, `provenance` (מקור, SHA, סיבה), invariants צפויים וקישור לבייסליין משלב 3 כאשר קיים.
- `corpus/` — קובצי המקור הנעולים (הועתקו מ־Orange @ `93ad1e57`): `canonical/`, `long/`, `mid/`, `chapters/`, `cases/`.
- `documentedBehaviors` — באגים והתנהגויות מתועדים מ־worklog ו־docs של התוכנה הישנה, עם הקורפוס שמפעיל אותם וה־invariants הנגזרים.
- `plannedFixtures` — דרישות קורפוס מחייבות מאפיון §17.3 שטרם נכתבו כקבצים; יחוברו בשלבים 13, 17, 21, 74.

## כללי זהב

1. **אין fixture בלי מקור ו־hash** — נאכף על ידי `scripts/migration/verify-test-fixtures.mjs`.
2. **Golden לא מתעדכן אוטומטית ב־CI.** שינוי golden מחייב diff קריא (anchors, pages, findings, מקורות) והסבר ב־WORKLOG (אפיון §17.3).
3. בייסליין מקושר = פלט רפרנס משלב 3 (`docs/migration/baseline/`); אין לערבב baselines בין סביבות.

## אימות

```bash
node scripts/migration/verify-test-fixtures.mjs
```
