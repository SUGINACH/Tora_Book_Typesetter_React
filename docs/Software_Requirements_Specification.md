# Software Requirements Specification (SRS)
## Torah Book Typesetting Engine (`IMUD_TORANI`)
### Unambiguous Technical & Algorithmic Master Specification

---

### Scope & Terminology Standards
This specification defines the complete functional, algorithmic, and architectural requirements for the Torah Book Typesetting Engine (`IMUD_TORANI`). The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **RECOMMENDED**, and **MAY** in this document are to be interpreted as described in BCP 14 / RFC 2119.

---

### 1. Engine Pipeline Architecture & State Isolation

#### 1.1 Separation of Concerns: Computation vs. Rendering
1. The engine **MUST NOT** use an iterative DOM-mutation loop where intermediate DOM states are measured, mutated inline, and re-measured as ground truth.
2. The typesetting workflow **MUST** strictly follow a single-direction pipeline:
   $$\text{Raw Token Stream} \longrightarrow \text{Layout Candidate Generator} \longrightarrow \text{Isolated Sandbox Measurement} \longrightarrow \text{Candidate Scoring / Evaluation} \longrightarrow \text{DOM Commit}$$
3. All intermediate candidate layouts **MUST** be measured within an isolated sandbox container (`measuring-box`). This sandbox **MUST** inherit the exact typography, CSS classes, `font-family`, `font-size`, `line-height`, `letter-spacing`, `direction: rtl`, `text-align: justify`, margins, and inline spans as the target page DOM.

#### 1.2 Pipeline Invariants & Reflow Enforcement
1. Once a candidate layout is selected and committed to the page DOM, late mutations to geometric CSS properties (`font-size`, `line-height`, `margin-bottom`, `padding`, `word-spacing`, or `transform`) **ARE STRICTLY PROHIBITED** without invalidating the layout downstream.
2. Any post-balancing alteration that modifies line heights or container bounds **MUST** trigger a localized cascade:
   $$\text{Mutation} \longrightarrow \text{Invalidate Layout} \longrightarrow \text{Remeasure} \longrightarrow \text{Reflow Affected Block} \longrightarrow \text{Reflow Successive Pages (if needed)}$$
3. Source text reading from input elements **MUST** read raw, unparsed text via sanitized text-extraction methods (`getCleanEditorText()`) and **MUST NOT** rely on unescaped `.value` properties susceptible to encoding corruption.

---

### 2. Multi-Tier Column Balancing Algorithm (`balanceColumns`)

#### 2.1 Optimization Scope
1. Two-column balancing **MUST** execute exclusively in two contexts:
   * **Terminal Chapter Blocks**: Preceding a Chapter Break (`H2`), a Section Break (`H1`), or End of Document.
   * **Pre-H3 Blocks**: Immediately preceding a cross-column spanning heading (`H3`).
2. Two-column balancing in standard mid-chapter body flows (where text flows directly into the next page) **MUST NOT** compress or expand columns; it **MUST** simply fill columns to maximum page capacity.

#### 2.2 Strict Multi-Tier Priority Protocol
When balancing is required, the engine **SHALL** evaluate candidate breakpoints strictly through the following prioritized tiers:

* **Tier 1 — Whole Paragraph Reallocation**:
  * The engine **MUST** shift whole paragraphs from the right column (Column R) to the left column (Column L).
  * Shifting stops immediately if moving a paragraph causes Column L height to exceed Column R height.
  * If the resulting height difference ($\Delta h = |h_R - h_L|$) equals zero, balancing terminates.
* **Tier 2 — Rendered Line-Level Reallocation**:
  * The engine **MUST** measure whole rendered lines within paragraphs and shift lines from Column R to Column L.
  * Line reallocation **MUST NOT** create an orphan or widow violation (see Section 5).
  * Shifting stops if Column L becomes taller than Column R.
