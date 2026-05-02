# Story KB Local Database

This directory is part of the portable desktop client bundle.

- `kb.js`: browser-safe bundled knowledge base fallback.
- `kb.json`: desktop-runtime writable knowledge base.
- `kb.local-only.json`: baseline rebuilt from only the three user-provided documents.
- `manifest.json`: schema and database statistics.
- `rebuild-database.mjs`: rebuilds the database in two phases: local documents first, curated external references second.
- `sources/`: reserved for source files copied into the client package.
- `indexes/`: reserved for search/vector/full-text indexes.

In the static browser prototype, newly imported content is also mirrored into browser session storage. In the desktop runtime, `window.storyKb` reads and writes `kb.json` directly.

Current build policy:

1. Remove prototype/sample state.
2. Build the local-only baseline from the three user documents.
3. Reintroduce curated external references using the current extraction templates.
4. Write both `kb.json` and `kb.js` from the rebuilt result.
