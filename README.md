# Tora Book Typesetter (React)

Torah book typesetting system — TypeScript + React + Vite.

## Features

- Hebrew RTL text typesetting
- Two-column layout with column balancing
- Heading hierarchy (H0-H7)
- Footnotes with nested bracket support
- Endnotes and side notes
- Custom text styles (linePrefix, inlineMarker)
- Page numbering in Hebrew gematria
- Running headers (recto/verso alternating)
- Settings persistence (localStorage)
- Deterministic output (FNV-1a hash)

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build

```bash
npm run build
```

Output in `dist/`.

## Test

```bash
npm test
```

## Architecture

See `אפיון_טכני_מערכת_עימוד_תורני.md` for the full technical specification.

### Key principles

- **Pure Functions** — typesetting engine is side-effect-free
- **Referential Transparency** — same input always produces same output
- **Deterministic** — FNV-1a hash verification
- **Typed Settings** — all settings in a TypeScript interface (no magic strings)
- **Text Integrity is Sacred** — never modify, shorten, or join source text
