# Geometry audit report

- Input: mid_long_test_text.txt
- Audit instrumentation integrity: PASS
- Instrumentation integrity failures: none
- Settings: default_settings.json (automatic default)
- Generated: 2026-10-30T00:22:20.515Z
- Render duration: 48366 ms
- Repeat-render determinism: not run
- Geometry extraction: 660.2 ms
- Pages: 125
- Decision ledger: 167 records; valid schema-v1 records: 167
- DOM two-column blocks: 167
- Parenthesis scope map: {"paragraphCount":749,"pairedParenthesisCount":608,"crossColumnPairCount":21,"crossPagePairCount":5,"unmatchedOpenCountAtDocumentEnd":0,"unmatchedOpenExamples":[],"unmatchedCloseCount":1,"unmatchedCloseExamples":[{"paragraphIndex":173,"charIndex":2,"pageIdx":28,"blockIndex":32,"side":"left","tokenId":"147","preview":"כא) וְהָיָה אִם שָׁמֹעַ תִּשְׁמְעוּ אֶל מִצְוֹתַי אֲשֶׁר אָנֹכִי מְצַוֶּה אֶתְכֶם הַיּוֹם לְאַהֲבָה אֶ"}]}
- Blocks with cross-column parenthesis scopes: 20
- Blocks with cross-page parenthesis scopes: 10
- Parenthesis-scope diagnostic coverage: 167/167
- Local paren-font counterfactuals: {"version":1,"blockCount":167,"eligibleCount":3,"testedCount":3,"restoreMismatchCount":0,"errorCount":0}
- Counterfactual restoration mismatches/errors: 0/0
- Decision diagnostic gate: PASS
- Decision diagnostic records: 167
- Evaluated candidates/tables/capacity snapshots: 82/82/82
- Decision diagnostic failures: none
- Ledger/DOM count parity: PASS
- Decision records missing/malformed: 0
- Blocks with selected candidate: 82
- Blocks with paragraph geometry changes during parenthesis wrapping: 0
- Blocks with style-only changes during parenthesis wrapping: 0
- Blocks with paragraph geometry changes in later passes: 4
- Blocks with style-only changes in later passes: 0
- Blocks with a post-global height delta > 0.5px: 4
- Local final-justify attempts: 60
- Local final-justify overshoots corrected: 14
- Local final-justify overshoots remaining: 3
- Local final-justify rollbacks: 0
- Local final-justify balance-improved attempts: 60
- Parenthesis final-snapshot mismatches: 0
- Blocks with missing/incomplete cross-parenthesis diagnostics: 0
- Blocks with cross-parenthesis diagnostic errors: 0
- Canonical final stage snapshots: 167/167
- Blocks missing canonical final stage: 0
- Stage diagnostic capture errors: 0
- Stage snapshot coverage: {"postfit":150,"before-page-stretch":99,"after-page-stretch":99,"after-orphan-reclaim":100,"after-page-final-justify":14,"canonical-final":167}
- Source-to-rendered paragraph conservation: 524 source paragraphs; missing 0; text mismatches 0; extra rendered IDs 0
- Source heading coverage: 93 source headings; missing 0; text mismatches 0
- Side-note coverage: 427 source side notes; metadata missing/mismatches 0/0; rendered text missing/mismatches 0/0
- End-note coverage: 0 source end notes; metadata missing/mismatches 0/0; rendered text missing 0
- Issues: 15
- High: 0 | Medium: 4 | Low: 11

## Active geometry gate

- Enabled: no
- Result: PASS
- Blocking geometry findings: 0
- Non-blocking note-marker rounding findings: 4
- Unexpected/malformed containment-rounding findings (blocking): 0
- Policy: only finite note-marker protrusions from 0px through 3px; findings remain in audit issue inventory

## Issue counts by kind

| Kind | Count |
|---|---:|
| containment-rounding | 4 |
| container-gap | 4 |
| imbalance | 4 |
| square-bracket-scope | 2 |
| structural-fallback | 1 |

## Geometry feature coverage

- Ornament-related settings active: 1/15
- Rendered ornament DOM elements with nonzero geometry: {"h2Top":0,"h2Bottom":0,"h3Right":0,"h3Left":0,"noteHeaderRight":0,"noteHeaderLeft":0}
- Section-divider/note-rule/header-divider settings active: 3/4
- Rendered divider/header/H2-title/column-divider geometry: {"sectionDivider":16,"noteRule":40,"topHeader":116,"topHeaderDivider":116,"colGutterDivider":0,"headerOrnament":0,"headerOrnamentGraphic":0,"headerOrnamentRight":0,"headerOrnamentCenter":0,"headerOrnamentLeft":0,"headerOrnamentGraphicRight":0,"headerOrnamentGraphicCenter":0,"headerOrnamentGraphicLeft":0,"h2TitleTop":0,"h2TitleBottom":0,"h2TitleSideRight":0,"h2TitleSideLeft":0}
- Running-header ornament wrapper/graphic geometry: {"wrapper":0,"svgOrImage":0}
- Running-header SVG/image clipping audit: {"count":0,"svgOrImageCount":0,"missingGraphicCount":0,"invalidViewBoxCount":0,"clippingFindingCount":0,"elements":[]}
- Running-header ornament settings: none
- Running-header selected recto types: {"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"}
- Running-header selected verso types: {"right":"book_title_split_r","center":"h1","left":"book_title_split_l"}
- Per-page header selection evidence: [{"pageIndex":"2","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"3","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"4","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"5","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"6","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"7","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"8","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"9","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"10","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"11","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"12","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"13","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]}]
- Coverage counts are observed DOM evidence, not configuration inference; zero can mean the input did not trigger that component.
- Active ornament settings: h2-orn-scope=both
- Active divider/header settings: section-divider-style=spear, note-rule-style=star, hdr-divider-style=gray

