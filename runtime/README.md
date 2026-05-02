# Runtime

This directory contains runtime pieces that travel with the standalone client.

- `electron/`: minimal Electron shell for launching the client as a desktop app.
- `local-server.cjs`: local browser runtime with a writable `/api/kb` database endpoint.
- Future parser runtimes should live under `parsers/` or `bin/`.

The desktop shell keeps the writable knowledge database under:

```text
../database/kb.json
```

The browser fallback remains:

```text
../database/kb.js
```

For browser-based development, start the writable local service from `client/desktop`:

```text
node runtime/local-server.cjs
```

Then open:

```text
http://127.0.0.1:5178/
```