* **Tier 3 — Micro-Adjustment via Spacing (Only when $\Delta h \le 1\text{ line}$)**:
  * Micro-adjustments **MAY ONLY** execute if Column R is taller than Column L by at most one single line baseline.
  * The engine **MUST** adjust within the following strict boundaries (Baseline = 100%):
    * **Letter-spacing**: $98\% \le \text{spacing} \le 102\%$
    * **Word-spacing**: $85\% \le \text{spacing} \le 120\%$
    * **Paragraph margins**: $60\% \le \text{margin-bottom} \le 170\%$
    * **Heading margins**: $80\% \le \text{margin} \le 150\%$
    * **Line-height**: $95\% \le \text{line-height} \le 103\%$
* **Tier 4 — Emergency Micro-Adjustment**:
  * If $\Delta h > 1\text{ line}$, the engine **MAY** apply reciprocal scaling: simultaneously compress Column R (down to $99\%$ line height / $90\%$ word spacing) and expand Column L (up to $101\%$ line height / $110\%$ word spacing).

#### 2.3 Growth Ceilings & Precedence
1. Column L **MUST NEVER** exceed the height of Column R. When a tie or fractional subpixel discrepancy occurs, Column R **MUST** be the longer column.
2. In all balance candidates, the combined height of both columns **MUST NOT** exceed the available block height container (`growthCeiling`).

---

### 3. Sparse Line Prevention & Look-Ahead Word Pulling

#### 3.1 Definition of a Sparse Line (Runt)
1. A line is defined as **Sparse** (`sparse-line`) if and only if:
   * It is a mid-paragraph cut line (`p-cut`) at the bottom of a column or page.
   * Its inter-word spacing exceeds $150\%$ of standard word spacing, OR its character count is less than $40\%$ of the average line capacity in that column.
2. Sparse line detection **MUST NOT** evaluate outer margins or line width bounding boxes (since justified text always spans $100\%$ width). Detection **MUST** inspect:
   * Real inter-word spacing using `Range.getClientRects()` on whitespace boundaries, OR
   * Character count and word count relative to column width and font metrics.

#### 3.2 Non-Negotiable Look-Ahead Pulling Protocol
1. Mid-paragraph cut lines (`p-cut`) with sparse words **ARE STRICTLY UNACCEPTABLE**.
2. Setting `text-align-last: right` or `text-align-last: center` on a `p-cut` paragraph is **STRICTLY FORBIDDEN**.
3. When a `p-cut` line is detected as sparse, the engine **MUST** pull the first word(s) from the continuation fragment in the next column back into the bottom of the current column (`look-ahead line breaking`).
4. **Resolution Priority (Clarification 2)**:
   * Elimination of sparse lines in `p-cut` holds **absolute precedence** over widow/orphan avoidance in the next column.
   * Words **MUST** be pulled to eliminate the sparse line regardless of whether this reduces the top of the next column to a single word/orphan.
   * Any resulting widow or orphan at the top of the next column **MUST** be resolved independently downstream via vertical redistribution, line shifting, or micro-spacing.

---

### 4. Last Line Typographic Justification (`p-cut` vs. `p-end`)

#### 4.1 Completed Paragraphs (`p-end`)
1. In traditional Torah typography, the terminal line of a completed paragraph (`p-end`) **MUST** be centered.
2. **Clarification 1 Compliance**:
   * The rule `text-align-last: center !important` **MUST** be enforced unconditionally on all `p-end` elements.
   * This applies regardless of the terminal line's length (even if the line spans $85\%–95\%$ of the column width).
3. The layout audit engine **MUST NOT** flag a `p-end` centered line as sparse, regardless of how few words it contains.

#### 4.2 Split Paragraphs (`p-cut`)
1. Any paragraph fragment that continues into another column or page (`p-cut`) **MUST** maintain `text-align-last: justify !important`.
2. The last line of a `p-cut` block **MUST** appear indistinguishable from standard justified body lines.

