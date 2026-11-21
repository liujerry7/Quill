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
- `<id>.md` — that page's transcript
- `trash\<id>.json` — deleted pages, kept in case of a slip

## Lifeline

Quill is an MCP client of Lifeline's own `/mcp` endpoint (no Lifeline changes). Put
`LIFELINE_URL` and `LIFELINE_TOKEN` in `.env` (Settings ▸ AI access in Lifeline gives both;
the token needs read-and-write). Then:

- **Folders are Lifeline projects.** The menu at the top of the sidebar picks how they're
  arranged: **By goal** is Lifeline's project tree (in-progress and up-next projects, and any
  project holding Quill pages), and each of your Lifeline filters ("By product", "By role"…)
  shows its folders with the projects filed in them. Projects with Quill pages that a filter
  doesn't place appear under "Not in …". Search finds any project. Pages from before this are
  in **Unfiled**. Projects and filters are cached, so folders still show offline.
- **Context:** on launch Quill opens the project whose clock is running in Lifeline.
- **Docs:** a folder lists its Lifeline docs; clicking one shows it read-only.
- **Save to Lifeline** makes a doc from the page's transcript in the page's project, and
  later saves update that same doc. If the doc was edited in Lifeline since, Quill asks
  before replacing it. (Lifeline has no uploads, so the ink stays local.)

## Testing

Point a test run at a scratch data folder so it never touches real notes:
`QUILL_USER_DATA=<some temp dir> npm run dev`.

## Status

- [x] Step 1: canvas, pen pressure, autosave, page list
- [x] Step 2: Read handwriting with Claude (main process holds the key)
- [x] Step 3: Lifeline projects as folders, docs view, Save to Lifeline

`npm run dev` has tldraw fully unlocked. A packaged production build will need a tldraw
license key (a free hobby key is fine).
