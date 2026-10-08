# ReplyMate · 答伴

**会议问答助手 · 面试答题神器** — your companion for meeting Q&A and interview practice.

Prepare spoken-style English answers from your own reference material. ReplyMate offers two independently streamed answers, Chinese question translations, prepared responses and answer history. The interface is in Chinese.

**In a local 20-question pilot, 70% of questions began receiving an AI answer within 3 seconds.** Measured from request dispatch to the first returned text from either English answer, using gpt-6.1-sol / low and short English reference material, with both answers and translation running concurrently. Excludes speech recognition, utterance detection and queue time. [Method and full results](docs/latency-benchmark.md).

[Download the desktop app](https://github.com/wilbert-MD-PhD/ReplyMate/releases/latest) · [中文说明](README.md)

## Download and open

Choose the macOS DMG for Apple Silicon or Intel, or the Windows x64 installer. On Mac, drag ReplyMate into Applications and open it. On Windows, run the installer; the app opens automatically and adds a desktop shortcut.

ReplyMate opens in your default browser. The runtime and Codex component are bundled: **no Node.js installation, terminal commands or configuration files are needed**.

Try the fictional sample immediately without signing in. To use AI with your material:

1. Click **登录 ChatGPT** and authorize on the official sign-in page. The app connects automatically and remembers your session.
2. Click **选择资料**, or drop a file into the import area.
3. Type an English question and click **立即回答**. Voice capture is available in supported browsers.

These packages do not yet have developer certificate signing or Apple notarization. Your operating system may show a first-run security prompt; managed computers may block unsigned apps.

## Import your material

Accepts DOCX, PPTX, PDF, Markdown, TXT and [reference-library JSON](docs/library-format.md). Import one file at a time, up to 20 MB. Extracted text is limited to 1 MB and library JSON to 5 MB.

Documents are parsed locally and applied immediately. Text extraction does not recognize scanned images or interpret charts. A failed import preserves the current library. Replacing material backs up the old library and reloads the page, clearing the current Q&A. Copy any answers you need first.

Document imports clear sample prepared responses. For your own prepared responses, import a library JSON and mark only checked answers as `reviewed: true`. The summary uses the first 12,000 text characters, with up to three keyword-matched excerpts per question. Retrieval currently uses English keywords.

## Accounts, speech and privacy

AI requires Codex access and available quota on your account. Answers, translations, optional warm-ups and model races use your quota. The app selects an available catalog model automatically; individual inference access still depends on your account.

The desktop app stores references, backups and account state in its own application-data directory. It uses the bundled official [Codex App Server](https://learn.chatgpt.com/docs/app-server) for authentication and inference. You do not enter passwords or paste tokens into ReplyMate.

The local server uses a dynamically assigned loopback port. Q&A and recordings stay in page memory and disappear when the page closes or reloads. In AI mode, questions, recent questions, transcription alternatives and relevant reference context are sent to the model service, whose retention rules apply.

Browser speech recognition depends on browser and device support and may send audio to the browser vendor. Try Chrome or Edge; typing is always available. The demo answer backend is offline, but browser speech capture may not be.

Use **退出答伴** at the bottom of the page or the tray/menu-bar menu to quit the app. Closing the browser tab leaves the app running. Signing out of ReplyMate does not delete your reference material.

## Development

For source use, install Node.js 22.13+, run `npm ci --ignore-scripts`, then `npm start`. Install Codex CLI to enable the sign-in button in a source checkout. Desktop downloads already include it.

Run `npm test`, `npm run check`, and `npm run package` for source verification and packaging. Run `node node_modules/electron/install.js`, then `npm run desktop:build` for a desktop build. CI builds and smoke-tests macOS arm64, macOS x64 and Windows x64 separately.

See [development notes](docs/development.md), [validation scope](docs/validation.md) and [third-party notices](THIRD_PARTY_NOTICES.md). MIT licensed; bundled components and services retain their own licenses and terms.