---

### 5. Widow, Orphan, and Heading Isolation Prevention Rules

#### 5.1 Widows & Orphans
1. **Widow Rule**: The top of a column or page **MUST NOT** contain fewer than two lines of a continuing paragraph.
2. **Orphan Rule**: The bottom of a column or page **MUST NOT** contain a single opening line of a new paragraph. At least two lines of the paragraph **MUST** remain before a column break.
3. If an orphan line is detected at the bottom of Column R, the engine **MUST** push the line to Column L, unless overridden by Section 3.2's look-ahead rule.

#### 5.2 Heading Isolation & Stranded Headings
1. A heading of levels `H1`, `H2`, `H3`, `H4`, `H5`, or `H6` at the bottom of a column **MUST** be accompanied by at least two lines of its subsequent body text within the same column.
2. If fewer than two lines follow the heading before the column terminates, the heading **MUST** be deferred to the top of the next column or page.
3. An `H3` spanning heading that stands isolated in a block with zero lines of text beneath it is classified as a critical layout violation (**Orphan Heading**) and **MUST NOT** be committed.

---

### 6. First-Word Formatting (`Drop Word`) & Window Cutouts

#### 6.1 Cutout Window Rules (Clarification 3 Compliance)
1. **Paragraphs with 1 line**:
   * **MUST NOT** receive an enlarged first word and **MUST NOT** create a window cutout. Text renders as standard body text.
2. **Paragraphs with exactly 2 lines**:
   * **MUST** render the first word in the designated enlarged typography (`font-family: var(--fn-drop)`, `font-size: var(--sz-drop)`).
   * **MUST NOT** generate a vertical cutout window beneath it. Line 2 **MUST** span the full width of the column without an indent/cutout.
3. **Paragraphs with 3 or more lines**:
   * **MUST** render the enlarged first word on Line 1.
   * **MUST** generate a cutout window (indent) beneath the first word affecting Line 2 (and Line 3, depending on the configured drop-word height). Subsequent lines ($4+$) **MUST** return to the column's full horizontal width.

#### 6.2 Structural Invariants
1. The cutout window **MUST** affect only the paragraph to which it belongs. It **MUST NOT** introduce horizontal displacement, margin reduction, or float leakage into subsequent paragraphs or across the entire column.
2. A continuing paragraph fragment that crosses over to a new column or page (`p-cut` continuation) **MUST NOT** receive first-word enlargement or window cutouts.
3. **Vertical Alignment**: The visual ascent / cap-height of the enlarged first word **MUST** align flush with the ascent of the adjacent body text on Line 1 (not bottom-aligned, and not vertically offset).

---

### 7. Heading Hierarchy, Side Notes, and Chapter Numbering

#### 7.1 Break Rules and Chapter Starts (`H2`)
1. Only `H2` initiates a mandatory page break by default. An `H3` heading beneath an `H2` heading **MUST NOT** trigger an additional page break.
2. **Chapter Start Top Spacing (Clarification 4 Compliance)**:
   * The top $33.3\%$ (one-third) of an `H2` chapter-start page **MUST** remain completely clear of text.
   * The `H2` heading **MUST** anchor at precisely the $33.3\%$ vertical position of the page text container.
   * The body text following `H2` **MUST** flow downward and terminate flush with the standard page baseline grid at the bottom. The content **MUST NOT** be vertically centered within the remaining space.

#### 7.2 Margins for Column-Head Headings
1. If an `H4`, `H5`, or `H6` heading appears as the very first element at the top of a column (including immediately following a cross-column `H3`), its `margin-top` **MUST** be forced to `0`.
2. Heading top-margins are reserved strictly for headings positioned in the middle of a column.

#### 7.3 Side Notes (`H7`) Layout (Clarification 8 Compliance)
1. An `H7` side note **MUST** be placed in the outer margin corresponding to its column:
   * Notes originating in the **Right Column** **MUST** render in the **outer right margin**.
   * Notes originating in the **Left Column** **MUST** render in the **outer left margin**.
