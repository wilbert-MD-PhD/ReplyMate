# Security and privacy

This is a single-user loopback application. It checks Host, Origin, Fetch Metadata and session tokens;
serves only an explicit set of frontend files; and limits request sizes and concurrent answer lanes.
It is not intended as a shared or internet-facing service.

The Codex adapter requests ephemeral sessions, a temporary working directory, read-only sandboxing,
disabled environment access, no app/web/shell tools and no project instructions. It rejects server tool
requests and stops unexpected tool items. This is defense in depth, not a guarantee about every future
Codex version or external provider. Keep your CLI updated and review your own provider settings.

No question or recording logs are written by this application. Imported libraries and their backups live
in `user-data/`. Codex and browser speech services have separate processing and retention rules.
Private imports, credentials and models are excluded by `.gitignore` and the release allowlist.

Report ordinary bugs through GitHub Issues using fictional reproduction data.
Do not post credentials, private presentation notes, account details or recordings in public issues.
For a vulnerability involving sensitive information, use GitHub's private vulnerability reporting if enabled.
