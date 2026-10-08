# Meeting Q&A

A general-purpose open-source edition based on v2.3: paired English answers,
Chinese question translations, prepared responses, live speech capture, and answer history.
The interface is in Chinese and currently targets English presentation Q&A.

[中文说明](README.md) · [Download](https://github.com/wilbert-MD-PhD/meeting-qa-assistant/releases/latest)

## Quick start

Install [Node.js 22+](https://nodejs.org/), download and extract the release ZIP,
then run `npm start`. Open **http://127.0.0.1:8780**.
There are no third-party npm runtime dependencies or frontend build steps.
Launchers: `start.command` (macOS), `sh start.sh` (Linux), `start.bat` (Windows demo).

The default **demo backend does not generate AI answers**. It uses a fictional energy dashboard example.
To enable AI, install [Codex CLI](https://developers.openai.com/codex/cli/), run `codex login`,
copy `.env.example` to `.env`, set `QA_BACKEND=codex`, and restart.
For the Codex backend on Windows, use WSL for the whole application.
The [App Server protocol](https://learn.chatgpt.com/docs/app-server) provides the account model catalog and streamed answers.

Models are discovered from your account. The second answer defaults to a separate session of the same model.
Set `QA_FAST_MODEL` and `QA_SECONDARY_MODEL` to catalog model IDs to choose different ones.
Supported efforts can be set with `QA_FAST_EFFORT` / `QA_SECONDARY_EFFORT`.
Two answers, translations, warm-ups and model races consume your own quota.
A catalog entry is not proof of inference access; a successful request verifies access for that request.

## Your reference material

```sh
npm run import -- "./my-notes.md"
```

Accepts UTF-8 Markdown/text (up to 1 MB) or a [library JSON](docs/library-format.md) (up to 5 MB).
Export Office/PDF contents to text first; manually transcribe figures or formulas.
Imported data goes into ignored `user-data/`, with backups on replacement. Restart and refresh to load it.
A text import clears all example prepared answers. Set `reviewed: true` only for answers you have checked.
The summary uses the first 12,000 characters plus up to three keyword-retrieved excerpts per question.

## Speech and privacy

Manual input works without a microphone. Browser speech recognition depends on browser support
and may send audio to the browser vendor. The demo answer backend alone is offline.
Optional local recognition requires your own [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
server and model, configured through `WHISPER_BIN` and `WHISPER_MODEL`.
No model binaries, private source material, credentials, recordings, or previous account benchmarks are bundled.

The web server binds only to loopback. Questions/audio stay in page memory and disappear on refresh.
In Codex mode, questions, recent questions, ASR alternatives and reference excerpts/context go to your configured model service.
Codex/provider retention rules still apply. Do not deploy this local tool directly on the public internet.

## Development

`npm ci --ignore-scripts`, `npm test`, `npm run check`, `npm run package`.
Release packages use an explicit file allowlist and include SHA-256 checksums.
See [validation scope](docs/validation.md). MIT licensed; separately installed dependencies and models retain their own terms.
