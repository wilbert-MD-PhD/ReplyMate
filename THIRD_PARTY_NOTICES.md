# Third-party components

ReplyMate source is provided under the MIT license. The fictional demo material is included under that license.

Desktop packages bundle these components and retain their license notices:

- [Electron](https://github.com/electron/electron), MIT, including its Chromium and Node.js runtime components and their associated notices.
- [Codex CLI](https://github.com/openai/codex), Apache-2.0. The bundled runtime version is recorded in `codex-version.txt`; the license is included as `CODEX-LICENSE`.
- [officeParser](https://github.com/harshankur/officeParser), MIT, and its dependencies for local document text extraction. Dependency licenses remain in their package directories. OCR is disabled in ReplyMate.

Browser speech recognition is provided by the user's browser and may use that vendor's service. Optional whisper.cpp and speech models are installed separately by source users and retain their own licenses. Model access and account services remain subject to the provider's terms.

This project's license does not replace third-party licenses or grant rights to third-party services, models or accounts.
