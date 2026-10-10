# Changelog

## Unreleased

- Preserve signs, decimal points, comparison operators and word boundaries when matching reviewed prepared answers.
- Select relevant windows inside long reference chunks and share the excerpt budget across all selected sources.
- Release page sessions on close, expire abandoned sessions after three minutes, cancel retired-page generation and warm only live pages after imports, settings changes or reconnects.
- Synchronize library versions, source lists and prepared answers across open pages after imports, preserving question history and marking answers from older libraries.
- Refresh the library before answering, reject generation against a replaced library, and prevent deep-only retries from mixing new reference material with an old fast answer.

## 2.5.3 — 2026-10-08

Includes the three fixes below plus serialized atomic writes to the same path on Windows. The v2.5.1 and v2.5.2 tags were retained for audit after the Windows atomic-write check and an outdated hardcoded desktop-version assertion failed, respectively. Neither candidate was published. Desktop smoke tests now read the expected project version.

### Changes from 2.5.0

- Refresh account and connection state on every status poll; invalidate warm-ups after AI process failure and reconnect without clearing page history.
- Reserve the complete settings transaction before reading the request body, reject concurrent updates with HTTP 409, restore runtime state on failure, and use unique atomic-save files.
- Isolate fast, deep and translation sessions per page while assigning startup warm-up only to the first page.
- Add process-crash, settings-race, rollback and cross-page context regression tests.
- Update download links and component installation instructions.

## 2.5.0

- Split AI, Office, PDF and Whisper into verified optional components; core has no production dependencies.
- Add transactional installation, pause/resume, manual import, repair, uninstall and rollback.
- Warm answer and translation sessions automatically at startup with visible progress; display the 3-second first-character goal.
- Add seven pinned Whisper model variants, language settings, Unicode text handling and bounded cancellable transcription.


- Restores the original speed/depth design: race two fast models by default, keep the first non-empty responder, and cancel only the losing fast request.
- Reserves GPT-6 Astra for independent deep answers with its catalog-default reasoning effort and a visible model selector; missing Astra requires an explicit choice.
- Replaces generic paired-answer copy and separates the old same-model latency pilot from current behavior.

## 2.4.0 — 2026-10-08

- Adds desktop installers with bundled runtime and Codex, automatic browser launch and an automatically assigned local port.
- Adds in-app account login, cancellation and logout, with a separate persistent desktop account directory.
- Adds local DOCX/PPTX/PDF/text/JSON imports in the page, automatic backups and immediate application.
- Changes the tagline to **会议问答助手 · 面试答题神器**.
- Adds packaging and clean-account startup checks for macOS arm64, macOS x64 and Windows x64.
- Desktop packages are currently unsigned and not notarized.

## 2.3.1 — 2026-10-08

- Renames the project to **ReplyMate（答伴）**.
- Uses **会议问答助手 · 面试答题神器** as the Chinese project tagline.
- Updates the application page, repository links, package metadata and release filenames.
- Keeps paired answers, prepared responses, continuous speech capture, answer history and retries.

## 2.3.0 — 2026-10-08

First public release.

- Supports independent paired answers, Chinese question translation, answer history, retries and continuous capture.
- Includes fictional example data and validated Markdown/text/JSON imports for users' own reference material.
- Discovers models from the user's Codex catalog with configurable model IDs and supported reasoning effort.
- Supports optional local speech recognition with configurable executable and model paths.
- Adds offline demo mode, portable launchers, session recovery, input limits and explicit release packaging.
- Uses an explicit release file list that excludes local user data, credentials, logs and recordings.
