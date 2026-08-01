# d2p

## Control panel and local config

Run the bot with:

```bash
npm run dev
```

Then open `http://localhost:8080` to use the web control panel.

The control panel is a Preact app served by the diagnostics server and can:

1. Show runtime bot status and recent events.
2. Save basic setup into a local `d2p.config.json` file (Discord token, server id, diagnostics port, printer name).

The browser app source lives in `src/web/app.tsx` and is bundled on-demand by the server using the esbuild API.

`d2p.config.json` is gitignored because it can contain secrets.