2. Side notes **MUST NOT** invade the central column-gap between the two columns.
3. **Vertical Placement**: The top of the `H7` side note container **MUST** begin slightly lower than the cap-height of the paragraph to which it belongs (offset by $+4\text{px}$ to $+8\text{px}$).
4. If a side note occurs near the bottom of a column where it would overflow the page bottom boundary, the engine **MUST** elevate the note vertically within available whitespace, or shift it alongside the continuation fragment in the next column.

#### 7.4 Automated "Siman" Numbering
1. When enabled, the engine **MUST** prepend an autonomous `Siman [Hebrew Letter]` line above `H2`.
2. Siman numbering **MUST** automatically increment in standard Hebrew alphanumeric format (א, ב, ג ... ק, קא) and **MUST** reset upon encountering an `H1` (Sub-Shaar/Seder).
3. The typography for `Siman` **MUST** be independently configurable from the `H2` title text (defaulting to a dedicated, smaller font).

---

### 8. Footnotes, Endnotes, Bracket Parsing, and Cross-Page Continuation

#### 8.1 Delimiters & Text Extraction
1. Square brackets `[...]` within body text **MUST** be interpreted as inline footnote anchors. The text enclosed within the brackets **MUST** be extracted and appended to the page's footnote container.
2. Line prefixes starting with `הערה - ` **MUST** be parsed as Endnotes and appended to the terminal chapter container.
3. Square brackets and prefixes **MUST NOT** appear in the rendered document body. They are raw input triggers only.
4. Footnote anchors in the body text **MUST** remain strictly `display: inline` (or `inline-block`). Line breaks immediately following a footnote index marker **ARE STRICTLY PROHIBITED**.

#### 8.2 Boundary Reservation & Layout
1. Footnote space allocation **MUST** be calculated prior to column balancing. The footnote container expands from the bottom upwards, reserving a dedicated vertical block (`footnote-container-height`).
2. The body text container **MUST** terminate cleanly above the footnote divider line without overflowing into the footnote area.
3. Successive bracket pairs (e.g., `[note 1][note 2]`) **MUST** both be extracted and indexed sequentially.

#### 8.3 Long Footnote Continuation (Clarification 7 Compliance)
1. If an extensive footnote exceeds the maximum vertical space available on the current page:
   * The footnote text **MUST** be split cleanly at a sentence or word boundary.
   * The overflowing portion **MUST** continue directly at the top of the footnote container on the subsequent page.
   * The continued portion on the next page **MUST NOT** duplicate the numeric anchor marker; it **MUST** resume as a seamless continuation paragraph.

---

### 9. Parenthetical Elements `()` and Inline Span Invariants

#### 9.1 Formatting and Font Metrics
1. Parentheses `(...)` enclosing text (e.g., citations, commentaries) **MUST** receive designated inline styling (`font-size: 85%–90%` of body font, or an alternate font-family).
2. The engine **MUST** track parenthesis scope globally to support parentheses that open in one paragraph and close in a subsequent paragraph, column, or page.

#### 9.2 Audit False-Positive Exclusions
1. Because parenthetical spans employ reduced font sizes, their inter-word spacing metrics naturally differ from standard body text.
2. The Geometry Audit engine **MUST NOT** evaluate lines containing parenthetical spans under standard body-text word-spacing thresholds, thereby preventing false-positive sparse line flags.

---

### 10. Vertical Page Underfill, Container Gaps, and Boundary Exceptions

#### 10.1 Diagnostic Boundaries
1. The engine **MUST** measure `container-gap`: the vertical whitespace between the bottom of the body text container and the top of the footnote container (or bottom margin).
2. On standard body pages, `container-gap` exceeding $1.5\text{ line-heights}$ represents a defect (**Page Underfill**).

