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

- **Live** re-reads the documents when they change — scroll through long documents and it keeps up.
- **Marks** shows or hides the boxes on the documents. Click a finding to make its box pulse.
- Answer each finding with the two buttons; the dashed one is the app's suggestion. **Details** shows why.
- A highlight colour the app doesn't know appears under **Teach label colours** — pick its label once.

## Good to know

- Only the **visible** part of each document is read.
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
