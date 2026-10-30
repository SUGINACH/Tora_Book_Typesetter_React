# Geometry audit report

- Input: very_long_test_text.txt
- Audit instrumentation integrity: PASS
- Instrumentation integrity failures: none
- Settings: default_settings.json (automatic default)
- Generated: 2026-10-30T00:33:12.843Z
- Render duration: 294828 ms
- Repeat-render determinism: PASS
- Geometry extraction: 3220.2 ms
- Pages: 639
- Decision ledger: 857 records; valid schema-v1 records: 857
- DOM two-column blocks: 857
- Parenthesis scope map: {"paragraphCount":4265,"pairedParenthesisCount":2483,"crossColumnPairCount":81,"crossPagePairCount":48,"unmatchedOpenCountAtDocumentEnd":0,"unmatchedOpenExamples":[],"unmatchedCloseCount":3,"unmatchedCloseExamples":[{"paragraphIndex":1061,"charIndex":544,"pageIdx":129,"blockIndex":168,"side":"right","tokenId":"979","preview":"ץ בתוך ג' כבר חשוב מעשה שלו כהנחה, אבל ביחס לחפץ בעינן שינוח), כי אף שההכלה הוא מעשה פחות חשוב מן ההינוח לגבי חפץ, לגבי מעשה שעושה ברשויות, הרי אין עושה רק הבאה"},{"paragraphIndex":2426,"charIndex":596,"pageIdx":315,"blockIndex":453,"side":"left","tokenId":"2143","preview":"ה דמקום) ברוח רביעית, ובסוכה לר\"ס וא\"ת ריב\"ל עוד יבואר בעז\"ה)."},{"paragraphIndex":3661,"charIndex":2,"pageIdx":528,"blockIndex":717,"side":"left","tokenId":"3135","preview":"כא) וְהָיָה אִם שָׁמֹעַ תִּשְׁמְעוּ אֶל מִצְוֹתַי אֲשֶׁר אָנֹכִי מְצַוֶּה אֶתְכֶם הַיּוֹם לְאַהֲבָה אֶ"}]}
- Blocks with cross-column parenthesis scopes: 76
- Blocks with cross-page parenthesis scopes: 94
- Parenthesis-scope diagnostic coverage: 857/857
- Local paren-font counterfactuals: {"version":1,"blockCount":857,"eligibleCount":4,"testedCount":4,"restoreMismatchCount":0,"errorCount":0}
- Counterfactual restoration mismatches/errors: 0/0
- Decision diagnostic gate: PASS
- Decision diagnostic records: 857
- Evaluated candidates/tables/capacity snapshots: 382/382/382
- Decision diagnostic failures: none
- Ledger/DOM count parity: PASS
- Decision records missing/malformed: 0
- Blocks with selected candidate: 382
- Blocks with paragraph geometry changes during parenthesis wrapping: 9
- Blocks with style-only changes during parenthesis wrapping: 8
- Blocks with paragraph geometry changes in later passes: 23
- Blocks with style-only changes in later passes: 13
- Blocks with a post-global height delta > 0.5px: 19
- Local final-justify attempts: 291
- Local final-justify overshoots corrected: 89
- Local final-justify overshoots remaining: 9
- Local final-justify rollbacks: 1
- Local final-justify balance-improved attempts: 290
- Parenthesis final-snapshot mismatches: 0
- Blocks with missing/incomplete cross-parenthesis diagnostics: 0
- Blocks with cross-parenthesis diagnostic errors: 0
- Canonical final stage snapshots: 857/857
- Blocks missing canonical final stage: 0
- Stage diagnostic capture errors: 0
- Stage snapshot coverage: {"postfit":774,"before-page-stretch":536,"after-page-stretch":536,"after-orphan-reclaim":538,"after-page-final-justify":44,"canonical-final":857}
- Source-to-rendered paragraph conservation: 3105 source paragraphs; missing 0; text mismatches 0; extra rendered IDs 0
- Source heading coverage: 529 source headings; missing 0; text mismatches 0
- Side-note coverage: 2042 source side notes; metadata missing/mismatches 0/0; rendered text missing/mismatches 0/0
- End-note coverage: 0 source end notes; metadata missing/mismatches 0/0; rendered text missing 0
- Issues: 39
- High: 0 | Medium: 11 | Low: 28

## Active geometry gate

- Enabled: no
- Result: PASS
- Blocking geometry findings: 0
- Non-blocking note-marker rounding findings: 7
- Unexpected/malformed containment-rounding findings (blocking): 0
- Policy: only finite note-marker protrusions from 0px through 3px; findings remain in audit issue inventory

## Issue counts by kind

| Kind | Count |
|---|---:|
| container-gap | 12 |
| imbalance | 8 |
| containment-rounding | 7 |
| structural-fallback | 6 |
| sparse-page | 3 |
| square-bracket-scope | 3 |

## Geometry feature coverage