## Local parenthesis-font counterfactuals

These are diagnostic-only measurements. The engine restores the original styles after each test; same-font values are not the production layout.

| Page | Baseline R/L (px) | Same-font R/L (px) | Residual before → after (px) | Restored exactly |
|---:|---:|---:|---:|:---:|
| ל | 71/66 | 71/65 | 5 → 6 | yes |
| לא | 71/65 | 93/65 | 6 → 28 | yes |
| פו | 157/152 | 179/152 | 5 → 27 | yes |

## Balance residual classification

Every residual remains in the issue inventory. This table classifies the measured cause/policy; it does not suppress or waive the finding.

| Classification | Count |
|---|---:|
| capacity-limited-residual | 3 |
| policy-accepted-light-justify-residual | 1 |

## Per-page balance capacity diagnostics

This table exposes the selected route and measured vertical-stretch capacity for each imbalance. A value of `n/a` means that route did not produce a final-justify capacity snapshot; residuals remain in the issue inventory.

| Page | Final Δ (px) | Classification | Decision route | Target side/height (px) | Capacity before R/L (px) | Capacity after R/L (px) |
|---:|---:|---|---|---|---|---|
| 31 | 5 | capacity-limited-residual | balanceColumns | left/71 | R 22.51 / L 15.01 | R 22.51 / L 0 |
| 32 | 6 | capacity-limited-residual | balanceColumns | left/71 | R 22.51 / L 15.01 | R 22.51 / L 0 |
| 87 | 5 | policy-accepted-light-justify-residual | light-justify-residual-within-8px-policy [157/114→157/152] | none | R n/a / L n/a | R n/a / L n/a |
| 101 | 6 | capacity-limited-residual | balanceColumns | left/71 | R 22.51 / L 15.01 | R 22.51 / L 0 |

## Footnote measurement consistency

- Pages with footnote areas: 40
- Exact queue matches: 40/40
- Matched samples with |actual − measured| > 5px: 0
- Maximum absolute difference: 0px

## Side-note fit adjustments

No side-note fit adjustments were needed.

## Issues

- **LOW** — containment-rounding — page 3 — תיבת note-marker בולטת מ-p-cut: {"left":0,"top":1.328125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — containment-rounding — page 17 — תיבת note-marker בולטת מ-p-end: {"left":0,"top":1.328125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **MEDIUM** — container-gap — page 25 — פער אנכי של 351px בין סוף טקסט הגוף ל-תחתית אזור הגוף בעמוד כד
- **LOW** — imbalance — page 31 — אי-איזון טורים: ימין=71px שמאל=66px פער=5px [capacity-limited-residual]
- **LOW** — imbalance — page 32 — אי-איזון טורים: ימין=71px שמאל=65px פער=6px [capacity-limited-residual]
- **LOW** — imbalance — page 87 — אי-איזון טורים: ימין=157px שמאל=152px פער=5px [policy-accepted-light-justify-residual]
- **LOW** — container-gap — page 89 — פער אנכי של 177px בין סוף טקסט הגוף ל-תחתית אזור הגוף בעמוד פח
- **MEDIUM** — container-gap — page 90 — פער אנכי של 537px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד פט
- **LOW** — structural-fallback — page 99 — Short terminal fragment intentionally spans both text columns because no legal two-column split exists.
- **LOW** — containment-rounding — page 101 — תיבת note-marker בולטת מ-p-cut: {"left":0,"top":1.328125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — containment-rounding — page 101 — תיבת note-marker בולטת מ-p-end: {"left":0,"top":1.328125,"right":0,"bottom":0} (חריגה אנכית קטנה של סמן הערה בתוך שורת טקסט)
- **LOW** — imbalance — page 101 — אי-איזון טורים: ימין=71px שמאל=65px פער=6px [capacity-limited-residual]
- **LOW** — container-gap — page 103 — פער אנכי של 137px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד קב
- **MEDIUM** — square-bracket-scope — page 5 — טווח סוגריים מרובעים/הערת שוליים חוצה פסקאות, טורים: עמוד ד → ד; פסקאות מקור 9–10
- **MEDIUM** — square-bracket-scope — page 14 — טווח סוגריים מרובעים/הערת שוליים חוצה פסקאות, טורים: עמוד יג → יג; פסקאות מקור 57–60
