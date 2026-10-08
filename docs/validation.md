# Validation scope

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
