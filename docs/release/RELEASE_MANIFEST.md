# Release Manifest — תורת הוכחות (שלב 99; אפיון §18-M12, §20, §24)

> **מקור הסמכות:** חישוב טרי מהרצה של ה-CLI; מאומת על ידי
> `scripts/migration/verify-release-manifest.mjs` בכל push (regen === committed).
> אין הצהרה ללא ראיה — כל hash להלן נבדק מול ריצה חדשה.

## שרשרת הראיות (§24)

```text
Source bytes → Source spans / atoms → Measurement fingerprint
→ Candidate decisions → Immutable Layout IR → Independent audit
→ Deterministic projections → Reproducible run manifest
```

## Hashes נעולים — מסמך הייחוס (reference-source.txt)

| שלב בשרשרת | ה-hash (מתוך manifest.json של הריצה) |
|---|---|
| input (מקור) | 11fb893307da1a06b43668d57a4d1a74d5076b3376de45736c1ddfa1d11dca59 |
| config (הגדרות אפקטיביות) | f581e01c5173369f933f71be64777d30184533c98e97b0e2c9608b9efd7420c8 |
| fonts (מניפסט גופנים) | c8cf86d69c5464bfe83b27f5aed0d0d8b33c24be5ad50b010643aabaf5fd951f |
| assets (מניפסט נכסים) | 571e5947132fe46de9291849ce044e92a26e1176c88ad51eb3701686194e6c78 |
| environment (סביבת מדידה) | ba9ab30652db867427ce35711d9a81e8130805b356921b9ea0bf65e8881c39d5 |
| engine (קוד המנוע) | dev |
| **layout (ה-IR הסופי)** | **aea2924552554b8230c4b381278c196ef66211f45b08cf8a43f986843e4dcd03** |

* engineVersion: 0.1.0 · parser: content-model
* זהות הקוד: codeSha=dev ('dev' מפורש בפיתוח — §12; ב-release מוזרק מ-build metadata — תגית ה-git שממנה נבנה הבאנדל, נרשמת בעמוד ה-release)
* sourceSha256 (הקובץ עצמו): 7e3dca69b6f3aba8a386e4ea0fb536f3126acbd5c1c3debce4c91239361c3840

## קורפוס ה-release (ה-golden הנעול)

`packages/test-fixtures/release-golden.json` — 9 fixtures; ה-reference
במסלול ההרכבה (--compose). ה-golden מאומת בכל push: regen === committed.
אפס ממצאי HIGH בכולם (חוזה verify-release-fixtures).

## מסמכים ארוכים

* הקנוני הארוך (very_long, 642 עמודים): layoutHash נעול ב-artifacts/release/hardening.json
  (מאומת ב-verify-hardening: אפס HIGH, אופליין, heap ≤ 3GB, trace אינו משנה hash).

## Fallbacks ומדיניותם

כל קוד fallback מנספח ב לאפיון מופיע עם מדיניות מתועדת: EMERGENCY_LINE /
EMERGENCY_STRETCH (ADR-004; סולם חירום מדורג — שלב 44), LONG_NOTE_SPLIT
(ADR-005 — מתי הערה ארוכה נחתכת ומתי דוחה עוגן), SEARCH_BUDGET_EXHAUSTED
(ADR-010 — תקציבי חיפוש עמודים), TOC_FIXED_POINT_NOT_REACHED (ADR-011 —
מדיניות oscillation בנקודת השבת החוץ).

## אופן השחזור

```bash
node packages/cli/dist/main.js --input packages/cli/test/fixtures/reference-source.txt --out /tmp/relman
cat /tmp/relman/manifest.json   # ה-hashes לעיל — חייבים להתאים ביט-ביט
```
