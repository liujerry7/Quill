# Quill

Handwritten notes on a drawing tablet. Claude reads the ink, and Quill saves the
transcription to Lifeline. Electron + Vite + React + TypeScript, with a tldraw canvas.

## Install

Download `Quill-Setup-<version>.exe` from the latest
[release](https://github.com/liujerry7/Quill/releases/latest) and run it. Windows may warn about
an unknown publisher the first time, since the installer isn't code-signed: choose "More info",
then "Run anyway".

On first launch Quill asks for its keys: **Open .env** opens `%APPDATA%\quill\.env`; fill it in,
save, and press **Restart**.

**Updates are automatic.** Every push to `main` builds a new release (GitHub Actions,
`.github/workflows/release.yml`). When Quill opens it checks for one, downloads it in the
background and offers **Restart to update**; ignore that and it installs the next time Quill quits.

## Develop

```
npm install      # postinstall fetches the Electron binary
npm run dev      # the app, with hot reload; keys come from this folder's .env
npm run check    # typecheck + build
npm run dist     # build the installer locally into dist/ (publishes nothing)
```

Only one Quill runs per data folder, so with the installed app open, `npm run dev` just brings
it to the front. Close it first (or use `QUILL_USER_DATA`, below) to run from source.

## Where notes live

Pages autosave (400 ms after the last change, and again before the window closes) to
`%APPDATA%\quill\pages\`:

- `index.json` — page names and the page that was open last
- `<id>.json` — that page's ink (a tldraw document snapshot)
- `<id>.md` — that page's transcript
- `trash\<id>.json` — deleted pages, kept in case of a slip

Markdown files can sit in a folder beside pages (**+ Markdown file**, or drop `.md` files onto the
window). They're labelled **MD** and open read-only in the content window, read fresh from disk
each time. Quill only remembers where they are (`%APPDATA%\quill\markdown.json`); removing one
from Quill leaves the file alone.

## Lifeline

Quill is an MCP client of Lifeline's own `/mcp` endpoint (no Lifeline changes). Put
`LIFELINE_URL` and `LIFELINE_TOKEN` in Quill's `.env` (Settings ▸ AI access in Lifeline gives both;
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
- [x] Windows installer with automatic updates from GitHub Releases

`npm run dev` has tldraw fully unlocked. Release builds read a tldraw license key (a free hobby
key is fine) from the `TLDRAW_LICENSE_KEY` repository secret; without one the canvas runs
unlicensed.
