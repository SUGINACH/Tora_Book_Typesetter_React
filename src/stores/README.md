# src/stores

חמשת ה־stores של ה־React shell החדש (שלב 76; אפיון §13.1):

- `editor-store.ts` — מקור גולמי ומצב עריכה; **אינו מכיל Layout IR**.
- `settings-store.ts` — draft, presets ו־validation — הכל מ־`@tora/settings-schema`.
- `run-store.ts` — מכונת מצבי ה־job + הגנת stale-job דו־שכבתית.
- `result-store.ts` — IR/manifest/findings/AnchorTable; הכנסה ⇐ deepFreeze איטרטיבי.
- `view-store.ts` — zoom/עמוד/locale/focus; UI-only.

תשתית: `storage.ts` (KVStorage מוזרק, מפתחות `tora-ui:*:v1`), `legacy-migrate.ts`
(מיגרציית state ישן — קריאה בלבד, חד־פעמית), `selectors.ts` (בוררים צרים עם
`useStoreWithEqualityFn` + `shallow`), `index.ts` (חבית + `resetForNewDocument`).

מחליף את `src/store/` הישן עם השלמת פרק י. הקוד הישן ב־src/ אינו נקודת ייחוס
(כלל 8 בתכנית) ויוחלף בסיום ההגירה.
