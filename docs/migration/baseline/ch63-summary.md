# Geometry audit report

- Input: fixtures/ch63_final_paragraph_failure_case.txt
- Audit instrumentation integrity: PASS
- Instrumentation integrity failures: none
- Settings: default_settings.json (automatic default)
- Generated: 2026-10-30T00:28:10.877Z
- Render duration: 3425 ms
- Repeat-render determinism: not run
- Geometry extraction: 43 ms
- Pages: 8
- Decision ledger: 6 records; valid schema-v1 records: 6
- DOM two-column blocks: 6
- Parenthesis scope map: {"paragraphCount":34,"pairedParenthesisCount":13,"crossColumnPairCount":0,"crossPagePairCount":0,"unmatchedOpenCountAtDocumentEnd":0,"unmatchedOpenExamples":[],"unmatchedCloseCount":0,"unmatchedCloseExamples":[]}
- Blocks with cross-column parenthesis scopes: 0
- Blocks with cross-page parenthesis scopes: 0
- Parenthesis-scope diagnostic coverage: 6/6
- Local paren-font counterfactuals: {"version":1,"blockCount":6,"eligibleCount":0,"testedCount":0,"restoreMismatchCount":0,"errorCount":0}
- Counterfactual restoration mismatches/errors: 0/0
- Decision diagnostic gate: PASS
- Decision diagnostic records: 6
- Evaluated candidates/tables/capacity snapshots: 1/1/1
- Decision diagnostic failures: none
- Ledger/DOM count parity: PASS
- Decision records missing/malformed: 0
- Blocks with selected candidate: 1
- Blocks with paragraph geometry changes during parenthesis wrapping: 0
- Blocks with style-only changes during parenthesis wrapping: 0
- Blocks with paragraph geometry changes in later passes: 0
- Blocks with style-only changes in later passes: 0
- Blocks with a post-global height delta > 0.5px: 0
- Local final-justify attempts: 0
- Local final-justify overshoots corrected: 0
- Local final-justify overshoots remaining: 0
- Local final-justify rollbacks: 0
- Local final-justify balance-improved attempts: 0
- Parenthesis final-snapshot mismatches: 0
- Blocks with missing/incomplete cross-parenthesis diagnostics: 0
- Blocks with cross-parenthesis diagnostic errors: 0
- Canonical final stage snapshots: 6/6
- Blocks missing canonical final stage: 0
- Stage diagnostic capture errors: 0
- Stage snapshot coverage: {"postfit":5,"before-page-stretch":5,"after-page-stretch":5,"after-orphan-reclaim":5,"after-page-final-justify":0,"canonical-final":6}
- Source-to-rendered paragraph conservation: 26 source paragraphs; missing 0; text mismatches 0; extra rendered IDs 0
- Source heading coverage: 1 source headings; missing 0; text mismatches 0
- Side-note coverage: 18 source side notes; metadata missing/mismatches 0/0; rendered text missing/mismatches 0/0
- End-note coverage: 0 source end notes; metadata missing/mismatches 0/0; rendered text missing 0
- Issues: 3
- High: 0 | Medium: 2 | Low: 1

## Active geometry gate

- Enabled: no
- Result: PASS
- Blocking geometry findings: 0
- Non-blocking note-marker rounding findings: 0
- Unexpected/malformed containment-rounding findings (blocking): 0
- Policy: only finite note-marker protrusions from 0px through 3px; findings remain in audit issue inventory

## Issue counts by kind

| Kind | Count |
|---|---:|
| container-gap | 2 |
| sparse-page | 1 |

## Geometry feature coverage

- Ornament-related settings active: 1/15
- Rendered ornament DOM elements with nonzero geometry: {"h2Top":0,"h2Bottom":0,"h3Right":0,"h3Left":0,"noteHeaderRight":0,"noteHeaderLeft":0}
- Section-divider/note-rule/header-divider settings active: 3/4
- Rendered divider/header/H2-title/column-divider geometry: {"sectionDivider":1,"noteRule":4,"topHeader":6,"topHeaderDivider":6,"colGutterDivider":0,"headerOrnament":0,"headerOrnamentGraphic":0,"headerOrnamentRight":0,"headerOrnamentCenter":0,"headerOrnamentLeft":0,"headerOrnamentGraphicRight":0,"headerOrnamentGraphicCenter":0,"headerOrnamentGraphicLeft":0,"h2TitleTop":0,"h2TitleBottom":0,"h2TitleSideRight":0,"h2TitleSideLeft":0}
- Running-header ornament wrapper/graphic geometry: {"wrapper":0,"svgOrImage":0}
- Running-header SVG/image clipping audit: {"count":0,"svgOrImageCount":0,"missingGraphicCount":0,"invalidViewBoxCount":0,"clippingFindingCount":0,"elements":[]}
- Running-header ornament settings: none
- Running-header selected recto types: {"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"}
- Running-header selected verso types: {"right":"book_title_split_r","center":"h1","left":"book_title_split_l"}
- Per-page header selection evidence: [{"pageIndex":"1","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"2","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"3","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"4","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"5","parity":"odd","distinctMode":"recto","selectedTypes":{"right":"book_title_split_r","center":"h2_without_siman","left":"book_title_split_l"},"ornaments":[]},{"pageIndex":"6","parity":"even","distinctMode":"verso","selectedTypes":{"right":"book_title_split_r","center":"h1","left":"book_title_split_l"},"ornaments":[]}]
- Coverage counts are observed DOM evidence, not configuration inference; zero can mean the input did not trigger that component.
- Active ornament settings: h2-orn-scope=both
- Active divider/header settings: section-divider-style=spear, note-rule-style=star, hdr-divider-style=gray

## Local parenthesis-font counterfactuals

These are diagnostic-only measurements. The engine restores the original styles after each test; same-font values are not the production layout.

| Page | Baseline R/L (px) | Same-font R/L (px) | Residual before → after (px) | Restored exactly |
|---:|---:|---:|---:|:---:|
| No eligible cases | — | — | — | — |

## Footnote measurement consistency

- Pages with footnote areas: 4
- Exact queue matches: 4/4
- Matched samples with |actual − measured| > 5px: 0
- Maximum absolute difference: 0px

## Side-note fit adjustments

No side-note fit adjustments were needed.

## Issues

- **LOW** — sparse-page — page 5 — תפוסת טקסט נמוכה בעמוד ד: 16% מהקיבולת המשוערת
- **MEDIUM** — container-gap — page 5 — פער אנכי של 729px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד ד
- **MEDIUM** — container-gap — page 6 — פער אנכי של 490px בין סוף טקסט הגוף ל-אזור הערות השוליים בעמוד ה
