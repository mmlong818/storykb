# Story KB Electron Runtime

This is the minimal desktop shell for the portable client.

## Run

From this directory:

```powershell
npm install
npm start
```

The shell loads `../../index.html` and exposes `window.storyKb` to the renderer.

## Local Database

The runtime reads and writes:

```text
../../database/kb.json
../../database/manifest.json
```

That means the `client/desktop` folder can travel as a single application bundle with its database.
