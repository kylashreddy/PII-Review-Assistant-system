# Evaratus Review — PII Review System

A desktop app that checks PII redaction **by reading the screen**. Put the original and the redacted
document side by side in any app or website, draw a box around each, and the app shows what still needs fixing.

It uses the same checks as the [PII Review Assistant](https://github.com/kylashreddy/PII-Review-Assistant-Extension)
Chrome extension. Everything runs on your computer; nothing is sent anywhere.

## How it works

1. **Select documents** — drag a box around the original, then around the redacted work.
2. The app reads both boxes with the computer's own text recognition (Apple Vision on Mac).
3. Labels on the redacted document are recognised by their highlight colour.
4. Findings are listed in the window and marked on the documents with black boxes.

| Mode | What it checks |
|---|---|
| **L1 · Identify** | Is all the PII in the original labeled? |
| **L2 · Verify** | Is it redacted correctly — leaks, partial redactions, wrong or inconsistent replacements, over-scrubbing? |

## Setup (Mac)

You need **Node.js 22+** and Apple's command line tools (`xcode-select --install`).

```bash
git clone https://github.com/kylashreddy/PII-Review-Assistant-system.git
cd PII-Review-Assistant-system
npm install
npm start
```

The first time, macOS asks for **Screen Recording** permission: System Settings → Privacy & Security →
Screen Recording → turn on **Electron**, then run `npm start` again.

## Using it

- **Scroll through both documents.** Each read is added to what was read before, so the app builds up the
  whole document (labels included) and compares everything — not only what is on screen.
- It compares only the part read on **both** sides. If one side is behind, it tells you which document to scroll.
- Reads where the task is hidden (another window in front) are ignored; the last result stays.
- Press **New task** when you move to the next task (a new task is also noticed automatically after a few reads).
- **Live** re-reads the documents when they change.
- **Marks** shows or hides the boxes on the documents. Click a finding to make its box pulse.
- Answer each finding with the two buttons; the dashed one is the app's suggestion. **Details** shows why.
- A highlight colour the app doesn't know appears under **Teach label colours** — pick its label once.

## Layout differences

The redacted document is often re-made, so its layout differs from the original. The app handles:

- **Blocks in another order** — the redacted lines are put in the original's order before comparing
  (each line next to its counterpart; replaced values travel with the line before them).
- **Lines wrapped or split differently** — text found elsewhere on the other side counts as moved, not missing.
- **Panes that scroll together** — "Read whole document" notices it and scrolls only once per page.
- **Blank stretches, page gaps, repeated bullets** — reads with too little text are skipped; repeated
  lines are placed by their neighbours.
- **Fast scrolling** — a read that does not overlap the previous one is kept as its own piece and joined
  up later, so nothing is lost. A new task is noticed from the file name in the pane header.

## Not over-detecting

Tested on a real review task (a screen recording, scrolled through end to end). Not reported, because
they are not PII problems: text the new layout moved or split, words OCR reads slightly differently
("APIs" / "APls", "CAREERHIGHLIGHTS" / "CAREER HIGHLIGHTS"), sentences paired with unrelated text by a
layout change, unreadable OCR lines and half-visible lines at the pane edges, and software products
such as "Visual Studio". Labels drawn as an underline (Overscrubbed) are recognised as well as filled ones.

## Good to know

- Lines are matched by their text, so scroll at a normal pace: each read should overlap the previous one.
- Text recognition can misread similar characters (0/O, 1/l). Check **Details** before acting.
- Windows support is written but not tested yet.
- To install on many computers, build an installer with `npm run dist` (it needs code signing for a company rollout).

## For developers

```bash
npm test     # tests on a real text-recognition result
```

| Folder | What's in it |
|---|---|
| `main.js`, `preload.js` | the app: windows, screen reading, live updates |
| `src/` | layout of the read text, label colours, running the checks |
| `ui/` | the window, the region picker and the on-screen marks |
| `ocr/` | small native helpers for text recognition and screen capture |
| `shared/` | the checks, copied from the extension by `scripts/sync-shared.js` |
| `assets/` | logo and icon |

If the extension is cloned next to this folder (`../pii-review-assistant`), `npm start` refreshes `shared/` from it
so both always use the same rules.