#### 10.2 Boundary Exclusions
1. The following page classifications **ARE ABSOLUTELY EXEMPT** from underfill and container-gap defect reporting:
   * **Chapter Termination Pages**: Any page ending before an `H2`, an `H1` (Sub-Shaar), or the final document boundary.
   * **Chapter Inception Pages (`H2`)**: The upper one-third margin of an `H2` start page is intentional and exempt.
   * **Full-Page Shaar / Cover / TOC Pages**: Exempt from all body geometry metrics.

---

### 11. Empty Column Prohibition & Terminal Residual Fallback Handling

#### 11.1 Absolute Empty Column Prohibition
1. A two-column container (`block-2col`) where one column contains text and the adjacent column contains zero elements or measures $0\text{px}$ in height is a **Critical Layout Defect**.
2. The audit engine **MUST** flag any block where $h_L = 0$ while $h_R > 0$, even at the conclusion of a chapter.

#### 11.2 Terminal Residual Fallback Protocol (Clarification 6 Compliance)
When a residual text fragment at the end of a chapter consists of only 1–2 lines, making an orphan-compliant two-column split impossible, the engine **SHALL** apply the user's selected configuration option:

* **Option 1 (`full-width-fallback`)**: The residual fragment spans the full width of the page container as a single horizontal block.
* **Option 2 (`force-two-column`)**: The engine forces a two-column layout (1 line in Column R, 1 line in Column L), temporarily relaxing the orphan restriction.
* **Option 3 (`micro-adjust-absorption` — DEFAULT)**: The engine executes global vertical compression or expansion on the preceding page(s) to absorb the residual lines into the prior page or draw additional lines forward, ensuring a legal split.

---

### 12. Running Headers, Folio Numbering, and Title Splitting

#### 12.1 Recto / Verso Hierarchy
1. Torah books adhere strictly to Right-to-Left (RTL) reading order:
   * **Right Page (Odd, Recto)**: Read first.
   * **Left Page (Even, Verso)**: Read second.
2. In alternating header mode (`headers-alternating`):
   * Outer header blocks **MUST** align towards the outside of the spread (Right-aligned on Recto; Left-aligned on Verso).
   * Inner header blocks **MUST** align towards the binding gutter (Left-aligned on Recto; Right-aligned on Verso).

#### 12.2 Book Title Splitting (Clarification 5 Compliance)
1. When the Split Title toggle (`split-book-title`) is enabled:
   * The **first half** of the book title **MUST** render on the **Right Page (Recto)**.
   * The **second half** of the book title **MUST** render on the **Left Page (Verso)**.
2. Enabling Split Title **MUST** automatically override conflicting dynamic header options.

#### 12.3 Folio (Page Numbering) Rules
1. The vertical distance between the bottom of the body text container and the folio number **MUST** exactly equal the vertical distance between the running header and the top of the body text container.
2. The user **MUST** have independent controls to:
   * Specify a custom initial folio value (e.g., start numbering at 87).
   * Include or exclude specific page types (Shaar, Sub-Shaar, TOC) in the numbering count without visibly printing the folio number on those pages.

---

### 13. Graphic Ornaments & Shaar (Title Page) Themes

#### 13.1 Vector Ornaments (SVG)
1. Graphic ornaments associated with `H2` and `H3` headings **MUST** be constrained to the body flow width:
   * `H2` horizontal ornaments **MUST** dynamically match the rendered width of the heading text.
   * `H3` lateral ornaments **MUST** center vertically with the font cap-height of the `H3` text.
2. Ornaments **MUST** add their bounding dimensions to the height calculation engine before layout candidates are committed.

#### 13.2 Shaar Theme Builders
1. Shaar themes **MUST** support importing triple-SVG sets:
   * `1. Main Shaar (שער ראשי)`
   * `2. Back Shaar (שער אחורי)`
   * `3. Sub-Shaar (שער משנה)`
