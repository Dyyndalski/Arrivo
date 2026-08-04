# Fonts

Self-hosted so the first paint does not wait on `fonts.googleapis.com`. The mockups
(`context/foundation/design/_shared/styles.css`) pull these over an `@import`; that is a
render-blocking request to a third-party host on every page load, which works against the PRD's
p95 "results in under a second" NFR and a primary persona on slow devices.

## Licensing

Both families are under the SIL Open Font License 1.1. Self-hosting is redistribution, so the
licence text and copyright notice must travel with the files:

- `OFL-Inter.txt` — Copyright (c) 2016 The Inter Project Authors
- `OFL-Fraunces.txt` — Copyright 2018 The Fraunces Project Authors

Both are the verbatim texts published by each project. Their bodies differ only cosmetically
(whitespace, `&` vs `AND`), so both are shipped as delivered rather than merged into one file.

## What is here

Variable `woff2`, two subsets per family:

| File | Family | Subset | Axes |
| --- | --- | --- | --- |
| `inter-latin.woff2` | Inter | latin | `wght` 400–800 |
| `inter-latin-ext.woff2` | Inter | latin-ext | `wght` 400–800 |
| `fraunces-latin.woff2` | Fraunces | latin | `wght` 500–600, `opsz` |
| `fraunces-latin-ext.woff2` | Fraunces | latin-ext | `wght` 500–600, `opsz` |

**`latin-ext` is not optional.** Polish diacritics — ą ć ę ł ń ś ź ż — live in `U+0100-02BA`. A
`latin`-only subset renders "Śródmieście" and "Żoliborz" with fallback glyphs.

## Regenerating

Fetch the CSS with a modern browser UA (an old UA gets `ttf` instead of `woff2`), then download
the `latin` and `latin-ext` URLs it lists:

```
curl -A "<modern browser UA>" \
  "https://fonts.googleapis.com/css2?family=Inter:wght@400..800&family=Fraunces:opsz,wght@9..144,500..600&display=swap"
```

The `unicode-range` values in the `@font-face` blocks in `src/styles/global.css` are copied
verbatim from that response and must be updated together with the files.