- Ornament-related settings active: 1/15
- Rendered ornament DOM elements with nonzero geometry: {"h2Top":0,"h2Bottom":0,"h3Right":0,"h3Left":0,"noteHeaderRight":0,"noteHeaderLeft":0}
- Section-divider/note-rule/header-divider settings active: 3/4
- Rendered divider/header/H2-title/column-divider geometry: {"sectionDivider":81,"noteRule":76,"topHeader":622,"topHeaderDivider":622,"colGutterDivider":0,"headerOrnament":0,"headerOrnamentGraphic":0,"headerOrnamentRight":0,"headerOrnamentCenter":0,"headerOrnamentLeft":0,"headerOrnamentGraphicRight":0,"headerOrnamentGraphicCenter":0,"headerOrnamentGraphicLeft":0,"h2TitleTop":0,"h2TitleBottom":0,"h2TitleSideRight":0,"h2TitleSideLeft":0}
- Running-header ornament wrapper/graphic geometry: {"wrapper":0,"svgOrImage":0}
- Running-header SVG/image clipping audit: {"count":0,"svgOrImageCount":0,"missingGraphicCount":0,"invalidViewBoxCount":0,"clippingFindingCount":0,"elements":[]}
- Running-header ornament settings: none
- Running-header selected recto types: {"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"}
- Running-header selected verso types: {"right":"book_title_split_r","center":"h1","left":"book_title_split_l"}
- Per-page header selection evidence: [{"pageIndex":"3","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"4","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"5","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"6","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"7","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"8","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"9","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"10","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"11","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"12","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"13","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"14","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]}]
- Coverage counts are observed DOM evidence, not configuration inference; zero can mean the input did not trigger that component.
- Active ornament settings: h2-orn-scope=both
- Active divider/header settings: section-divider-style=spear, note-rule-style=star, hdr-divider-style=gray

## Local parenthesis-font counterfactuals

These are diagnostic-only measurements. The engine restores the original styles after each test; same-font values are not the production layout.

| Page | Baseline R/L (px) | Same-font R/L (px) | Residual before → after (px) | Restored exactly |
|---:|---:|---:|---:|:---:|
| רכט | 479/484 | 500/500 | 5 → 0 | yes |
| תקל | 71/66 | 71/65 | 5 → 6 | yes |
| תקלא | 71/65 | 93/65 | 6 → 28 | yes |
| תקפו | 157/152 | 179/152 | 5 → 27 | yes |

## Balance residual classification

Every residual remains in the issue inventory. This table classifies the measured cause/policy; it does not suppress or waive the finding.

| Classification | Count |
|---|---:|
| capacity-limited-residual | 6 |
| policy-accepted-light-justify-residual | 2 |

## Per-page balance capacity diagnostics

This table exposes the selected route and measured vertical-stretch capacity for each imbalance. A value of `n/a` means that route did not produce a final-justify capacity snapshot; residuals remain in the issue inventory.

| Page | Final Δ (px) | Classification | Decision route | Target side/height (px) | Capacity before R/L (px) | Capacity after R/L (px) |
|---:|---:|---|---|---|---|---|
| 230 | 5 | policy-accepted-light-justify-residual | light-justify-residual-within-8px-policy [479/464→479/484] | none | R n/a / L n/a | R n/a / L n/a |
| 236 | 6 | capacity-limited-residual | balanceColumns | left/71 | R 22.51 / L 15.01 | R 22.51 / L 0 |
| 272 | 6 | capacity-limited-residual | balanceColumns | left/71 | R 22.51 / L 15.01 | R 22.51 / L 0 |
| 501 | 6 | capacity-limited-residual | balanceColumns | right/71 | R 15.01 / L 22.51 | R 0 / L 22.51 |
| 531 | 5 | capacity-limited-residual | balanceColumns | left/71 | R 22.51 / L 15.01 | R 22.51 / L 0 |
| 532 | 6 | capacity-limited-residual | balanceColumns | left/71 | R 22.51 / L 15.01 | R 22.51 / L 0 |
| 587 | 5 | policy-accepted-light-justify-residual | light-justify-residual-within-8px-policy [157/114→157/152] | none | R n/a / L n/a | R n/a / L n/a |
| 601 | 6 | capacity-limited-residual | balanceColumns | left/71 | R 22.51 / L 15.01 | R 22.51 / L 0 |

## Footnote measurement consistency

- Pages with footnote areas: 76
- Exact queue matches: 76/76
- Matched samples with |actual − measured| > 5px: 0
- Maximum absolute difference: 0px

## Side-note fit adjustments

No side-note fit adjustments were needed.

## Issues