2. Each shaar frame **MUST** maintain draggable and resizable text bounding boxes with persistent coordinates saved per-shaar inside the theme's JSON schema.

---

### 14. Extensibility Studio: Custom Page Types & Delimiters

#### 14.1 Custom Page Definitions
1. The engine **MUST** allow importing external JSON declarations specifying custom page types (e.g., Author Foreword, Dedication, Publisher Note).
2. Custom page schemas **MUST** support:
   * Anchoring at 7 distinct document positions (`beforeAll`, `afterMainShaar`, `beforeToc`, etc.).
   * Custom background images/SVGs.
   * Up to 25 distinct text box anchor positions ($5\times 5$ vertical/horizontal grid).

#### 14.2 Relative Delimiter Triggers
1. Users **MUST** be able to define custom text styling via delimiter triggers (e.g., `<<...>>` or `$$...$$`).
2. The font size for delimiter-triggered spans **MUST** support relative Delta sizing (e.g., $-2\text{pt}$ or $85\%$ relative to the enclosing paragraph font size).

---

### 15. Typography Management & Asset Synchronization

#### 15.1 Font Synchronization
1. CSS variables and JavaScript typesetter definitions **MUST** use exact Hebrew font-family names matching `fonts.json` (e.g., `'גוטמן רש"י'`, `'פרנקריהל'`, `'וילנא'`).
2. Fallback strings containing generic English font names **MUST NOT** overwrite designated Hebrew default fonts during runtime initialization.

#### 15.2 Two-Phase Font Loading
1. To prevent layout thrashing and Flash of Unstyled Text (FOUT):
   * **Phase 1 (Immediate)**: Load all core default fonts declared in `default_settings.json`. Typesetting begins only after `document.fonts.ready` confirms Phase 1 completion.
   * **Phase 2 (Deferred)**: Load the extended font library asynchronously in the background or upon user button request.

---

### 16. User Interface Architecture & Sidebar Tabs

#### 16.1 Fixed Three-Tab Sidebar
The right sidebar **MUST** maintain a fixed width of $440\text{px}$ in a consistent light theme, containing exactly three tabs:
1. **Editor Tab (`עורך`)**: Text input textarea with full height, live page-break indicators (red lines with page numbers), and action buttons: *Update & Typeset*, *Import Text*, *Print / PDF*, *Load Extra Fonts*, *Export HTML*.
2. **Settings Tab (`הגדרות`)**: Typography controls, styles dropdown, preset manager, import/export buttons.
3. **Audit Tab (`בדיקה`)**: Diagnostic controls, *Fixed Test Text*, *Random Test Text*, *Audit Report*, and interactive block-level anomaly highlighting.

#### 16.2 Interactive Highlight & Auto-Zoom
1. Clicking any defect entry in the Audit Report **MUST** smooth-scroll the viewport directly to the affected page element and pulse-highlight the block with a severity-coded border.
2. The book preview container **MUST** automatically scale via CSS transforms to occupy $100\%$ of the remaining viewport width while preserving the exact A4 aspect ratio ($1:\sqrt{2}$).

---

### 17. Settings Manager, Presets, and Gated Retypesetting

#### 17.1 Persistence Architecture
1. All configurable parameters **MUST** reside externally in `default_settings.json`.
2. The engine **MUST** support loading pre-packaged style configurations from a `/setting_sets/` directory (e.g., `kuntres.json`, `perush.json`, `talmud.json`).
3. User settings **MUST** persist in `localStorage` across page refreshes, text imports, and preset toggles.

#### 17.2 Gated Processing (Anti-Lag Architecture)
1. Modifying values in the Settings Tab **MUST NOT** trigger continuous retypesetting on keystroke (`oninput`).
2. Retypesetting of the document body **MUST** occur exclusively when the user clicks **Update & Typeset** (`עדכן ועמד מחדש`).

---

### 18. Document Export & Cross-Environment Rendering

