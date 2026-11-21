# Quill

Handwritten notes on a drawing tablet. Claude reads the ink, and Quill saves the
transcription to Lifeline. Electron + Vite + React + TypeScript, with a tldraw canvas.

## Run

```
npm install      # postinstall fetches the Electron binary
npm run dev      # the app, with hot reload
npm run check    # typecheck + build
```

## Where notes live

Pages autosave (400 ms after the last change, and again before the window closes) to
`%APPDATA%\quill\pages\`:

- `index.json` — page names and the page that was open last
- `<id>.json` — that page's ink (a tldraw document snapshot)
- `trash\<id>.json` — deleted pages, kept in case of a slip

## Status

- [x] Step 1: canvas, pen pressure, autosave, page list
- [ ] Step 2: Read handwriting with Claude (main process holds the key)
- [ ] Step 3: Save to Lifeline

`npm run dev` has tldraw fully unlocked. A packaged production build will need a tldraw
license key (a free hobby key is fine).