- **LOW** — container-gap — page 41 — פער אנכי של 139px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד מ
- **LOW** — structural-fallback — page 46 — Short terminal fragment intentionally spans both text columns because no legal two-column split exists.
- **LOW** — container-gap — page 89 — פער אנכי של 222px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד פח
- **LOW** — containment-rounding — page 195 — תיבת note-marker בולטת מ-p-end: {"left":0,"top":1.328125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — container-gap — page 204 — פער אנכי של 145px בין סוף טקסט הגוף ל-תחתית אזור הגוף בעמוד רג
- **LOW** — structural-fallback — page 218 — Short terminal fragment intentionally spans both text columns because no legal two-column split exists.
- **LOW** — imbalance — page 230 — אי-איזון טורים: ימין=479px שמאל=484px פער=5px [policy-accepted-light-justify-residual]
- **LOW** — imbalance — page 236 — אי-איזון טורים: ימין=71px שמאל=65px פער=6px [capacity-limited-residual]
- **LOW** — imbalance — page 272 — אי-איזון טורים: ימין=71px שמאל=65px פער=6px [capacity-limited-residual]
- **LOW** — structural-fallback — page 315 — Short terminal fragment intentionally spans both text columns because no legal two-column split exists.
- **LOW** — sparse-page — page 341 — תפוסת טקסט נמוכה בעמוד שמ: 12% מהקיבולת המשוערת
- **MEDIUM** — container-gap — page 341 — פער אנכי של 784px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד שמ
- **LOW** — structural-fallback — page 472 — Short terminal fragment intentionally spans both text columns because no legal two-column split exists.
- **LOW** — imbalance — page 501 — אי-איזון טורים: ימין=65px שמאל=71px פער=6px [capacity-limited-residual]
- **MEDIUM** — sparse-page — page 501 — תפוסת טקסט נמוכה בעמוד תק: 7% מהקיבולת המשוערת
- **MEDIUM** — container-gap — page 501 — פער אנכי של 851px בין סוף טקסט הגוף ל-תחתית אזור הגוף בעמוד תק
- **LOW** — containment-rounding — page 503 — תיבת note-marker בולטת מ-p-cut: {"left":0,"top":1.3125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — containment-rounding — page 517 — תיבת note-marker בולטת מ-p-end: {"left":0,"top":1.375,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **MEDIUM** — container-gap — page 525 — פער אנכי של 351px בין סוף טקסט הגוף ל-תחתית אזור הגוף בעמוד תקכד
- **LOW** — imbalance — page 531 — אי-איזון טורים: ימין=71px שמאל=66px פער=5px [capacity-limited-residual]
- **LOW** — imbalance — page 532 — אי-איזון טורים: ימין=71px שמאל=65px פער=6px [capacity-limited-residual]
- **LOW** — imbalance — page 587 — אי-איזון טורים: ימין=157px שמאל=152px פער=5px [policy-accepted-light-justify-residual]
- **LOW** — container-gap — page 589 — פער אנכי של 177px בין סוף טקסט הגוף ל-תחתית אזור הגוף בעמוד תקפח
- **MEDIUM** — container-gap — page 590 — פער אנכי של 537px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד תקפט
- **LOW** — structural-fallback — page 599 — Short terminal fragment intentionally spans both text columns because no legal two-column split exists.
- **LOW** — containment-rounding — page 601 — תיבת note-marker בולטת מ-p-cut: {"left":0,"top":1.3125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — containment-rounding — page 601 — תיבת note-marker בולטת מ-p-end: {"left":0,"top":1.375,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — imbalance — page 601 — אי-איזון טורים: ימין=71px שמאל=65px פער=6px [capacity-limited-residual]
- **LOW** — container-gap — page 603 — פער אנכי של 137px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד תרב
- **LOW** — sparse-page — page 625 — תפוסת טקסט נמוכה בעמוד תרכד: 16% מהקיבולת המשוערת
- **MEDIUM** — container-gap — page 625 — פער אנכי של 729px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד תרכד
- **MEDIUM** — container-gap — page 626 — פער אנכי של 490px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד תרכה
- **MEDIUM** — container-gap — page 632 — פער אנכי של 353px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד תרלא
- **LOW** — containment-rounding — page 636 — תיבת note-marker בולטת מ-p-end: {"left":0,"top":1.3125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — containment-rounding — page 636 — תיבת note-marker בולטת מ-p-end: {"left":0,"top":1.3125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — structural-fallback — page 636 — Short terminal fragment intentionally spans both text columns because no legal two-column split exists.
- **MEDIUM** — square-bracket-scope — page 505 — טווח סוגריים מרובעים/הערת שוליים חוצה פסקאות, טורים: עמוד תקד → תקד; פסקאות מקור 2566–2567
- **MEDIUM** — square-bracket-scope — page 514 — טווח סוגריים מרובעים/הערת שוליים חוצה פסקאות, טורים: עמוד תקיג → תקיג; פסקאות מקור 2614–2617
- **MEDIUM** — square-bracket-scope — page 629 — טווח סוגריים מרובעים/הערת שוליים חוצה פסקאות, עמודים: עמוד תרכז → תרכח; פסקאות מקור 3080–3081