#### 18.1 Standalone HTML Export Fidelity
1. The exported HTML file (`rendered-document.html`) **MUST** render identically to the live application DOM without missing styles or pagination breaks.
2. Exported documents **MUST** inline all active fonts as Base64 data URIs or explicit local font references, duplicate the complete CSS custom properties root, and eliminate scroll-locking container rules (`overflow: hidden` on viewport roots).

#### 18.2 PDF Generation & Print Handlers
1. The application **MUST** bind a dedicated `window.matchMedia('print')` and `beforeprint` event handler ensuring that screen-zoom transforms are removed during PDF printing.
2. Automated screenshot PDF reports generated via headless testing (Playwright) **MUST** configure viewports of sufficient height ($\ge 1600\text{px}$) to avoid dark-border cutoff artifacts.

---

### 19. Deterministic Geometric Audit Engine & Causal Tracer

#### 19.1 Automated Audit Classifications
The Geometry Audit engine (`geometry-audit.js`) **MUST** run headlessly without human visual intervention, classifying defects into strict severities:

| Defect Code | Severity | Trigger Condition |
| :--- | :--- | :--- |
| `word-loss` | **CRITICAL** | Word count in rendered DOM $\ne$ word count in raw token stream. |
| `bracket-conversion` | **HIGH** | Square brackets `[...]` remain unparsed in body DOM. |
| `empty-column` | **HIGH** | Two-column block contains an entirely empty column ($h=0$). |
| `sparse-p-cut` | **HIGH** | Mid-paragraph cut line has inter-word spacing $> 150\%$ or char count $< 40\%$. |
| `orphan-heading` | **HIGH** | Heading element stands isolated with $<2$ lines of text beneath it. |
| `widow-orphan` | **MEDIUM** | Column boundary splits a paragraph leaving 1 line at top or bottom. |
| `imbalance` | **MEDIUM** | Height difference between Column R and Column L exceeds tolerance ($>1\text{ line}$). |
| `container-gap` | **LOW** | Whitespace between body text and footnotes $> 1.5\text{ lines}$ (excluding chapter ends). |

#### 19.2 Causal Step-by-Step Tracer
1. The engine **MUST** implement per-chapter step-by-step function checkpoints.
2. For any flagged geometric defect, the tracer **MUST** isolate:
   * The exact function execution step where the defect first materialized.
   * The delta of all layout attributes (`data-layout-*`) committed during that execution step.

---

### 20. Test Suite Generation & CI Automation

#### 20.1 Exhaustive Test Text Generation (`test-suite.js`)
1. The system **MUST** provide a standalone generator capable of outputting a comprehensive test corpus spanning $300+$ pages (`very_long_test_text.txt`).
2. The generated corpus **MUST** exhaustively combine 5 orthogonal stress axes:
   * **Axis 1 (Page Typologies)**: Standard body spreads, chapter start pages (`H2`), and spanning heading pages (`H3`).
   * **Axis 2 (Paragraph Metrics)**: Single-line paragraphs, 2-line paragraphs, and long paragraphs ($20+$ lines).
   * **Axis 3 (Heading Combinations)**: Sequences of `H4`, `H5`, and `H6` at tops, centers, and bottoms of columns.
   * **Axis 4 (Footnote Densities)**: Pages with 0 footnotes, 1–5 short footnotes, and massive footnotes spanning multiple pages.
   * **Axis 5 (Parenthetical Frequency)**: Single-line, multi-line, and cross-column parenthetical blocks `(...)`.

#### 20.2 Non-Blocking CI / GitHub Actions Workflows
1. Heavy geometric audits and regression PDF generations **MUST** execute headlessly inside GitHub Actions (`.github/workflows/issues-screenshot-pdf.yml`).
2. Test runs **MUST** guarantee $100\%$ mathematical determinism: identical input text and configuration files **MUST** generate identical line-break indexes and column-height measurements on every execution.