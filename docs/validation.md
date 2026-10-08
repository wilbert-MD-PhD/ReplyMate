# Validation scope

## Response latency pilot — 2026-10-08

In a local 20-question source-service test, 14/20 questions (70%) received the first text from either English answer within 3 seconds of request dispatch; 18/20 (90%) did so within 5 seconds. Median time to the first of the two answers was 2.59 seconds. The fast-answer lane alone reached 3 seconds in 9/20 cases (45%). The test used gpt-6.1-sol / low, short fictional reference material, concurrent answer/answer/translation requests, no explicit warm-up and no prepared-answer shortcut. It excludes speech recognition, utterance detection, user queue time and browser rendering. This is a small source-service pilot, not an installer benchmark or a universal latency guarantee. See [method, per-question timings and raw data](latency-benchmark.md).

## 2.4.0 desktop release

Local verification on 2026-10-08 passed 62 automated tests, including account lifecycle and login URL validation, local DOCX/PPTX/PDF extraction, backup preservation, authenticated imports and immediate reference replacement. Browser checks covered the new first-run page, file-picker import and automatic reload, paired demo answers, and opening/cancelling the official login flow in an isolated account directory. No maintainer credentials are included in builds.

The desktop workflow builds macOS arm64, macOS x64 and Windows x64 separately. Each packaged executable must pass a clean-account startup check before its installer is uploaded: the bundled runtime starts the server on an available loopback port, the bundled Codex initializes without a login, the page loads, Word and PDF imports succeed, and the demo answers from the imported text. The check excludes developer runtimes from PATH. These checks do not complete a user's account authorization or measure real microphone recognition.

Installers are currently unsigned and are not Apple-notarized. All three platforms passed the packaged Word/PDF import, demo-answer and shutdown checks in [GitHub Actions run 37742647444](https://github.com/wilbert-MD-PhD/ReplyMate/actions/runs/37742647444). The same application code is rebuilt and checked again for release attachments. A successful build is not a claim of universal OS, browser, account or microphone compatibility.

## Earlier public release checks

The checks below were recorded on 2026-10-08 for the 2.3.0 public release, using fictional example data. Local verification passed 54 automated tests. Real Codex requests completed both English answer lanes and the Chinese translation for an unprepared question. Browser checks verified prepared answers, a second manual question, editing/retrying, and selecting the retained original answer version. The 2.3.1 release updates the project name, links and package filenames.

- Automated tests cover capture continuity, question queues, history, retry isolation, paired lanes,
  model race cancellation, exact prepared matching, imports, effort selection, SSE decoding,
  loopback server behavior, session recovery and private-file isolation.
- The live Codex adapter is checked separately from the offline demo.
- Browser QA covers the rendered page, prepared answers, manual questions, paired output,
  history navigation and edited-question retries.
- Release checks scan the explicit package allowlist for common credentials and personal paths.
  A maintainer must also review content before each release; regex checks cannot identify every private fact.

Real microphone hardware, representative accents, every browser speech service, and every Whisper
model/platform combination are not covered by the automated tests. No universal latency guarantee is made.
GitHub Actions checks Node.js 22/24 on macOS, Linux and Windows. Remote CI results are available in the repository Actions tab.
