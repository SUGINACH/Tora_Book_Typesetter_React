# מטריצת ההגדרות — מרשם מלא מהמלאי הנעול (שלב 30)

**מקור:** SUGINACH/Tora_Book_Typesetter_Orange@93ad1e5704405fb2806a126ea1b519a35a87f378 · default_settings.json (SHA-256 576dc778869eb373…) + שלושה פריסטים + LAYOUT_DEPENDENCY_MAP.md.
**היקף:** 257 מפתחות — 236 משפיעי פריסה, 21 UI-only (אינם נכנסים ל־EffectiveSettings/configHash).
**כללי סיווג:** (א) UI-only = קלט משתמש חולף/מצב עורך בלבד (inp-*, style-set-select, active-theme-select, enable-shaar-box-editor); (ב) כל השאר affectsLayout=true מעקרון הזהירות — היעדר מ-configHash גורם להחמצת שינוי פריסה, תיוג שווא רק מרעיש; (ג) טיפוס/enum נגזרים מתחומי הערכים שנצפתו (default+פריסטים) — ערך שלא נצפה נדחה בפירוש (path+קוד), אינו מוחלף בשקט; (ד) drop-word-mode:"window" נשמר כערך legacy חוקי — אין המרה אוטומטית.

| מפתח legacy | טיפוס | ברירת מחדל (מקור) | enum | יחידה | affectsLayout | consumer | מדור UI |
|---|---|---|---|---|---|---|---|
| `cbg-h0Open-color` | color | "#f4f1e8" | — | — | ✓ | engine | backgrounds/text |
| `cbg-h0Open-mode` | enum | "none" | `none` | — | ✓ | engine | backgrounds/select |
| `cbg-h0Open-opacity` | number | "15" | — | — | ✓ | engine | backgrounds/text |
| `cbg-h2Open-color` | color | "#f4f1e8" | — | — | ✓ | engine | backgrounds/text |
| `cbg-h2Open-mode` | enum | "none" | `none` | — | ✓ | engine | backgrounds/select |
| `cbg-h2Open-opacity` | number | "15" | — | — | ✓ | engine | backgrounds/text |
| `cbg-regular-color` | color | "#f4f1e8" | — | — | ✓ | engine | backgrounds/text |
| `cbg-regular-mode` | enum | "none" | `none` | — | ✓ | engine | backgrounds/select |
| `cbg-regular-opacity` | number | "15" | — | — | ✓ | engine | backgrounds/text |
| `data-cbg-h0Open-img` | string | "" | — | — | ✓ | engine | backgrounds/text |
| `data-cbg-h2Open-img` | string | "" | — | — | ✓ | engine | backgrounds/text |
| `data-cbg-regular-img` | string | "" | — | — | ✓ | engine | backgrounds/text |
| `auto-dh` | boolean | false | — | — | ✓ | engine | body/checkbox |
| `avoid-orphans` | boolean | true | — | — | ✓ | engine | body/checkbox |
| `avoid-runt-word` | boolean | true | — | — | ✓ | engine | body/checkbox |
| `avoid-widows` | boolean | true | — | — | ✓ | engine | body/checkbox |
| `body-last-line-align` | enum | "center" | `center`, `right` | — | ✓ | engine | body/select |
| `drop-word-count` | number | "1" | — | — | ✓ | engine | body/text |
| `drop-word-min-lines` | number | "2" | — | — | ✓ | engine | body/text |
| `drop-word-mode` | enum | "window" | `none`, `window` | — | ✓ | engine | body/select |
| `line-height-body` | number | "1.34" | — | — | ✓ | engine | body/text |
| `inp-book-author` | string | "הצעיר ידידיה בר אבא הלוי" | — | — | — | ui-only | book-meta/text |
| `inp-book-back-contact` | string | "052-7666666" | — | — | — | ui-only | book-meta/text |
| `inp-book-back-copyright` | string | "כל הזכויות הפקר" | — | — | — | ui-only | book-meta/text |
| `inp-book-back-extra` | string | "אין לסמוך על האמור להלכה" | — | — | — | ui-only | book-meta/text |
| `inp-book-back-publishing` | string | "הוצאת זוכמיר בע\"מ" | — | — | — | ui-only | book-meta/text |
| `inp-book-desc` | string | "בירור שיטות הראשונים והאחרונים ובירורי הלכות למעשה" | — | — | — | ui-only | book-meta/text |
| `inp-book-sections` | string | "מהדורה שניה ומורחבת בסייעתא דשמיא" | — | — | — | ui-only | book-meta/text |
| `inp-book-subtitle` | string | "ביאורים וחידושים עמוקים על מסכתות הש\"ס" | — | — | — | ui-only | book-meta/text |
| `inp-book-title` | string | "ספר מלכי המלוכה" | — | — | — | ui-only | book-meta/text |
| `inp-book-year` | string | "ירושלים עיה\"ק תובב\"א שנת ה'תשפ\"ו" | — | — | — | ui-only | book-meta/text |
| `style-set-select` | string | "" | — | — | — | ui-only | book-meta/text |
| `page-num-format` | enum | "gematria" | `gematria` | — | ✓ | engine | folio/select |
| `page-num-frame` | enum | "none" | `none` | — | ✓ | engine | folio/select |
| `page-num-initial-value` | number | "1" | — | — | ✓ | engine | folio/text |
| `page-num-position` | enum | "bottom_center" | `bottom_center`, `bottom_outer` | — | ✓ | engine | folio/select |
| `page-num-start-idx` | number | "1" | — | — | ✓ | engine | folio/text |
| `f-dh` | font-stack | "'AlphaBlack', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-dtoc-1` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-dtoc-2` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-dtoc-3` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-dtoc-4` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-dtoc-5` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-dtoc-6` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-dtoc-7` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-gtoc-1` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-gtoc-2` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-gtoc-3` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-gtoc-4` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-gtoc-5` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-gtoc-6` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-gtoc-7` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-h0` | font-stack | "'AlphaBlack', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-h0-body` | font-stack | "'Frank Ruhl Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-h1` | font-stack | "'Lia Sgula', 'Bellefair', serif" | — | — | ✓ | engine | fonts/text |
| `f-h2` | font-stack | "'AlphaBlack', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-h3` | font-stack | "'Alpha', 'Noto Serif Hebrew', serif" | — | — | ✓ | engine | fonts/text |
| `f-h4` | font-stack | "'Alpha', 'Frank Ruhl Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-h5` | font-stack | "'AlphaLight', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-h6` | font-stack | "'Noto Serif Hebrew', serif" | — | — | ✓ | engine | fonts/text |
| `f-h7` | font-stack | "'Hadassah Friedlaender', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-hdr-c` | font-stack | "'Livorna', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-hdr-l` | font-stack | "'Livorna', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-hdr-r` | font-stack | "'Livorna', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-hdr-verso-c` | font-stack | "'Livorna', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-hdr-verso-l` | font-stack | "'Livorna', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-hdr-verso-r` | font-stack | "'Livorna', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-paren` | font-stack | "" | — | — | ✓ | engine | fonts/text |
| `f-sh-author` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-sh-desc` | font-stack | "'Livorna', 'Frank Ruhl Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-sh-sec` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-sh-sub` | font-stack | "'Livorna', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-sh-title` | font-stack | "'Lia Sgula', 'Bellefair', serif" | — | — | ✓ | engine | fonts/text |
| `f-sh-year` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `f-siman` | font-stack | "'AlphaBlack', 'David Libre', serif" | — | — | ✓ | engine | fonts/text |
| `font-body` | font-stack | "'Guttman Rashi', 'Frank Ruhl Libre', serif" | — | — | ✓ | engine | fonts/text |
| `font-first-word` | font-stack | "'FrankReal', 'Frank Ruhl Libre', serif" | — | — | ✓ | engine | fonts/text |
| `s-h0` | number | "26" | — | — | ✓ | engine | fonts/text |
| `s-h0-body` | number | "11.5" | — | — | ✓ | engine | fonts/text |
| `s-h1` | number | "50" | — | — | ✓ | engine | fonts/text |
| `s-h2` | number | "17" | — | — | ✓ | engine | fonts/text |
| `s-h3` | number | "13.5" | — | — | ✓ | engine | fonts/text |
| `s-h4` | number | "12.5" | — | — | ✓ | engine | fonts/text |
| `s-h5` | number | "11.5" | — | — | ✓ | engine | fonts/text |
| `s-h6` | number | "10.5" | — | — | ✓ | engine | fonts/text |
| `s-h7` | number | "6" | — | — | ✓ | engine | fonts/text |
| `s-hdr-c` | number | "11" | — | — | ✓ | engine | fonts/text |
| `s-hdr-l` | number | "15" | — | — | ✓ | engine | fonts/text |
| `s-hdr-r` | number | "15" | — | — | ✓ | engine | fonts/text |
| `s-hdr-verso-c` | number | "11" | — | — | ✓ | engine | fonts/text |
| `s-hdr-verso-l` | number | "15" | — | — | ✓ | engine | fonts/text |
| `s-hdr-verso-r` | number | "15" | — | — | ✓ | engine | fonts/text |
| `s-paren` | number | "-2" | — | — | ✓ | engine | fonts/text |
| `s-paren-mode` | enum | "relative" | `relative` | — | ✓ | engine | fonts/select |
| `s-sh-author` | number | "15" | — | — | ✓ | engine | fonts/text |
| `s-sh-desc` | number | "12" | — | — | ✓ | engine | fonts/text |
| `s-sh-sec` | number | "11.5" | — | — | ✓ | engine | fonts/text |
| `s-sh-sub` | number | "21" | — | — | ✓ | engine | fonts/text |
| `s-sh-title` | number | "46" | — | — | ✓ | engine | fonts/text |
| `s-sh-year` | number | "12" | — | — | ✓ | engine | fonts/text |
| `s-siman` | number | "20" | — | — | ✓ | engine | fonts/text |
| `size-body` | number | "12" | — | — | ✓ | engine | fonts/text |
| `size-first-word` | number | "1.5" | — | — | ✓ | engine | fonts/text |
| `prop-col` | number | "40" | — | — | ✓ | engine | grid/text |
| `prop-gap` | number | "2" | — | — | ✓ | engine | grid/text |
| `prop-gutter` | number | "2" | — | — | ✓ | engine | grid/text |
| `prop-margin` | number | "7.5" | — | — | ✓ | engine | grid/text |
| `prop-mb` | number | "20" | — | — | ✓ | engine | grid/text |
| `prop-mt` | number | "20" | — | — | ✓ | engine | grid/text |
| `prop-mt-h2` | number | "20" | — | — | ✓ | engine | grid/text |
| `h2-auto-siman` | boolean | true | — | — | ✓ | engine | headings/checkbox |
| `h2-orn-fit-text` | boolean | false | — | — | ✓ | engine | headings/checkbox |
| `h2-orn-scope` | enum | "both" | `both` | — | ✓ | engine | headings/select |
| `h2-ornament-bottom-style` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h2-ornament-set` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h2-ornament-top-style` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h2-reset-siman` | boolean | true | — | — | ✓ | engine | headings/checkbox |
| `h2-title-orn-mode` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h2-title-ornament-bottom-style` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h2-title-ornament-l` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h2-title-ornament-r` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h2-title-ornament-top-style` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h2-top-distance` | dimension | "22%" | — | % | ✓ | engine | headings/text |
| `h3-ornament-l` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h3-ornament-r` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `h3-ornament-set` | enum | "none" | `none` | — | ✓ | engine | headings/select |
| `mode-h0` | enum | "new_page_1col" | `new_page_1col` | — | ✓ | engine | headings/select |
| `mode-h1` | enum | "sub_shaar" | `sub_shaar` | — | ✓ | engine | headings/select |
| `mode-h2` | enum | "new_page_1col" | `new_page_1col` | — | ✓ | engine | headings/select |
| `mode-h3` | enum | "span_1col" | `span_1col` | — | ✓ | engine | headings/select |
| `mode-h4` | enum | "inline_2col" | `inline_2col` | — | ✓ | engine | headings/select |
| `mode-h5` | enum | "inline_2col" | `inline_2col` | — | ✓ | engine | headings/select |
| `mode-h6` | enum | "inline_2col" | `inline_2col` | — | ✓ | engine | headings/select |
| `mode-h7` | enum | "side_note" | `side_note` | — | ✓ | engine | headings/select |
| `odd-h0` | boolean | true | — | — | ✓ | engine | headings/checkbox |
| `odd-h1` | boolean | true | — | — | ✓ | engine | headings/checkbox |
| `odd-h2` | boolean | false | — | — | ✓ | engine | headings/checkbox |
| `active-theme-select` | enum | "json_theme_40" | `builtin_1`, `json_theme_40` | — | — | ui-only | misc/select |
| `assets-folder-input` | string | "" | — | — | ✓ | engine | misc/text |
| `col-divider-style` | enum | "none" | `none` | — | ✓ | engine | misc/select |
| `data-hdr-c-img` | string | "" | — | — | ✓ | engine | misc/text |
| `data-sec-div-img` | string | "" | — | — | ✓ | engine | misc/text |
| `file-builder-back-svg` | string | "" | — | — | — | ui-only | misc/text |
| `file-builder-main-svg` | string | "" | — | — | — | ui-only | misc/text |
| `file-builder-sub-svg` | string | "" | — | — | — | ui-only | misc/text |
| `file-cbg-h0Open-img` | string | "" | — | — | — | ui-only | misc/text |
| `file-cbg-h2Open-img` | string | "" | — | — | — | ui-only | misc/text |
| `file-cbg-regular-img` | string | "" | — | — | — | ui-only | misc/text |
| `file-hdr-c-img` | string | "" | — | — | — | ui-only | misc/text |
| `file-sec-div-img` | string | "" | — | — | — | ui-only | misc/text |
| `section-divider-style` | enum | "spear" | `spear` | — | ✓ | engine | misc/select |
| `en-line-prefix` | enum | "הערת סיום -" | `הערת סיום -` | — | ✓ | engine | notes/select |
| `f-note-body` | font-stack | "'Frank Ruhl Libre', serif" | — | — | ✓ | engine | notes/text |
| `f-note-title` | font-stack | "'David Libre', serif" | — | — | ✓ | engine | notes/text |
| `fn-columns` | number | "1" | — | — | ✓ | engine | notes/text |
| `fn-delim-close` | enum | "]" | `]` | — | ✓ | engine | notes/select |
| `fn-delim-open` | enum | "[" | `[` | — | ✓ | engine | notes/select |
| `fn-layout-mode` | enum | "block" | `block` | — | ✓ | engine | notes/select |
| `fn-reset-mode` | enum | "page" | `page` | — | ✓ | engine | notes/select |
| `fn-title-text` | string | "" | — | — | ✓ | engine | notes/text |
| `note-header-orn-l` | enum | "none" | `none` | — | ✓ | engine | notes/select |
| `note-header-orn-r` | enum | "none" | `none` | — | ✓ | engine | notes/select |
| `note-listing-num-size` | number | "8" | — | — | ✓ | engine | notes/text |
| `note-marker-size` | number | "8" | — | — | ✓ | engine | notes/text |
| `note-marker-type` | enum | "super" | `super` | — | ✓ | engine | notes/select |
| `note-num-separator` | enum | "." | `.` | — | ✓ | engine | notes/select |
| `note-numbering-style` | enum | "gematria" | `gematria` | — | ✓ | engine | notes/select |
| `note-rule-style` | enum | "star" | `plain`, `star` | — | ✓ | engine | notes/select |
| `s-note-body` | number | "9" | — | — | ✓ | engine | notes/text |
| `s-note-title` | number | "9" | — | — | ✓ | engine | notes/text |
| `dim-h2-btm-h` | dimension | "1.25em" | — | em | ✓ | engine | ornaments/text |
| `dim-h2-btm-w` | dimension | "65%" | — | % | ✓ | engine | ornaments/text |
| `dim-h2-title-side-h` | dimension | "1.1em" | — | em | ✓ | engine | ornaments/text |
| `dim-h2-title-side-w` | dimension | "20px" | — | px | ✓ | engine | ornaments/text |
| `dim-h2-top-h` | dimension | "1.25em" | — | em | ✓ | engine | ornaments/text |
| `dim-h2-top-w` | dimension | "65%" | — | % | ✓ | engine | ornaments/text |
| `dim-h3-side-h` | dimension | "1em" | — | em | ✓ | engine | ornaments/text |
| `dim-h3-side-w` | dimension | "50px" | — | px | ✓ | engine | ornaments/text |
| `dim-note-side-h` | dimension | "0.9em" | — | em | ✓ | engine | ornaments/text |
| `dim-note-side-w` | dimension | "40px" | — | px | ✓ | engine | ornaments/text |
| `dim-secdiv-h` | dimension | "28px" | — | px | ✓ | engine | ornaments/text |
| `dim-secdiv-w` | dimension | "50%" | — | % | ✓ | engine | ornaments/text |
| `hdr-alternating` | boolean | false | — | — | ✓ | engine | running-headers/checkbox |
| `hdr-c-align` | enum | "center" | `center` | — | ✓ | engine | running-headers/select |
| `hdr-c-custom` | string | "" | — | — | ✓ | engine | running-headers/text |
| `hdr-c-type` | enum | "h2_without_siman" | `h2_without_siman`, `spear` | — | ✓ | engine | running-headers/select |
| `hdr-distinct-even-odd` | boolean | true | — | — | ✓ | engine | running-headers/checkbox |
| `hdr-divider-style` | enum | "gray" | `gray` | — | ✓ | engine | running-headers/select |
| `hdr-h1-title-mode` | enum | "full" | `full` | — | ✓ | engine | running-headers/select |
| `hdr-l-align` | enum | "center" | `center`, `left` | — | ✓ | engine | running-headers/select |
| `hdr-l-custom` | string | "" | — | — | ✓ | engine | running-headers/text |
| `hdr-l-type` | enum | "book_title_split_l" | `book_title_split_l`, `h2` | — | ✓ | engine | running-headers/select |
| `hdr-r-align` | enum | "center" | `center`, `right` | — | ✓ | engine | running-headers/select |
| `hdr-r-custom` | string | "" | — | — | ✓ | engine | running-headers/text |
| `hdr-r-type` | enum | "book_title_split_r" | `book_title_split_r`, `h1` | — | ✓ | engine | running-headers/select |
| `hdr-title-split` | boolean | false | — | — | ✓ | engine | running-headers/checkbox |
| `hdr-verso-c-align` | enum | "center" | `center` | — | ✓ | engine | running-headers/select |
| `hdr-verso-c-custom` | string | "" | — | — | ✓ | engine | running-headers/text |
| `hdr-verso-c-type` | enum | "h1" | `h1`, `same_as_odd` | — | ✓ | engine | running-headers/select |
| `hdr-verso-l-align` | enum | "center" | `center`, `left` | — | ✓ | engine | running-headers/select |
| `hdr-verso-l-custom` | string | "" | — | — | ✓ | engine | running-headers/text |
| `hdr-verso-l-type` | enum | "book_title_split_l" | `book_title_split_l`, `same_as_odd` | — | ✓ | engine | running-headers/select |
| `hdr-verso-r-align` | enum | "center" | `center`, `right` | — | ✓ | engine | running-headers/select |
| `hdr-verso-r-custom` | string | "" | — | — | ✓ | engine | running-headers/text |
| `hdr-verso-r-type` | enum | "book_title_split_r" | `book_title_split_r`, `same_as_odd` | — | ✓ | engine | running-headers/select |
| `hdr-w-c` | dimension | "33.34%" | — | % | ✓ | engine | running-headers/text |
| `hdr-w-l` | dimension | "33.33%" | — | % | ✓ | engine | running-headers/text |
| `hdr-w-r` | dimension | "33.33%" | — | % | ✓ | engine | running-headers/text |
| `back-shaar-count-numbering` | boolean | false | — | — | ✓ | engine | shaar/checkbox |
| `back-shaar-show-number` | boolean | false | — | — | ✓ | engine | shaar/checkbox |
| `builder-back-bottom` | number | "18" | — | — | ✓ | engine | shaar/text |
| `builder-back-left` | number | "95" | — | — | ✓ | engine | shaar/text |
| `builder-back-right` | number | "15" | — | — | ✓ | engine | shaar/text |
| `builder-back-top` | number | "22" | — | — | ✓ | engine | shaar/text |
| `builder-main-bottom` | number | "16" | — | — | ✓ | engine | shaar/text |
| `builder-main-left` | number | "15" | — | — | ✓ | engine | shaar/text |
| `builder-main-right` | number | "15" | — | — | ✓ | engine | shaar/text |
| `builder-main-top` | number | "20" | — | — | ✓ | engine | shaar/text |
| `builder-sub-bottom` | number | "20" | — | — | ✓ | engine | shaar/text |
| `builder-sub-left` | number | "15" | — | — | ✓ | engine | shaar/text |
| `builder-sub-right` | number | "95" | — | — | ✓ | engine | shaar/text |
| `builder-sub-top` | number | "20" | — | — | ✓ | engine | shaar/text |
| `builder-theme-name` | string | "" | — | — | ✓ | engine | shaar/text |
| `data-builder-back-svg` | string | "" | — | — | ✓ | engine | shaar/text |
| `data-builder-main-svg` | string | "" | — | — | ✓ | engine | shaar/text |
| `data-builder-sub-svg` | string | "" | — | — | ✓ | engine | shaar/text |
| `enable-shaar-box-editor` | boolean | true | — | — | — | ui-only | shaar/checkbox |
| `main-shaar-count-numbering` | boolean | false | — | — | ✓ | engine | shaar/checkbox |
| `main-shaar-show-number` | boolean | false | — | — | ✓ | engine | shaar/checkbox |
| `select-shaar-back` | enum | "theme_default" | `theme_default` | — | ✓ | engine | shaar/select |
| `select-shaar-main` | enum | "theme_default" | `theme_default` | — | ✓ | engine | shaar/select |
| `select-shaar-sub` | enum | "theme_default" | `theme_default` | — | ✓ | engine | shaar/select |
| `show-back-shaar` | boolean | true | — | — | ✓ | engine | shaar/checkbox |
| `show-main-shaar` | boolean | true | — | — | ✓ | engine | shaar/checkbox |
| `show-sub-shaar` | boolean | true | — | — | ✓ | engine | shaar/checkbox |
| `sub-shaar-count-numbering` | boolean | true | — | — | ✓ | engine | shaar/checkbox |
| `sub-shaar-show-number` | boolean | false | — | — | ✓ | engine | shaar/checkbox |
| `detailed-toc-count-numbering` | boolean | true | — | — | ✓ | engine | toc/checkbox |
| `detailed-toc-show-numbering` | boolean | true | — | — | ✓ | engine | toc/checkbox |
| `enable-detailed-toc` | boolean | true | — | — | ✓ | engine | toc/checkbox |
| `enable-general-toc` | boolean | true | — | — | ✓ | engine | toc/checkbox |
| `general-toc-count-numbering` | boolean | true | — | — | ✓ | engine | toc/checkbox |
| `general-toc-show-numbering` | boolean | true | — | — | ✓ | engine | toc/checkbox |
| `s-dtoc-1` | number | "12" | — | — | ✓ | engine | toc/text |
| `s-dtoc-2` | number | "11" | — | — | ✓ | engine | toc/text |
| `s-dtoc-3` | number | "10.5" | — | — | ✓ | engine | toc/text |
| `s-dtoc-4` | number | "10.5" | — | — | ✓ | engine | toc/text |
| `s-dtoc-5` | number | "10.5" | — | — | ✓ | engine | toc/text |
| `s-dtoc-6` | number | "10.5" | — | — | ✓ | engine | toc/text |
| `s-dtoc-7` | number | "8.8" | — | — | ✓ | engine | toc/text |
| `s-gtoc-1` | number | "12" | — | — | ✓ | engine | toc/text |
| `s-gtoc-2` | number | "11" | — | — | ✓ | engine | toc/text |
| `s-gtoc-3` | number | "10.5" | — | — | ✓ | engine | toc/text |
| `s-gtoc-4` | number | "10.5" | — | — | ✓ | engine | toc/text |
| `s-gtoc-5` | number | "10.5" | — | — | ✓ | engine | toc/text |
| `s-gtoc-6` | number | "10.5" | — | — | ✓ | engine | toc/text |
| `s-gtoc-7` | number | "8.8" | — | — | ✓ | engine | toc/text |

## החלטות זניחה/מיפוי

- אין מפתח שנזנח בשלב זה: כל 248 המפתחות מיובאים או נדחים בפירוש (path+קוד).
- מיפוי שאינו זהה בשם או בטיפוס יינעל כאן כשיידרש — עד אז canonicalKey === legacyKey.
